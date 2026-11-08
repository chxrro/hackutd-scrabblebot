// Enhanced ScrabbleBot live adapter. See ../README.md for safe setup.
// No credential is saved unless SAVE_BOT_TOKEN=1 is explicitly set.
// Tournament mode stays out of ordinary lobbies so organizers can start it.

import {
  DbConnection,
  type EventContext,
  type ErrorContext,
} from "./module_bindings/index.js";
import { Identity } from "spacetimedb";
import type { Auction, Match, MatchParticipant } from "./module_bindings/types.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { wordReward } from "./strategy.js";
import { newMatchPolicy, policyName, prepare, type MatchPolicy } from "./policy.js";
import { fileURLToPath } from "node:url";

const HOST = process.env.STDB_HOST ?? "https://maincloud.spacetimedb.com";
const DB_NAME = process.env.STDB_DB ?? "scrabblebot";
const BOT_NAME = process.env.BOT_NAME ?? "hackutd-bot";
if (!/^[a-zA-Z0-9_-]{1,64}$/.test(BOT_NAME)) throw new Error("BOT_NAME must contain only letters, numbers, underscore or hyphen");
const BOT_TOKEN = process.env.BOT_TOKEN; // from the website, first run only
const TOURNAMENT_ID = process.env.TOURNAMENT_ID;
const AUTO_JOIN_LOBBY = process.env.AUTO_JOIN_LOBBY !== "0" && !TOURNAMENT_ID;
if (TOURNAMENT_ID && !/^\d+$/.test(TOURNAMENT_ID)) throw new Error("TOURNAMENT_ID must be a numeric tournament ID");
const TOKEN_PATH = process.env.BOT_TOKEN_FILE ?? path.join(process.cwd(), `.token-${BOT_NAME}`);

