/**
 * Opponents re-implemented from *published descriptions* of public HackUTD bots
 * (MIT-licensed repos; no third-party code was executed or copied verbatim).
 * They are approximations: rack valuation uses our own word engine, not theirs.
 */
import { FACE, playable, bestReward, plus, tiles, type Bot, type BotFactory, type Pub, type Rack } from './engine.js';

const VOWEL = new Set('AEIOU'.split(''));
function gain(rack: Rack, letter: string): number { return Math.max(0, bestReward(plus(rack, letter)) - bestReward(rack)); }
/** cheap potential: best 6+ letter reward reachable now, used as a "target" proxy */
function longGain(rack: Rack, letter: string): number { return Math.max(0, bestReward(plus(rack, letter), 6) - bestReward(rack, 6)); }
function auctionsLeft(p: Pub) { return p.bagRemaining + 1; }
function typicalPaid(p: Pub, n = 12): number { const xs = p.history.filter(h => h.winner !== null).slice(-n).map(h => h.paid); if (!xs.length) return 10; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; }

/** Nigel-like: 0.683Δ + 2.299·face + 3.744 + 1.005·(bal/left), tile-pace floor, growing cap. */
export function nigelLike(scale = 1): BotFactory {
  return () => {
    let myTiles = 0, seen = 0;
    return {
      name: scale === 1 ? 'nigel-like' : `nigel-like-x${scale}`,
      chooseWord(rack, balance, p) {
        const c = playable(rack); if (!c.length) return null;
        if (p.bagRemaining <= 1 || balance < 8.4 || tiles(rack) > 15) return c[0]!.word;
        const seven = c.find(x => x.word.length >= 7); if (seven) return seven.word;
        const big = c.find(x => x.reward >= 38); return big ? big.word : null;
      },
      bid(letter, rack, balance, p) {
        for (; seen < p.history.length; seen++) if (p.history[seen]!.winner === p.seat) myTiles++;
        if (p.bagRemaining === 0) return 0;
        const d = gain(rack, letter) + 0.5 * longGain(rack, letter);
        let b = 0.683 * d + 2.299 * FACE[letter]! * (d === 0 ? 0.913 : 1) + 3.744 + 1.005 * balance / auctionsLeft(p);
        if (letter === 'Q' && !rack.get('U')) b *= 0.2;
        const progress = Math.min(1, p.round / 68);
        if (myTiles + 2 < 16 * progress && (d > 0 || VOWEL.has(letter) || 'RSTLN'.includes(letter))) b = Math.max(b, 0.814 * typicalPaid(p) + 1);
        if (p.bagRemaining === 1) b = balance;
        if (p.auctionType === 'FirstPrice') b *= 0.7;
        b *= scale;
        const cap = balance * (0.526 + 0.474 * Math.sqrt(progress));
        return Math.max(0, Math.min(balance, Math.floor(cap), Math.round(b)));
      },
    } satisfies Bot;
  };
}

const T: Record<string, number> = { Z: 16.7, X: 11.5, J: 10.9, K: 9.8, H: 9.3, Y: 8.7, F: 7.8, M: 7.7, C: 7.4, W: 6.6, P: 6.5, B: 6.2, D: 6.0, G: 6.0, S: 5.8, V: 5.7, A: 5.6, Q: 5.5, E: 5.3, R: 4.7, O: 4.7, N: 4.6, L: 4.5, U: 4.3, I: 4.0, T: 3.6 };
/** exzell-like: 2.8 × per-letter table with dup/vowel/phase/pace adjustments. */
export function exzellLike(): BotFactory {
  return () => ({
    name: 'exzell-like',
    chooseWord(rack, balance, p) {
      const c = playable(rack); if (!c.length) return null;
      if (p.bagRemaining <= 1 || balance < 20 || tiles(rack) > 16) return c[0]!.word;
      const seven = c.find(x => x.word.length >= 7); return seven ? seven.word : null;
    },
    bid(letter, rack, balance, p) {
      if (p.bagRemaining === 0) return 0;
      const left = auctionsLeft(p);
      const have = rack.get(letter) ?? 0;
      let v = 2.8 * T[letter]! * ([1, 0.8, 0.5, 0.25][Math.min(3, have)]!);
      const n = tiles(rack); let vow = 0; for (const c of VOWEL) vow += rack.get(c) ?? 0;
      if (VOWEL.has(letter) && vow > n * 0.5) v *= 0.7;
      if (!VOWEL.has(letter) && vow < n * 0.25) v *= 0.75;
      if (letter === 'Q' && !rack.get('U')) v *= 0.3;
      v *= left > 45 ? 0.9 : left <= 15 ? 1.2 : 1;
      if (balance / left > 6) v *= 1.3;
      if (left <= 3) v = Math.max(4 * gain(rack, letter), 1.5 * balance / left);
      if (p.auctionType === 'FirstPrice') v *= 0.75;
      const richest = Math.max(...p.balances.filter((_, i) => i !== p.seat));
      v = Math.min(v, richest + 1);
      return Math.max(0, Math.min(balance, Math.round(v)));
    },
  } satisfies Bot);
}

// Tile Hoarders published median paid prices A..Z (17k matches)
const MED = [11, 17, 18, 14, 11, 20, 13, 21, 10, 29, 24, 11, 17, 11, 10, 17, 27, 11, 12, 10, 10, 18, 19, 31, 21, 38];
/** TileHoarder-like: 1.15 × marginal value × pace clamp; late ×1.6; underbids early. */
export function hoarderLike(): BotFactory {
  return () => ({
    name: 'hoarder-like',
    chooseWord(rack, balance, p) {
      const c = playable(rack); if (!c.length) return null;
      if (p.bagRemaining <= 1) return c[0]!.word;
      const seven = c.find(x => x.word.length >= 7); if (seven) return seven.word;
      if (balance < 10) { const four = c.find(x => x.word.length >= 4); if (four) return four.word; }
      return null;
    },
    bid(letter, rack, balance, p) {
      if (p.bagRemaining === 0) return 0;
      const left = auctionsLeft(p);
      const mv = gain(rack, letter) + 0.6 * longGain(rack, letter) + FACE[letter]! * 1.2;
      let b = 1.15 * mv * Math.max(0.5, Math.min(3, balance / left / 1.5));
      if (left <= 8) b *= 1.6;
      if (p.auctionType === 'FirstPrice') b *= 0.75;
      return Math.max(0, Math.min(balance, Math.round(b)));
    },
  } satisfies Bot);
}
/** Market-floor bidder: bids ~0.9 × published median on letters it can use. */
export function marketFloor(f = 0.9): BotFactory {
  return () => ({
    name: `market-floor-${f}`,
    chooseWord(rack, balance, p) {
      const c = playable(rack); if (!c.length) return null;
      if (p.bagRemaining <= 2 || balance < 15) return c[0]!.word;
      const six = c.find(x => x.word.length >= 6); return six ? six.word : null;
    },
    bid(letter, rack, balance, p) {
      if (p.bagRemaining === 0) return 0;
      const have = rack.get(letter) ?? 0;
      let b = f * MED[letter.charCodeAt(0) - 65]! * (have >= 2 ? 0.4 : have === 1 ? 0.75 : 1);
      if (letter === 'Q' && !rack.get('U')) b *= 0.3;
      if (p.auctionType === 'FirstPrice') b *= 0.8;
      return Math.max(0, Math.min(balance, Math.floor(balance * 0.5), Math.round(b)));
    },
  } satisfies Bot);
}
