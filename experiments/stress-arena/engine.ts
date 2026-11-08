/**
 * Independent stress arena for the ScrabbleBot letter auction.
 * Rules mirror clockworklabs/scrabblebot @ b5ccb36 spacetimedb/src/game.ts:
 *  - 98-tile bag (no blanks), 6 seats, 5 hidden tiles dealt each, 100 starting cash
 *  - one letter per auction; positive bids only; ties random; Vickrey pays the
 *    runner-up bid (or min(1, top) alone), FirstPrice pays own bid
 *  - an auction nobody bids on discards the tile (it is NOT returned)
 *  - the match ends in the same transaction as the last auction's close, so the
 *    final tile can never be played by an external bot
 *  - reward = floor(sum(face) * mult), mult 1/1.5/2/2.5/3 for <=3/4/5/6/7+ letters;
 *    reward goes to both balance and score; bids reduce balance only.
 * Ordering model (external bots): when an auction opens, every bot first plays any
 * words it wants (reducer round trips land before its bid), then submits one bid.
 * This matches our live adapter, which defers its bid while a word is in flight.
 */
import { readFileSync } from 'node:fs';

export const FACE: Record<string, number> = { A:1,B:3,C:3,D:2,E:1,F:4,G:2,H:4,I:1,J:8,K:5,L:1,M:3,N:1,O:1,P:3,Q:10,R:1,S:1,T:1,U:1,V:4,W:4,X:8,Y:4,Z:10 };
export const BAG = 'AAAAAAAAABBCCDDDDEEEEEEEEEEEEFFGGGHHIIIIIIIIIJKLLLLMMNNNNNNOOOOOOOOPPQRRRRRRSSSSTTTTTTUUUUVVWWXYYZ'.split('');
export const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export type AuctionType = 'Vickrey' | 'FirstPrice';

export function reward(word: string): number {
  let base = 0; for (const c of word) base += FACE[c] ?? 0;
  const n = word.length;
  const [num, den] = n <= 3 ? [1, 1] : n === 4 ? [3, 2] : n === 5 ? [2, 1] : n === 6 ? [5, 2] : [3, 1];
  return Math.floor((base * num) / den);
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffle<T>(xs: T[], r: () => number): T[] { for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [xs[i], xs[j]] = [xs[j]!, xs[i]!]; } return xs; }

// ---------- dictionary ----------
const WORDLIST_PATH = new URL('../../spacetimedb/wordlist.txt', import.meta.url);
export const DICT: string[] = readFileSync(WORDLIST_PATH, 'utf8').split('\n').map(s => s.trim().toUpperCase()).filter(s => /^[A-Z]{2,}$/.test(s));
DICT.sort((a, b) => b.length - a.length); // same order the live adapter uses
export const VALID = new Set(DICT);

interface Node { k: Map<string, Node>; w?: string }
const ROOT: Node = { k: new Map() };
for (const w of DICT) { let n = ROOT; for (const c of w) { let ch = n.k.get(c); if (!ch) { ch = { k: new Map() }; n.k.set(c, ch); } n = ch; } n.w = w; }

export type Rack = Map<string, number>;
export function rackKey(r: Rack): string { let s = ''; for (const c of ALPHA) { const n = r.get(c) ?? 0; if (n) s += c + n; } return s; }
export function tiles(r: Rack): number { let n = 0; for (const v of r.values()) n += v; return n; }
export function canSpell(word: string, r: Rack): boolean { const u = new Map<string, number>(); for (const c of word) { const n = (u.get(c) ?? 0) + 1; if (n > (r.get(c) ?? 0)) return false; u.set(c, n); } return true; }
export function minus(r: Rack, word: string): Rack { const o = new Map(r); for (const c of word) { const n = (o.get(c) ?? 0) - 1; if (n > 0) o.set(c, n); else o.delete(c); } return o; }
export function plus(r: Rack, c: string): Rack { const o = new Map(r); o.set(c, (o.get(c) ?? 0) + 1); return o; }

export interface Cand { word: string; reward: number }
const CACHE = new Map<string, Cand[]>();
/** All playable words for a rack, best reward first. Cached. */
export function playable(r: Rack): Cand[] {
  const key = rackKey(r);
  const hit = CACHE.get(key); if (hit) return hit;
  const counts = new Map(r); const out: Cand[] = [];
  const walk = (n: Node) => { if (n.w) out.push({ word: n.w, reward: reward(n.w) }); for (const [c, ch] of n.k) { const m = counts.get(c) ?? 0; if (m > 0) { counts.set(c, m - 1); walk(ch); counts.set(c, m); } } };
  walk(ROOT);
  out.sort((a, b) => b.reward - a.reward || b.word.length - a.word.length || (a.word < b.word ? -1 : 1));
  if (CACHE.size > 60000) CACHE.clear();
  CACHE.set(key, out); return out;
}
export function bestReward(r: Rack, minLen = 2): number { for (const c of playable(r)) if (c.word.length >= minLen) return c.reward; return 0; }