function loadToken(): string | undefined {
  try {
    return fs.readFileSync(TOKEN_PATH, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}
function saveToken(tok: string) {
  // Opt-in only. Never persist a credential without the operator requesting it.
  if (process.env.SAVE_BOT_TOKEN === "1") fs.writeFileSync(TOKEN_PATH, tok, { mode: 0o600 });
}

// Load the shared wordlist so the bot can pick playable words locally.
const dictionaryPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "spacetimedb",
  "wordlist.txt",
);
const DICTIONARY: string[] = fs.existsSync(dictionaryPath)
  ? fs
      .readFileSync(dictionaryPath, "utf8")
      .split("\n")
      .map((l) => l.trim().toUpperCase())
      .filter((l) => l.length >= 2)
  : [];
DICTIONARY.sort((a, b) => b.length - a.length);
if (DICTIONARY.length < 100000) throw new Error("Missing or incomplete ENABLE dictionary");
prepare(DICTIONARY);
const POLICY = policyName();
console.log(`[${BOT_NAME}] indexed ${DICTIONARY.length} dictionary words; policy=${POLICY}`);
// One policy per match (the pacer tracks public clearing prices for its match).
const policies = new Map<string, MatchPolicy>();
function policyFor(matchId: bigint): MatchPolicy {
  const key = String(matchId);
  let p = policies.get(key);
  if (!p) { p = newMatchPolicy(POLICY); policies.set(key, p); }
  return p;
}
function inMatch(_conn: DbConnection, matchId: bigint): boolean {
  return myBotId !== null && myParticipants.has(String(matchId));
}

// The SDK client cache has no real indexes: even `table.id.find()` scans the
// whole table (see TableCacheImpl#makeReadonlyIndex "TODO: this just scans").
// On the hosted database (every historical match/auction/result is public and
// subscribed) that made each decision O(rows). Keep our own keyed views,
// rebuilt once on subscription and maintained from row callbacks.
type MatchRow = Match;
type AuctionRow = Auction;
type ParticipantRow = MatchParticipant;
const matchesById = new Map<string, MatchRow>();
const openAuctions = new Map<string, AuctionRow>();
const myParticipants = new Map<string, ParticipantRow>();
function indexMatch(m: MatchRow) { matchesById.set(String(m.id), m); }
function indexAuction(a: AuctionRow) {
  if (a.status.tag === "Open") openAuctions.set(String(a.id), a);
  else openAuctions.delete(String(a.id));
}
function indexParticipant(p: ParticipantRow) {
  if (myBotId !== null && p.botId === myBotId) myParticipants.set(String(p.matchId), p);
}
function rebuildIndexes(conn: DbConnection) {
  matchesById.clear(); openAuctions.clear(); myParticipants.clear();
  for (const m of conn.db.matchState.iter()) indexMatch(m);
  for (const a of conn.db.auction.iter()) if (a.status.tag === "Open") indexAuction(a);
  for (const p of conn.db.matchParticipant.iter()) indexParticipant(p);
}
function findMatch(matchId: bigint): MatchRow | undefined { return matchesById.get(String(matchId)); }

// Round-trip estimate from our own reducer calls (EWMA). Hosted RTT can be
// 50-300 ms; the bid deadline guard must cover a full round trip because our
// "first seen" time already lags the server's opensAt by one network leg.
let rttMs = 100;
function noteRtt(startedMs: number) {
  const sample = Date.now() - startedMs;
  if (sample >= 0 && sample < 5000) rttMs = 0.8 * rttMs + 0.2 * sample;
}
function bidGuardMs(): number { return Math.max(100, Math.round(rttMs) + 60); }

let myIdentity: Identity | null = null;
let myBotId: bigint | null = null;
const bidsByAuction = new Set<string>();
const firstSeenMs = new Map<string, number>();
const lastWordAttemptByMatch = new Map<string, number>();
const WORD_RETRY_MS = 120;
const wordInFlight = new Set<string>();
let activityTimer: ReturnType<typeof setInterval> | undefined;
let reconnectAttempt = 0;
let stopping = false;
let activeConnection: DbConnection | undefined;

function resolveMyBotId(conn: DbConnection): bigint | null {
  if (!myIdentity) return null;
  const cred = conn.db.botCredential.identity.find(myIdentity);
  return cred ? cred.botId : null;
}

function rackForMatch(
  conn: DbConnection,
  matchId: bigint,
): Map<string, number> {
  const rack = new Map<string, number>();
  for (const h of conn.db.myRack.iter()) {
    if (h.matchId !== matchId) continue;
    rack.set(h.letter, (rack.get(h.letter) ?? 0) + h.count);
  }
  return rack;
}

function participantForMatch(
  conn: DbConnection,
  matchId: bigint,
): { balance: number; score: number } | null {
  if (myBotId === null) return null;
  const p = myParticipants.get(String(matchId));
  return p ? { balance: Number(p.balance), score: Number(p.score) } : null;
}

// A reducer call fails when the module refuses it, often for an expected
// reason: a word played just after its match ended, a bid that missed the
// auction's window. Log it and keep playing; an uncaught failure would stop
// the bot.
function logFailure(what: string) {
  return (err: unknown) =>
    console.warn(
      `[${BOT_NAME}] ${what} failed: ${err instanceof Error ? err.message : err}`,
    );
}

function tryBid(
  conn: DbConnection,
  auctionId: bigint,
  matchId: bigint,
  letter: string,
) {
  if (myBotId === null) return;
  const key = `${matchId}:${auctionId}`;
  if (bidsByAuction.has(key)) return;
  const participant = participantForMatch(conn, matchId);
  if (!participant) return;
  const match = findMatch(matchId);
  if (!match || match.status.tag !== "Running") return;
  const auction = openAuctions.get(String(auctionId));
  if (!auction) return;
  // Deadline check on our own clock, measured from when we first saw the auction, so a
  // skewed local clock cannot make us skip every bid (server and local clocks differ).
  const key0 = String(auctionId);
  if (!firstSeenMs.has(key0)) firstSeenMs.set(key0, Date.now());
  const windowMs = Number(auction.closesAt.microsSinceUnixEpoch - auction.opensAt.microsSinceUnixEpoch) / 1000;
  const deadline = firstSeenMs.get(key0)! + windowMs - bidGuardMs();
  if (Date.now() > deadline) return;
  // Prefer bidding after an in-flight word lands (fresh balance/rack), but never let a
  // chain of words at high RTT starve the bid: once there is no time left to wait for
  // another word round trip, bid with the state we have (balance only grows with words).
  if (wordInFlight.has(String(matchId)) && Date.now() < deadline - (rttMs + 150)) return;
  const amount = policyFor(matchId).decideBid({
    letter,
    myBalance: participant.balance,
    myRack: rackForMatch(conn, matchId),
    dictionary: DICTIONARY,
    bagRemaining: match.bagTotal,
    auctionType: match.auctionType.tag,
  });
  if (amount <= 0) return;
  const bidStarted = Date.now();
  conn.reducers
    .submitBid({ auctionId, amount: BigInt(amount) })
    .then(() => noteRtt(bidStarted))
    .catch((err: unknown) => { bidsByAuction.delete(key); logFailure(`bid on auction ${auctionId}`)(err); });
  bidsByAuction.add(key);
  console.log(
    `[${BOT_NAME}] bid ${amount} on '${letter}' (match ${matchId}, auction ${auctionId})`,
  );
}

function tryPlayWord(conn: DbConnection) {
  if (myBotId === null) return;
  // Only matches still being played. The bot keeps its letters from
  // matches that have ended, but can't play them.
  const matches = new Set<bigint>();
  for (const p of myParticipants.values()) {
    if (findMatch(p.matchId)?.status.tag === "Running") matches.add(p.matchId);
  }
  const now = Date.now();
  for (const matchId of matches) {
    const key = String(matchId);
    if (wordInFlight.has(key) || now - (lastWordAttemptByMatch.get(key) ?? 0) < WORD_RETRY_MS) continue;
    lastWordAttemptByMatch.set(key, now);
    const word = policyFor(matchId).chooseWord({
      myRack: rackForMatch(conn, matchId),
      dictionary: DICTIONARY,
      myBalance: participantForMatch(conn, matchId)?.balance,
      bagRemaining: findMatch(matchId)?.bagTotal,
      auctionType: findMatch(matchId)?.auctionType.tag,
    } as Parameters<MatchPolicy["chooseWord"]>[0]);
    if (!word) continue;
    console.log(`[${BOT_NAME}] match ${matchId}: playing '${word}' for ${wordReward(word)} points`);
    wordInFlight.add(key);
    const wordStarted = Date.now();
    conn.reducers
      .submitWord({ matchId, word })
      .then(() => noteRtt(wordStarted))
      .catch(logFailure(`playing '${word}'`))
      .finally(() => {
        setTimeout(() => {
          wordInFlight.delete(key);
          // Continue liquidation / the deferred bid now instead of waiting for the next tick.
          if (conn !== activeConnection) return;
          safely("post-word", () => {
            tryPlayWord(conn);
            for (const a of openAuctions.values()) if (a.matchId === matchId) tryBid(conn, a.id, a.matchId, a.letter);
          });
        }, 80);
      });
  }
}

function onConnect(conn: DbConnection, identity: Identity, token: string) {
  activeConnection = conn;
  reconnectAttempt = 0;
  myIdentity = identity;
  saveToken(token);
  console.log(`[${BOT_NAME}] connected as ${identity.toHexString()}`);

  conn
    .subscriptionBuilder()
    .onApplied(() => {
      console.log(`[${BOT_NAME}] subscription applied`);

      myBotId = resolveMyBotId(conn);
      if (myBotId === null) {
        console.error(`[${BOT_NAME}] no BotCredential for this token. Verify the team token and database with the organizers.`);
        process.exit(1);
      }

      rebuildIndexes(conn);
      const bot = conn.db.bot.id.find(myBotId);
      console.log(
        `[${BOT_NAME}] acting as bot '${bot?.name ?? "?"}' (id ${myBotId})`,
      );
      bootstrapActivity(conn);
    })
    .subscribeToAllTables();

  conn.db.matchState.onInsert((_ctx, m) => indexMatch(m));
  conn.db.matchState.onDelete((_ctx, m) => { matchesById.delete(String(m.id)); });
  conn.db.auction.onUpdate((_ctx, _old, a) => indexAuction(a));
  conn.db.auction.onDelete((_ctx, a) => { openAuctions.delete(String(a.id)); });
  conn.db.matchParticipant.onInsert((_ctx, p) => indexParticipant(p));
  conn.db.matchParticipant.onUpdate((_ctx, _old, p) => indexParticipant(p));
  conn.db.matchParticipant.onDelete((_ctx, p) => {
    if (myBotId !== null && p.botId === myBotId && myParticipants.get(String(p.matchId))?.id === p.id) myParticipants.delete(String(p.matchId));
  });
  conn.db.auction.onInsert((_ctx: EventContext, a) => {
    indexAuction(a);
    if (a.status.tag === "Open") {
      if (!firstSeenMs.has(String(a.id))) firstSeenMs.set(String(a.id), Date.now());
      if (firstSeenMs.size > 5000) firstSeenMs.clear();
      setImmediate(() => safely("auction insert", () => { tryPlayWord(conn); tryBid(conn, a.id, a.matchId, a.letter); }));
    }
  });
  // Defer until the full subscription transaction has applied.
  const queueWords = () => setImmediate(() => safely("rack update", () => tryPlayWord(conn)));
  conn.db.myRack.onInsert(queueWords);
  conn.db.myRack.onUpdate(queueWords);
  conn.db.myRack.onDelete(queueWords);
  conn.db.botCredential.onInsert(() => {
    if (myBotId === null) myBotId = resolveMyBotId(conn);
  });
  conn.db.auctionResult.onInsert((_ctx, r) => {
    if (myBotId === null) return;
    if (!inMatch(conn, r.matchId)) return;
    // Public clearing price for the pacer; deduplicated by auction id (safe on reconnect replays).
    policyFor(r.matchId).observe(String(r.auctionId), r.letter, r.winnerBotId !== undefined && r.winnerBotId !== null, Number(r.paid));
    const winner =
      r.winnerBotId !== undefined && r.winnerBotId !== null
        ? String(r.winnerBotId)
        : "no-bid";
    console.log(
      `[${BOT_NAME}] match ${r.matchId} auction ${r.auctionId} '${r.letter}' → bot ${winner} paid ${r.paid}`,
    );
  });

  // When a match this bot was in ends, hop back into the lobby.
  conn.db.matchState.onUpdate((_ctx, old, neu) => {
    indexMatch(neu);
    if (myBotId === null) return;
    if (old.status.tag !== "Ended" && neu.status.tag === "Ended") {
      const wasIn = myParticipants.has(String(neu.id));
      if (wasIn) {
        for (const key of bidsByAuction) if (key.startsWith(`${neu.id}:`)) bidsByAuction.delete(key);
        lastWordAttemptByMatch.delete(String(neu.id));
        wordInFlight.delete(String(neu.id));
        policies.delete(String(neu.id));
        console.log(`[${BOT_NAME}] match ${neu.id} ended; rejoining lobby`);
        joinLobby(conn);
      }
    }
  });
}

function joinLobby(conn: DbConnection) {
  if (myBotId === null || !AUTO_JOIN_LOBBY) return;
  const inRunning = Array.from(myParticipants.values()).some(
    (p) => findMatch(p.matchId)?.status.tag === "Running",
  );
  if (inRunning) return;
  const openLobby = Array.from(conn.db.lobby.iter()).find(
    (l) => l.status.tag === "Open",
  );
  const alreadyIn =
    openLobby !== undefined &&
    Array.from(conn.db.lobbyMember.iter()).some(
      (lm) => lm.lobbyId === openLobby.id && lm.botId === myBotId,
    );
  if (alreadyIn) return;
  console.log(`[${BOT_NAME}] joining lobby`);
  conn.reducers.joinLobby({}).catch(logFailure("joining the lobby"));
}

function bootstrapActivity(conn: DbConnection) {
  if (activityTimer) clearInterval(activityTimer);
  // Replay public results of running matches we are in (initial rows arrive before myBotId is known).
  for (const r of conn.db.auctionResult.iter()) {
    if (!inMatch(conn, r.matchId) || findMatch(r.matchId)?.status.tag !== "Running") continue;
    policyFor(r.matchId).observe(String(r.auctionId), r.letter, r.winnerBotId !== undefined && r.winnerBotId !== null, Number(r.paid));
  }
  activityTimer = setInterval(() => safely("activity tick", () => {
    // Re-evaluate even if our rack did not change: the bag is approaching zero.
    tryPlayWord(conn);
    for (const a of openAuctions.values()) tryBid(conn, a.id, a.matchId, a.letter);
  }), 150);
  if (TOURNAMENT_ID) {
    conn.reducers
      .registerForTournament({ tournamentId: BigInt(TOURNAMENT_ID) })
      .then(() =>
        console.log(`[${BOT_NAME}] registered for tournament ${TOURNAMENT_ID}`),
      )
      .catch(logFailure(`registering for tournament ${TOURNAMENT_ID}`));
  }
  joinLobby(conn);
  tryPlayWord(conn);
  for (const a of openAuctions.values()) tryBid(conn, a.id, a.matchId, a.letter);
  tryPlayWord(conn);
}

// A thrown error inside a timer or SDK callback would otherwise crash the process
// mid-tournament with nobody to restart it. Log and keep playing.
function safely(what: string, fn: () => void) {
  try { fn(); } catch (err) {
    console.error(`[${BOT_NAME}] ${what} threw: ${err instanceof Error ? err.stack ?? err.message : err}`);
  }
}

function main() {
  const token = BOT_TOKEN ?? loadToken();
  if (!token) {
    console.error("No token configured. Offline checks need no account: npm test; npm run demo. For live play, create your team/token yourself and set BOT_TOKEN_FILE. Never paste the token in chat.");
    process.exitCode = 1;
    return;
  }
  console.log(`[${BOT_NAME}] connecting to ${DB_NAME} at ${HOST}`);
  DbConnection.builder()
    .withUri(HOST)
    .withDatabaseName(DB_NAME)
    .withToken(token)
    .onConnect(onConnect)
    .onConnectError((_ctx: ErrorContext, err: Error) => {
      // Without automatic reconnect the SDK reports a failed (re)connect attempt
      // only here, never via onDisconnect, so we must retry from here too or a
      // single failed reconnect leaves the bot offline for the rest of the event.
      console.error("connect error:", err.message);
      scheduleReconnect("connect failed");
    })
    .onDisconnect(() => scheduleReconnect("disconnected"))
    .build();
}

let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleReconnect(why: string) {
  if (activityTimer) clearInterval(activityTimer);
  activityTimer = undefined;
  activeConnection = undefined;
  wordInFlight.clear();
  if (stopping || reconnectTimer) return;
  const delay = Math.min(30000, 1000 * 2 ** Math.min(reconnectAttempt++, 5));
  console.log(`[${BOT_NAME}] ${why}; retrying in ${delay} ms`);
  reconnectTimer = setTimeout(() => { reconnectTimer = undefined; main(); }, delay);
}

process.on("unhandledRejection", (err) => {
  console.error(`[${BOT_NAME}] unhandled rejection: ${err instanceof Error ? err.message : err}`);
});
process.on("uncaughtException", (err) => {
  console.error(`[${BOT_NAME}] uncaught exception: ${err.stack ?? err.message}`);
});

process.on("SIGINT", () => { stopping = true; if (activityTimer) clearInterval(activityTimer); activeConnection?.disconnect(); process.exit(0); });
main();

