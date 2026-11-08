/** Real SpacetimeDB WebSocket clients. No mock server and no persisted client tokens. */
import { DbConnection } from "./module_bindings/index.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { spawn, type ChildProcess } from "node:child_process";
import assert from "node:assert/strict";
import {
  CanonicalDictionary,
  type StatefulAgent,
} from "../policies/arena_v2.js";
import { league } from "../policies/league.js";
import { original, model } from "../policies/arena.js";
import { LEARNED_PARAMETERS } from "../policies/learned_policy.js";
import type { Context } from "../policies/original_simulator.js";
import { prepareDictionary } from "../policies/original_strategy.js";
import { prepareDictionary as prepareParametric } from "../policies/parametric_strategy.js";

const HOST = process.env.STDB_HOST ?? "http://127.0.0.1:3300",
  DB = process.env.STDB_DB ?? "scrabblebot-practice";
const parsed = new URL(HOST);
if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname))
  throw Error("Practice launcher refuses non-loopback hosts.");
if (process.env.PRACTICE_ADAPTER === "1" && process.env.PRACTICE_POLICY)
  throw Error(
    "PRACTICE_ADAPTER tests the preserved baseline only; omit PRACTICE_POLICY.",
  );
const testing = process.argv.includes("--test"),
  timeoutMs = Number(process.env.PRACTICE_TIMEOUT_MS ?? 180000);
