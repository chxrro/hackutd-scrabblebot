/** Focal policies (ours, unchanged imports) and independent opponent styles. Opponents use only public info + own rack. */
import { DICT, FACE, playable, bestReward, plus, tiles, type Bot, type BotFactory, type Pub, type Rack } from './engine.js';
import * as baseline from '../../bot-starter/src/strategy.js';
import * as learned from '../robust-arena/learned_policy.js';
import * as challenger from '../robust-arena/challenger_policy.js';

baseline.prepareDictionary(DICT); learned.prepareDictionary(DICT);

type Mod = { decideBid(c: any): number; chooseWord(c: any): string | null };
function wrap(name: string, m: Mod, bidScale = 1, extra?: (b: number, letter: string, rack: Rack, bal: number, p: Pub) => number): BotFactory {
  return () => ({
    name,
    chooseWord: (rack, balance, p) => m.chooseWord({ myRack: rack, dictionary: DICT, myBalance: balance, bagRemaining: p.bagRemaining, auctionType: p.auctionType }),
    bid: (letter, rack, balance, p) => {
      let b = m.decideBid({ letter, myBalance: balance, myRack: rack, dictionary: DICT, bagRemaining: p.bagRemaining, auctionType: p.auctionType });
      if (bidScale !== 1 && b > 0) b = Math.round(b * bidScale);
      if (extra) b = extra(b, letter, rack, balance, p);
      return Math.max(0, Math.min(balance, Math.floor(b)));
    },
  });
}
export const FOCAL: Record<string, BotFactory> = {
  baseline: wrap('baseline', baseline),
  learned: wrap('learned', learned),
  challenger: wrap('challenger', challenger),
  // controls: plain bid increases, no modelling
  'baseline-x1.5': wrap('baseline-x1.5', baseline, 1.5),
  'baseline-x2': wrap('baseline-x2', baseline, 2),
};
export { wrap };

// ---------- parameterised opponent ----------
const COMMON = new Set('AEIORSTLNDU'.split(''));
const VOWEL = new Set('AEIOU'.split(''));
export interface OppSpec {
  name: string;
  common: number; mid: number; rare: number; // base bid per class (rare = face>=5)
  m: number;            // weight on marginal best-word gain
  hold: number;         // min word length outside liquidation / cash need
  cashFloor: number;    // below this, play anything
  liquidateAt: number;  // bagRemaining <= this: play anything
  capFrac: number;      // max fraction of balance per bid
  shade: number;        // first-price multiplier
  pace?: number;        // add pace * balance/(remaining+1) on useful letters (spend-down)
  adaptive?: number;    // bid >= observed mean clearing price * adaptive, when letter is wanted
  snipe?: boolean;      // bid only when the letter raises best playable reward (or completes 6+)
  qPenalty?: boolean;
}
export function opponent(s: OppSpec): BotFactory {
  return () => {
    const paidByClass: Record<string, number[]> = { c: [], m: [], r: [] };
    let seen = 0;
    const cls = (c: string) => (FACE[c]! >= 5 ? 'r' : COMMON.has(c) ? 'c' : 'm');
    const sync = (p: Pub) => { for (; seen < p.history.length; seen++) { const h = p.history[seen]!; if (h.winner !== null) paidByClass[cls(h.letter)]!.push(h.paid); } };
    return {
      name: s.name,
      chooseWord(rack, balance, p) {
        const cands = playable(rack); if (!cands.length) return null;
        const loose = p.bagRemaining <= s.liquidateAt || balance < s.cashFloor;
        const c = cands.find(x => loose || x.word.length >= s.hold);
        return c ? c.word : null;
      },
      bid(letter, rack, balance, p) {
        sync(p);
        if (p.bagRemaining === 0) return 0; // last tile is unplayable
        const k = cls(letter);
        let v = k === 'c' ? s.common : k === 'm' ? s.mid : s.rare;
        if (k === 'm') v += FACE[letter]! * 0.5;
        const have = rack.get(letter) ?? 0;
        const n = tiles(rack);
        let vow = 0; for (const c of VOWEL) vow += rack.get(c) ?? 0;
        if (VOWEL.has(letter)) v *= vow > n * 0.5 ? 0.5 : vow < n * 0.25 ? 1.4 : 1;
        if (have >= 2) v *= 0.5;
        const before = bestReward(rack, Math.min(s.hold, 4)), after = bestReward(plus(rack, letter), Math.min(s.hold, 4));
        const gain = Math.max(0, after - before);
        if (s.snipe && gain === 0) v *= 0.15;
        v += s.m * gain;
        if (s.qPenalty && letter === 'Q' && !(rack.get('U'))) v = Math.min(v, 1);
        const useful = gain > 0 || k === 'c';
        if (s.pace && useful) v += s.pace * balance / (p.bagRemaining + 1);
        if (s.adaptive && useful) {
          const xs = paidByClass[k]!; if (xs.length >= 3) { const recent = xs.slice(-8); const mean = recent.reduce((a, b) => a + b, 0) / recent.length; v = Math.max(v, mean * s.adaptive + 1); }
        }
        if (p.auctionType === 'FirstPrice') v *= s.shade;
        if (p.bagRemaining <= 3 && gain === 0) v = 0;
        const cap = p.bagRemaining <= 4 ? balance : Math.max(1, balance * s.capFrac);
        return Math.max(0, Math.min(balance, Math.floor(cap), Math.round(v)));
      },
    } satisfies Bot;
  };
}
/** Official starter: face + 2 if not held; plays longest word whenever possible. */
export const starter: BotFactory = () => ({
  name: 'starter',
  chooseWord(rack) { let best: string | null = null; for (const c of playable(rack)) if (!best || c.word.length > best.length) best = c.word; return best; },
  bid(letter, rack, balance) { return Math.min(balance, FACE[letter]! + ((rack.get(letter) ?? 0) === 0 ? 2 : 0)); },
});

