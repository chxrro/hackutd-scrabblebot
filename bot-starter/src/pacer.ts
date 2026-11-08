/**
 * Market-aware overlay on a frozen base policy (learned / challenger).
 * Inputs are only: our rack, our balance, bag count, auction type, and public
 * AuctionResult rows (letter, whether sold, price paid). No opponent racks or live bids.
 *
 *   bid = max(mult * baseBid, floor * marketPrice(letter) if the letter is useful)
 *         + pace * balance / auctionsLeft (only when we wanted the letter)
 *
 * capped so a single non-endgame bid never exceeds capFrac of balance, never the
 * final (unplayable) tile, never more than balance.
 */
export interface PacerParams { mult: number; floor: number; pace: number; capFrac?: number }
export interface BaseModule {
  decideBid(ctx: any): number;
  chooseWord(ctx: any): string | null;
}
const COMMON = 'AEIOULNRST';
// Prior clearing prices A..Z (published median paid over many live matches, Tile Hoarders README).
const PRIOR = [11, 17, 18, 14, 11, 20, 13, 21, 10, 29, 24, 11, 17, 11, 10, 17, 27, 11, 12, 10, 10, 18, 19, 31, 21, 38];

export function makePacer(base: BaseModule, pp: PacerParams) {
  const capFrac = pp.capFrac ?? 0.45;
  // per-letter-class running mean of public paid prices, shrunk toward the prior
  const sum = { c: 0, o: 0 }, cnt = { c: 0, o: 0 };
  const priorMean = { c: 10.6, o: 19 };
  function market(letter: string): number {
    const k = COMMON.includes(letter) ? 'c' : 'o';
    const prior = PRIOR[letter.charCodeAt(0) - 65] ?? 12;
    const w = cnt[k] / (cnt[k] + 6);
    const observedRatio = cnt[k] ? (sum[k] / cnt[k]) / priorMean[k] : 1;
    return prior * ((1 - w) + w * observedRatio);
  }
  return {
    observe(letter: string, sold: boolean, paid: number) {
      if (!sold || !/^[A-Z]$/.test(letter)) return;
      const k = COMMON.includes(letter) ? 'c' : 'o';
      sum[k] += paid; cnt[k] += 1;
    },
    market,
    chooseWord(ctx: any): string | null { return base.chooseWord(ctx); },
    decideBid(ctx: { letter: string; myBalance: number; myRack: Map<string, number>; dictionary?: string[]; bagRemaining?: number; auctionType?: 'Vickrey' | 'FirstPrice' }): number {
      const balance = Math.max(0, Math.floor(ctx.myBalance));
      if (!balance || !/^[A-Z]$/.test(ctx.letter)) return 0;
      const remaining = ctx.bagRemaining ?? 50;
      if (remaining === 0) return 0; // final tile cannot be played by an external bot
      const baseBid = Math.max(0, base.decideBid(ctx));
      const have = ctx.myRack.get(ctx.letter) ?? 0;
      let vowels = 0, n = 0; for (const [c, v] of ctx.myRack) { n += v; if ('AEIOU'.includes(c)) vowels += v; }
      const isVowel = 'AEIOU'.includes(ctx.letter);
      const balanced = isVowel ? vowels <= Math.max(1, n * 0.45) : vowels >= n * 0.25 || n < 4;
      const qDead = ctx.letter === 'Q' && !(ctx.myRack.get('U') ?? 0);
      // "useful": base already wanted it, or a common letter we hold < 2 of and that keeps vowel balance
      const useful = !qDead && (baseBid > 0 && (baseBid >= 3 || COMMON.includes(ctx.letter))) && have < 2 && balanced;
      let bid = pp.mult * baseBid;
      if (useful && pp.floor > 0) {
        let floor = pp.floor * market(ctx.letter);
        if (ctx.auctionType === 'FirstPrice') floor *= 0.85;
        bid = Math.max(bid, floor);
      }
      if (useful && pp.pace > 0) bid += pp.pace * balance / (remaining + 1);
      const cap = remaining <= 5 ? balance : Math.max(1, balance * capFrac);
      return Math.max(0, Math.min(balance, Math.floor(cap), Math.round(bid)));
    },
  };
}