const dictionary = new CanonicalDictionary(
  readFileSync(
    new URL("../upstream/spacetimedb/wordlist.txt", import.meta.url),
    "utf8",
  ).split("\n"),
);
prepareDictionary(dictionary.words);
prepareParametric(dictionary.words);
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, reason: string, ms = 10000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw Error(`Timed out: ${reason}`);
    await delay(20);
  }
}
const report = {
  kind: "real SpacetimeDB integration",
  serverVersion: "2.14.1",
  upstreamCommit: "b5ccb36aa238ad16692f8d6af54da15ef9f11324",
  started: new Date().toISOString(),
  completed: "",
  dictionaryWords: dictionary.words.length,
  checks: [] as string[],
  rejected: [] as { test: string; message: string }[],
  actions: { bids: 0, words: 0, unexpectedErrors: [] as string[] },
  latenciesMs: [] as number[],
  matches: [] as any[],
  reconnections: 0,
};
const all = new Set<DbConnection>();
let stopping = false;
type Connected = { conn: DbConnection; token: string; identityHex: string };
async function connect(token?: string): Promise<Connected> {
  return new Promise((resolve, reject) => {
    let builder = DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DB)
      .onConnect((conn, identity, token) => {
        all.add(conn);
        conn
          .subscriptionBuilder()
          .onApplied(() =>
            resolve({ conn, token, identityHex: identity.toHexString() }),
          )
          .onError((ctx) =>
            reject(ctx.event ?? new Error("Subscription failed")),
          )
          .subscribeToAllTables();
      })
      .onConnectError((_ctx, error) => reject(error));
    if (token) builder = builder.withToken(token);
    builder.build();
  });
}
async function rejected(name: string, promise: Promise<unknown>, part: string) {
  try {
    await promise;
    throw Error(`Expected rejection: ${name}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    assert.ok(
      message.toLowerCase().includes(part.toLowerCase()),
      `${name}: ${message}`,
    );
    report.rejected.push({ test: name, message });
  }
}
class Bot {
  connection!: Connected;
  id!: bigint;
  busy = false;
  enabled = false;
  bidDone = new Set<string>();
  lastWord = 0;
  timer?: ReturnType<typeof setInterval>;
  matches = new Set<string>();
  constructor(
    public name: string,
    public factory: () => StatefulAgent,
    public agent = factory(),
  ) {}
  get c() {
    return this.connection.conn;
  }
  async start() {
    this.connection = await connect();
    await this.c.reducers.createTeam({
      teamName: `practice-${this.name}`,
      botName: this.name,
    });
    await this.c.reducers.mintCredentialNonce({});
    await until(
      () => Array.from(this.c.db.myNonces.iter()).length > 0,
      "local nonce",
    );
    const nonce = Array.from(this.c.db.myNonces.iter())[0];
    await this.c.reducers.claimCredential({ code: nonce.code });
    await until(
      () => !!this.c.db.botCredential.identity.find(this.c.identity!),
      "credential visible",
    );
    this.id = this.c.db.botCredential.identity.find(this.c.identity!)!.botId;
    this.handlers();
  }
  handlers() {
    this.c.db.auction.onInsert(() => {
      setImmediate(() => this.tick());
    });
    const queue = () => setImmediate(() => this.tick());
    this.c.db.myRack.onInsert(queue);
    this.c.db.myRack.onUpdate(queue);
    this.c.db.auctionResult.onInsert((_ctx, e) => {
      const m = this.c.db.matchState.id.find(e.matchId);
      this.agent.observe?.({
        round: m?.currentRound ?? 0,
        letter: e.letter,
        winner: e.winnerBotId === undefined ? null : Number(e.winnerBotId),
        paid: Number(e.paid),
        bagRemaining: m?.bagTotal ?? 0,
      });
    });
    this.timer = setInterval(() => this.tick(), 100);
  }
  context(matchId: bigint, letter: string): Context | null {
    const match = this.c.db.matchState.id.find(matchId),
      p = Array.from(this.c.db.matchParticipant.iter()).find(
        (p) => p.matchId === matchId && p.botId === this.id,
      );
    if (!p || match?.status.tag !== "Running") return null;
    const myRack = new Map<string, number>();
    for (const h of this.c.db.myRack.iter())
      if (h.matchId === matchId)
        myRack.set(h.letter, (myRack.get(h.letter) ?? 0) + h.count);
    return {
      letter,
      myRack,
      myBalance: Number(p.balance),
      bagRemaining: match.bagTotal,
      auctionType: match.auctionType.tag,
      dictionary: dictionary.words,
    };
  }
  async action(kind: "bids" | "words", fn: () => Promise<unknown>) {
    const start = performance.now();
    try {
      await fn();
      report.actions[kind]++;
      report.latenciesMs.push(performance.now() - start);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (
        /Auction closed|Auction window expired|Match not running/.test(message)
      ) {
        report.rejected.push({ test: "natural boundary race", message });
      } else report.actions.unexpectedErrors.push(`${this.name}: ${message}`);
    }
  }
  async tick() {
    if (stopping || !this.enabled || this.busy) return;
    this.busy = true;
    try {
      for (const a of this.c.db.auction.iter()) {
        if (a.status.tag !== "Open") continue;
        const ctx = this.context(a.matchId, a.letter);
        if (!ctx) continue;
        const key = String(a.id);
        if (Date.now() - this.lastWord >= 100) {
          const word = this.agent.word(ctx);
          if (word) {
            this.lastWord = Date.now();
            await this.action("words", () =>
              this.c.reducers.submitWord({ matchId: a.matchId, word }),
            );
          }
        }
        if (
          this.bidDone.has(key) ||
          Number(a.closesAt.microsSinceUnixEpoch / 1000n) <= Date.now() + 100
        )
          continue;
        const fresh = this.context(a.matchId, a.letter);
        if (!fresh) continue;
        const bid = this.agent.bid(fresh);
        assert.ok(
          Number.isSafeInteger(bid) && bid >= 0 && bid <= fresh.myBalance,
          "policy produced illegal bid",
        );
        this.bidDone.add(key);
        if (bid > 0)
          await this.action("bids", () =>
            this.c.reducers.submitBid({ auctionId: a.id, amount: BigInt(bid) }),
          );
      }
    } catch (e) {
      report.actions.unexpectedErrors.push(`${this.name}: ${String(e)}`);
    } finally {
      this.busy = false;
    }
  }
  async reconnect() {
    this.enabled = false;
    await until(() => !this.busy, "quiesce before reconnect");
    if (this.timer) clearInterval(this.timer);
    const previous = this.c;
    previous.disconnect();
    all.delete(previous);
    this.connection = await connect(this.connection.token);
    assert.equal(
      this.c.db.botCredential.identity.find(this.c.identity!)!.botId,
      this.id,
    );
    this.handlers();
    this.enabled = true;
    report.reconnections++;
  }
  stop() {
    this.enabled = false;
    if (this.timer) clearInterval(this.timer);
    this.c.disconnect();
    all.delete(this.c);
  }
}
let focusFactory: () => StatefulAgent = () => original;
if (process.env.PRACTICE_POLICY) {
  const loaded = await import(
    pathToFileURL(resolve(process.env.PRACTICE_POLICY)).href
  );
  loaded.prepareDictionary?.(dictionary.words);
  assert.equal(typeof loaded.decideBid, "function");
  assert.equal(typeof loaded.chooseWord, "function");
  focusFactory = () => ({
    name: "challenger",
    bid: loaded.decideBid,
    word: loaded.chooseWord,
  });
}
const opponentFactories = league("frontier-mixed", dictionary);
const bots = [
  new Bot(
    process.env.PRACTICE_POLICY ? "challenger" : "baseline",
    focusFactory,
  ),
  ...opponentFactories.map((f, i) => new Bot(`opponent-${i + 1}`, f)),
];
let observer: Connected | undefined;
let adapter: ChildProcess | undefined;
let adapterExit: Promise<number | null> | undefined;
let adapterLog = "";
function save() {
  mkdirSync("reports", { recursive: true });
  const sorted = [...report.latenciesMs].sort((a, b) => a - b);
  const output = {
    ...report,
    latenciesMs: undefined,
    latencySummaryMs: {
      n: sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      max: sorted.at(-1) ?? 0,
    },
  };
  writeFileSync(
    "reports/live-integration.json",
    JSON.stringify(output, null, 2) + "\n",
  );
}
function close() {
  stopping = true;
  adapter?.kill("SIGINT");
  for (const b of bots) if (b.connection) b.stop();
  for (const c of all) c.disconnect();
  save();
}
process.on("SIGINT", () => {
  close();
  setTimeout(() => process.exit(0), 750);
});
process.on("SIGTERM", () => {
  close();
  setTimeout(() => process.exit(0), 750);
});
try {
  observer = await connect();
  await rejected(
    "uncredentialed lobby entry",
    observer.conn.reducers.joinLobby({}),
    "not a credential",
  );
  for (const bot of bots) await bot.start();
  assert.equal(Array.from(observer.conn.db.myRack.iter()).length, 0);
  report.checks.push("Anonymous observer sees no private rack");
  const denied = await new Promise<boolean>((resolve) => {
    observer!.conn
      .subscriptionBuilder()
      .onError(() => resolve(true))
      .onApplied(() => resolve(false))
      .subscribe(["SELECT * FROM holding"]);
  });
  assert.equal(denied, true);
  report.checks.push("Direct subscription to private Holding table denied");
  for (const bot of bots) await bot.c.reducers.joinLobby({});
  await until(
    () =>
      Array.from(bots[0].c.db.matchState.iter()).some(
        (m) =>
          m.status.tag === "Running" &&
          Array.from(bots[0].c.db.matchParticipant.iter()).some(
            (p) => p.matchId === m.id && p.botId === bots[0].id,
          ),
      ),
    "six-bot match",
  );
  const c = bots[0].c,
    match = Array.from(c.db.matchState.iter()).find(
      (m) =>
        m.status.tag === "Running" &&
        Array.from(c.db.matchParticipant.iter()).some(
          (p) => p.matchId === m.id && p.botId === bots[0].id,
        ),
    )!;
  const a = Array.from(c.db.auction.iter()).find(
    (a) => a.matchId === match.id && a.status.tag === "Open",
  )!;
  await rejected(
    "negative bid",
    c.reducers.submitBid({ auctionId: a.id, amount: -1n }),
    "non-negative",
  );
  await rejected(
    "over-budget bid",
    c.reducers.submitBid({ auctionId: a.id, amount: 1000000n }),
    "Insufficient balance",
  );
  await rejected(
    "one-letter word",
    c.reducers.submitWord({ matchId: match.id, word: "A" }),
    "at least 2",
  );
  await rejected(
    "non-ASCII word",
    c.reducers.submitWord({ matchId: match.id, word: "ÉT" }),
    "A-Z",
  );
  assert.ok(dictionary.valid.has("JAZZ"));
  await rejected(
    "valid word requiring unavailable tiles",
    c.reducers.submitWord({ matchId: match.id, word: "JAZZ" }),
    "Not enough",
  );
  for (const bot of bots) {
    assert.equal(
      Array.from(bot.c.db.myRack.iter())
        .filter((h) => h.matchId === match.id)
        .reduce((sum, h) => sum + h.count, 0),
      5,
    );
    bot.enabled = true;
  }
  if (process.env.PRACTICE_ADAPTER === "1") {
    bots[0].enabled = false;
    const spawnAdapter = () => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", process.env.PRACTICE_ADAPTER_ENTRY ?? "bot-starter/src/index.ts"],
        {
          env: {
            ...process.env,
            STDB_HOST: process.env.PRACTICE_ADAPTER_HOST ?? HOST,
            STDB_DB: DB,
            BOT_NAME: "baseline",
            BOT_TOKEN: bots[0].connection.token,
            SAVE_BOT_TOKEN: "0",
            AUTO_JOIN_LOBBY: "0",
            BOT_TOKEN_FILE: "/nonexistent/practice-token",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      child.stdout?.on("data", (d) => (adapterLog += String(d)));
      child.stderr?.on("data", (d) => (adapterLog += String(d)));
      return child;
    };
    adapter = spawnAdapter();
    adapterExit = new Promise((resolve) => adapter!.on("exit", (code) => resolve(code)));
    // Optional crash/restart test: SIGKILL the adapter mid-match, restart it with the same token.
    const restartMs = Number(process.env.PRACTICE_ADAPTER_RESTART_MS ?? 0);
    if (restartMs > 0) {
      setTimeout(() => {
        adapterLog += "\n[harness] SIGKILL adapter mid-match; restarting with same token\n";
        adapter!.kill("SIGKILL");
        setTimeout(() => {
          adapter = spawnAdapter();
          adapterExit = new Promise((resolve) => adapter!.on("exit", (code) => resolve(code)));
          report.checks.push(`Adapter SIGKILLed at ${restartMs} ms and restarted with the same token`);
        }, 500);
      }, restartMs);
    }
  }

  report.checks.push(
    "Six real WebSocket clients registered and received private five-tile racks",
  );
  console.log(
    "Live match started. Six external clients, one-second official scheduler.",
  );
  await delay(2000);
  await bots[2].reconnect();
  report.checks.push(
    "Disconnect/reconnect retained identity and restored subscriptions using memory-only token",
  );
  let seenEnded = new Set<string>();
  const deadline = Date.now() + timeoutMs;
  while (!stopping) {
    await delay(200);
    if (testing && Date.now() > deadline)
      throw Error("Full-match completion timed out");
    for (const m of observer.conn.db.matchState.iter()) {
      if (m.status.tag !== "Ended" || seenEnded.has(String(m.id))) continue;
      const ps = Array.from(observer.conn.db.matchParticipant.iter()).filter(
        (p) => p.matchId === m.id,
      );
      if (!ps.some((p) => p.botId === bots[0].id)) continue;
      seenEnded.add(String(m.id));
      report.matches.push({
        id: String(m.id),
        rounds: m.currentRound,
        bagRemaining: m.bagTotal,
        auctionType: m.auctionType.tag,
        players: ps.map((p) => ({
          botId: String(p.botId),
          name: observer!.conn.db.bot.id.find(p.botId)?.name,
          score: Number(p.score),
          balance: Number(p.balance),
        })),
      });
      console.log("Match ended:", JSON.stringify(report.matches.at(-1)));
      save();
      if (testing) {
        for (const b of bots) b.enabled = false;
        await until(() => bots.every((b) => !b.busy), "all actions settled");
        await rejected(
          "word after final shutdown",
          bots[0].c.reducers.submitWord({ matchId: m.id, word: "AT" }),
          "Match not running",
        );
        await rejected(
          "bid against closed auction",
          bots[0].c.reducers.submitBid({ auctionId: a.id, amount: 1n }),
          "closed",
        );
        assert.ok(report.actions.bids > 0);
        assert.ok(report.actions.words > 0);
        assert.equal(
          report.actions.unexpectedErrors.length,
          0,
          JSON.stringify(report.actions.unexpectedErrors),
        );
        assert.equal(m.bagTotal, 0);
        report.checks.push(
          "Official scheduler completed full match; legal bids and words committed; post-end actions rejected",
        );
        report.completed = new Date().toISOString();
        close();
        await delay(750);
        if (adapterExit) {
          assert.equal(await adapterExit, 0, "baseline adapter shutdown");
          assert.ok(adapterLog.includes("subscription applied"));
          assert.ok(/bid \d+ on/.test(adapterLog));
          assert.ok(/playing '/.test(adapterLog));
          writeFileSync("reports/baseline-adapter.log", adapterLog);
          report.checks.push(
            process.env.PRACTICE_ADAPTER_ENTRY
              ? `Adapter ${process.env.PRACTICE_ADAPTER_ENTRY} (BOT_POLICY=${process.env.BOT_POLICY ?? "pacer"}) connected, subscribed, bid, played words, and exited cleanly on SIGINT`
              : "Byte-identical original live adapter connected, subscribed, bid, played words, and exited cleanly on SIGINT",
          );
          save();
        }
        console.log("Live integration PASSED. All clients disconnected.");
        process.exit(0);
      }
      for (const b of bots) {
        b.agent = b.factory();
        b.bidDone.clear();
        await b.c.reducers.joinLobby({});
      }
    }
  }
} catch (e) {
  report.actions.unexpectedErrors.push(String(e));
  close();
  await delay(750);
  console.error(e);
  process.exitCode = 1;
}
