/** Rack-aware auction strategy. Pure functions: no network, model API or secrets. */
export const LETTER_VALUE: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8,
  K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1,
  U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};
export interface BidContext {
  letter: string;
  myBalance: number;
  myRack: Map<string, number>;
  dictionary?: string[];
  /** Tiles still in the bag, excluding the current auction's tile. */
  bagRemaining?: number;
  auctionType?: "Vickrey" | "FirstPrice";
}
export interface WordContext {
  myRack: Map<string, number>;
  dictionary: string[];
  myBalance?: number;
  bagRemaining?: number;
}
export function wordReward(word: string): number {
  const base = [...word].reduce((s, c) => s + (LETTER_VALUE[c] ?? 0), 0);
  const multiplier = word.length <= 3 ? 1 : Math.min(3, (word.length - 1) / 2);
  return Math.floor(base * multiplier);
}
interface Node { children: Map<string, Node>; word?: string; reward?: number }
interface Candidate { word: string; reward: number }
interface Analysis { words: Candidate[]; best: number; future: number }
interface Index { root: Node; cache: Map<string, Analysis> }
const indexes = new WeakMap<string[], Index>();
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function rackKey(rack: Map<string, number>): string {
  return ALPHABET.split("").map(c => String(rack.get(c) ?? 0)).join(",");
}
function tileCount(rack: Map<string, number>): number {
  let n = 0;
  for (const count of rack.values()) n += count;
  return n;
}
export function canSpell(word: string, rack: Map<string, number>): boolean {
  const used = new Map<string, number>();
  for (const c of word) {
    const n = (used.get(c) ?? 0) + 1;
    if (n > (rack.get(c) ?? 0)) return false;
    used.set(c, n);
  }
  return true;
}
/** Call before connecting so the one-off index build cannot miss an auction. */
export function prepareDictionary(dictionary: string[]): void { getIndex(dictionary); }
function getIndex(dictionary: string[]): Index {
  const existing = indexes.get(dictionary);
  if (existing) return existing;
  const root: Node = { children: new Map() };
  for (const source of dictionary) {
    const word = source.trim().toUpperCase();
    if (!/^[A-Z]{2,}$/.test(word)) continue;
    let node = root;
    for (const c of word) {
      let child = node.children.get(c);
      if (!child) { child = { children: new Map() }; node.children.set(c, child); }
      node = child;
    }
    node.word = word;
    node.reward = wordReward(word);
  }
  const index = { root, cache: new Map<string, Analysis>() };
  indexes.set(dictionary, index);
  return index;
}
function analyze(dictionary: string[], rack: Map<string, number>): Analysis {
  const index = getIndex(dictionary);
  const key = rackKey(rack);
  const cached = index.cache.get(key);
  if (cached) return cached;
  const counts = new Map(rack);
  const words: Candidate[] = [];
  let best = 0, future = 0, visited = 0;
  // Enumerate only prefixes compatible with the rack, plus one missing tile.
  // Hard cap guarantees a bounded search on unusually large admin-set racks.
  function walk(node: Node, missing: string | null, depth: number): void {
    if (++visited > 100000) return;
    if (node.word) {
      if (!missing) { words.push({ word: node.word, reward: node.reward! }); best = Math.max(best, node.reward!); }
      else if (depth >= 5) {
        const ease = "AEINORST".includes(missing) ? 0.8 : "DLUCGMPH".includes(missing) ? 0.6 : 0.35;
        future = Math.max(future, node.reward! * ease);
      }
    }
    for (const [c, child] of node.children) {
      const n = counts.get(c) ?? 0;
      if (n > 0) { counts.set(c, n - 1); walk(child, missing, depth + 1); counts.set(c, n); }
      else if (!missing && depth < 10) walk(child, c, depth + 1);
    }
  }
  walk(index.root, null, 0);
  words.sort((a, b) => b.reward - a.reward || b.word.length - a.word.length || a.word.localeCompare(b.word));
  const result = { words, best, future };
  if (index.cache.size >= 512) index.cache.delete(index.cache.keys().next().value!);
  index.cache.set(key, result);
  return result;
}
function removeWord(rack: Map<string, number>, word: string): Map<string, number> {
  const rest = new Map(rack);
  for (const c of word) rest.set(c, (rest.get(c) ?? 0) - 1);
  return rest;
}
export function decideBid(ctx: BidContext): number {
  const balance = Math.max(0, Math.floor(ctx.myBalance));
  if (!balance || !/^[A-Z]$/.test(ctx.letter)) return 0;
  // The last tile and match end are in the same server transaction. An
  // external bot can never turn that tile into a word, so do not buy it.
  if (ctx.bagRemaining === 0) return 0;
  const n = tileCount(ctx.myRack), have = ctx.myRack.get(ctx.letter) ?? 0;
  const face = LETTER_VALUE[ctx.letter] ?? 1;
  let vowels = 0;
  for (const c of "AEIOU") vowels += ctx.myRack.get(c) ?? 0;
  const isVowel = "AEIOU".includes(ctx.letter);
  let utility = isVowel ? (vowels < Math.max(1, n * 0.32) ? 2.7 : -0.7) : (vowels > n * 0.55 ? 1.4 : 0.4);
  utility -= have * (face > 4 ? 3 : 1.8);
  if ("SRTLN".includes(ctx.letter)) utility += 1;
  let marginal = 0, future = 0;
  if (ctx.dictionary) {
    const before = analyze(ctx.dictionary, ctx.myRack);
    const afterRack = new Map(ctx.myRack);
    afterRack.set(ctx.letter, have + 1);
    const after = analyze(ctx.dictionary, afterRack);
    marginal = Math.max(0, after.best - before.best);
    future = Math.max(0, after.future - before.future);
  }
  const remaining = ctx.bagRemaining ?? 50;
  if (remaining <= 3 && marginal === 0) return 0;
  if (ctx.letter === "Q" && !(ctx.myRack.get("U") ?? 0) && marginal === 0) utility -= 11;
  if ("JVXZ".includes(ctx.letter) && marginal === 0) utility -= 3.5;
  let desired = face * 1.7 + utility + Math.min(16, marginal * 0.65) + Math.min(6, future * 0.3);
  if (remaining <= 8) desired = marginal > 0 ? marginal * 0.9 + balance / Math.max(2, remaining) * 0.25 : desired * 0.45;
  const cap = remaining <= 5 ? balance : Math.max(1, Math.min(28, balance * 0.32));
  if (balance < 20 && remaining > 8) desired *= 0.7;
  if (ctx.auctionType === "FirstPrice") desired *= 0.72;
  return Math.max(0, Math.min(balance, Math.floor(cap), Math.round(desired)));
}
export function chooseWord(ctx: WordContext): string | null {
  if (tileCount(ctx.myRack) < 2) return null;
  const analysis = analyze(ctx.dictionary, ctx.myRack);
  if (!analysis.words.length) return null;
  const remaining = ctx.bagRemaining ?? 50;
  const n = tileCount(ctx.myRack);
  const cashNeeded = (ctx.myBalance ?? 100) < 22;
  const liquidate = remaining <= 8;
  const eligible = analysis.words.filter(c => liquidate || cashNeeded || c.word.length >= 7 ||
    (c.word.length >= 6 && (n >= 9 || c.reward >= 40)) ||
    (n >= 11 && c.word.length >= 4));
  if (!eligible.length) return null;
  // Prefer reward rather than raw length, with a two-word lookahead to
  // avoid consuming letters that would strand another high-value word.
  let choice = eligible[0]!, bestValue = -Infinity;
  for (const candidate of eligible.slice(0, 12)) {
    const rest = removeWord(ctx.myRack, candidate.word);
    const remainder = tileCount(rest) >= 2 ? analyze(ctx.dictionary, rest) : { best: 0, future: 0 };
    const value = candidate.reward + remainder.best * (liquidate ? 1 : 0.8) + (liquidate ? 0 : remainder.future * 0.1);
    if (value > bestValue) { bestValue = value; choice = candidate; }
  }
  return choice.word;
}