// ---------- game ----------
export interface PublicResult { round: number; letter: string; winner: number | null; paid: number; bagRemaining: number }
export interface Pub {
  seat: number; round: number; bagRemaining: number; auctionType: AuctionType;
  balances: number[]; scores: number[]; history: PublicResult[]; wordsPlayed: string[][];
}
export interface Bot {
  name: string;
  /** Words to play now, in order; evaluated sequentially against the current rack. */
  chooseWord(rack: Rack, balance: number, pub: Pub): string | null;
  bid(letter: string, rack: Rack, balance: number, pub: Pub): number;
}
export type BotFactory = () => Bot;

export interface SeatStats { name: string; score: number; balance: number; spent: number; tilesWon: number; words: string[]; illegal: number; strandedTiles: number; bidMs: number[]; wordMs: number[] }
export interface GameResult { seats: SeatStats[]; discarded: number; history: PublicResult[] }

export function playGame(deal: number, factories: BotFactory[], auctionType: AuctionType, tieSeed: number, timing = false, focal = -1, missRate = 0): GameResult {
  const miss = rng(tieSeed * 13 + 7);
  const r = rng(deal * 7919 + 17);
  const bag = shuffle([...BAG], r);
  const bots = factories.map(f => f());
  const n = bots.length;
  const racks: Rack[] = []; for (let i = 0; i < n; i++) { const rk: Rack = new Map(); for (let k = 0; k < 5; k++) { const c = bag.shift()!; rk.set(c, (rk.get(c) ?? 0) + 1); } racks.push(rk); }
  const st: SeatStats[] = bots.map(b => ({ name: b.name, score: 0, balance: 100, spent: 0, tilesWon: 0, words: [], illegal: 0, strandedTiles: 0, bidMs: [], wordMs: [] }));
  const history: PublicResult[] = []; const wordsPlayed: string[][] = bots.map(() => []);
  const tie = rng(tieSeed);
  let round = 0, discarded = 0;
  const pubFor = (seat: number): Pub => ({ seat, round, bagRemaining: bag.length, auctionType, balances: st.map(s => s.balance), scores: st.map(s => s.score), history, wordsPlayed });
  while (bag.length) {
    const letter = bag.shift()!; round++;
    // phase 1: words
    const missed = bots.map((_, i) => i === focal && missRate > 0 && miss() < missRate);
    for (let i = 0; i < n; i++) {
      if (missed[i]) continue;
      for (let guard = 0; guard < 30; guard++) {
        const t0 = timing ? performance.now() : 0;
        let w: string | null;
        try { w = bots[i]!.chooseWord(new Map(racks[i]!), st[i]!.balance, pubFor(i)); } catch { st[i]!.illegal++; w = null; }
        if (timing) st[i]!.wordMs.push(performance.now() - t0);
        if (!w) break;
        if (!VALID.has(w) || !canSpell(w, racks[i]!)) { st[i]!.illegal++; break; }
        racks[i] = minus(racks[i]!, w); const v = reward(w); st[i]!.balance += v; st[i]!.score += v; st[i]!.words.push(w); wordsPlayed[i]!.push(w);
      }
    }
    // phase 2: sealed bids
    const bids: number[] = [];
    for (let i = 0; i < n; i++) {
      const t0 = timing ? performance.now() : 0;
      let b = 0;
      if (missed[i]) { bids.push(0); continue; }
      try { b = bots[i]!.bid(letter, new Map(racks[i]!), st[i]!.balance, pubFor(i)); } catch { st[i]!.illegal++; b = 0; }
      if (timing) st[i]!.bidMs.push(performance.now() - t0);
      if (!Number.isInteger(b) || b < 0 || b > st[i]!.balance) { st[i]!.illegal++; b = 0; }
      bids.push(b);
    }
    const order = shuffle(bids.map((amount, id) => ({ amount, id })).filter(x => x.amount > 0), tie).sort((a, b) => b.amount - a.amount);
    let winner: number | null = null, paid = 0;
    if (order.length) { winner = order[0]!.id; paid = auctionType === 'FirstPrice' ? order[0]!.amount : (order[1]?.amount ?? Math.min(1, order[0]!.amount)); }
    if (winner !== null) { st[winner]!.balance -= paid; st[winner]!.spent += paid; st[winner]!.tilesWon++; racks[winner] = plus(racks[winner]!, letter); } else discarded++;
    history.push({ round, letter, winner, paid, bagRemaining: bag.length });
  }
  for (let i = 0; i < n; i++) st[i]!.strandedTiles = tiles(racks[i]!);
  return { seats: st, discarded, history };
}

/** Place counting as the tournament does: ties share the higher place. */
export function placeOf(scores: number[], i: number): number { return 1 + scores.filter(s => s > scores[i]!).length; }