// Tuning pool: used while designing candidates.
export const TUNE_POOL: OppSpec[] = [
  { name: 'aggressive', common: 6, mid: 7, rare: 12, m: 0.8, hold: 6, cashFloor: 15, liquidateAt: 3, capFrac: 0.5, shade: 0.75, qPenalty: true },
  { name: 'conservative', common: 1.5, mid: 2.5, rare: 6, m: 0.3, hold: 5, cashFloor: 20, liquidateAt: 6, capFrac: 0.2, shade: 0.8 },
  { name: 'common-spec', common: 9, mid: 3, rare: 5, m: 0.4, hold: 7, cashFloor: 12, liquidateAt: 3, capFrac: 0.4, shade: 0.75, qPenalty: true },
  { name: 'recycler', common: 4, mid: 5, rare: 8, m: 0.6, hold: 2, cashFloor: 999, liquidateAt: 99, capFrac: 0.35, shade: 0.8, pace: 1.5 },
  { name: 'longword', common: 5, mid: 4, rare: 6, m: 0.9, hold: 7, cashFloor: 10, liquidateAt: 2, capFrac: 0.45, shade: 0.7, qPenalty: true },
  { name: 'adaptive', common: 3, mid: 4, rare: 8, m: 0.6, hold: 6, cashFloor: 15, liquidateAt: 3, capFrac: 0.4, shade: 0.8, adaptive: 1.1, pace: 0.8, qPenalty: true },
];
// Held-out pool: different parameterisations/combinations, never used for design decisions.
export const HELDOUT_POOL: OppSpec[] = [
  { name: 'H-hyperaggr', common: 10, mid: 11, rare: 15, m: 1.0, hold: 6, cashFloor: 10, liquidateAt: 2, capFrac: 0.6, shade: 0.8, pace: 1, qPenalty: true },
  { name: 'H-sniper', common: 3, mid: 4, rare: 6, m: 1.6, hold: 6, cashFloor: 15, liquidateAt: 3, capFrac: 0.6, shade: 0.75, snipe: true },
  { name: 'H-commonhoard', common: 12, mid: 2, rare: 3, m: 0.3, hold: 8, cashFloor: 8, liquidateAt: 2, capFrac: 0.5, shade: 0.85, pace: 1.2, qPenalty: true },
  { name: 'H-spenddown', common: 4, mid: 5, rare: 7, m: 0.7, hold: 5, cashFloor: 20, liquidateAt: 4, capFrac: 0.7, shade: 0.8, pace: 3, adaptive: 1.0, qPenalty: true },
  { name: 'H-adaptive-hi', common: 5, mid: 6, rare: 9, m: 0.8, hold: 7, cashFloor: 12, liquidateAt: 2, capFrac: 0.5, shade: 0.85, adaptive: 1.4, pace: 1, qPenalty: true },
  { name: 'H-greedy-cash', common: 7, mid: 7, rare: 9, m: 0.5, hold: 3, cashFloor: 999, liquidateAt: 99, capFrac: 0.4, shade: 0.8 },
];
export const pool = (specs: OppSpec[]) => specs.map(opponent);
