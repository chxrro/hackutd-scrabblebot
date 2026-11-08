/**
 * Paired evaluation: for each deal, focal seat and opponent lineup, every candidate
 * plays the identical game (same deal, same opponents, same tie RNG).
 * usage: tsx run.ts <pool:tune|heldout|mirror|mixed> <Vickrey|FirstPrice> <dealStart> <nDeals> <seatsPerDeal> <candidates,comma> [out.json]
 */
import { writeFileSync } from 'node:fs';
import { playGame, placeOf, rng, type AuctionType, type BotFactory } from './engine.js';
import { FOCAL, TUNE_POOL, HELDOUT_POOL, pool, starter } from './bots.js';
import { CANDIDATES } from './candidates.js';
import { nigelLike, exzellLike, hoarderLike, marketFloor } from './calibrated.js';
const SEATS = +(process.env.SEATS ?? 6);

const [poolName = 'tune', at = 'Vickrey', ds = '1000', nd = '20', sp = '2', cands = 'baseline,learned', out] = process.argv.slice(2);
const auctionType = at as AuctionType;
const ALL: Record<string, BotFactory> = { ...FOCAL, ...CANDIDATES };
const names = cands.split(',');
for (const n of names) if (!ALL[n]) throw new Error('unknown candidate ' + n);

function lineup(deal: number, seat: number): BotFactory[] {
  const r = rng(deal * 31 + seat * 101 + 5);
  let opp: BotFactory[];
  if (poolName === 'tune') opp = pool(TUNE_POOL).concat([starter]);
  else if (poolName === 'heldout') opp = pool(HELDOUT_POOL);
  else if (poolName === 'mirror') opp = [FOCAL.baseline!, FOCAL.learned!, FOCAL.challenger!, FOCAL.learned!, FOCAL.challenger!];
  else if (poolName === 'live-tune') opp = [nigelLike(), nigelLike(1.25), nigelLike(0.8), ...pool(TUNE_POOL.filter(s => s.name !== 'conservative'))];
  else if (poolName === 'live-heldout') opp = [exzellLike(), exzellLike(), hoarderLike(), marketFloor(0.9), marketFloor(1.1), FOCAL.learned!, FOCAL.challenger!, ...pool(HELDOUT_POOL.slice(0, 3))];
  else if (poolName === 'strong') opp = [exzellLike(), nigelLike(), CANDIDATES['l-M1-F0.7-k1']!, CANDIDATES['l-M1-F0.5-k1']!, FOCAL.challenger!, marketFloor(1.0)];
  else if (poolName === 'exzell') opp = [exzellLike()];
  else if (poolName === 'nigel') opp = [nigelLike()];
  else opp = [...pool(HELDOUT_POOL), FOCAL.learned!, FOCAL.challenger!];
  const picks: BotFactory[] = []; for (let i = 0; i < SEATS - 1; i++) picks.push(opp[Math.floor(r() * opp.length)]!);
  return picks;
}
type Row = { cand: string; deal: number; seat: number; score: number; place: number; win: number; swiss: number; unspent: number; spent: number; tiles: number; stranded: number; illegal: number; oppBest: number; bidP99?: number };
const rows: Row[] = [];
const paidCls: Record<string, number[]> = { common: [], other: [] }; const oppStats: { score: number; tiles: number; spent: number }[] = [];
const allBid: Record<string, number[]> = {};
const t0 = Date.now();
const dealStart = +ds, nDeals = +nd, seats = +sp;
for (let d = dealStart; d < dealStart + nDeals; d++) {
  for (let k = 0; k < seats; k++) {
    const seat = (d + k * Math.max(1, Math.floor(SEATS / seats))) % SEATS;
    const opps = lineup(d, seat);
    for (const c of names) {
      const fs = [...opps]; fs.splice(seat, 0, ALL[c]!);
      const g = playGame(d, fs, auctionType, d * 1000 + seat, true, seat, +(process.env.MISS ?? 0));
      const scores = g.seats.map(s => s.score); const me = g.seats[seat]!;
      if (c === names[0]) { g.seats.forEach((s2, i) => { if (i !== seat) oppStats.push({ score: s2.score, tiles: s2.tilesWon, spent: s2.spent }); }); for (const h of g.history) if (h.winner !== null) paidCls['AEIOULNRST'.includes(h.letter) ? 'common' : 'other']!.push(h.paid); }
      const place = placeOf(scores, seat);
      (allBid[c] ??= []).push(...me.bidMs);
      rows.push({ cand: c, deal: d, seat, score: me.score, place, win: place === 1 ? 1 : 0, swiss: SEATS - place, unspent: me.balance, spent: me.spent, tiles: me.tilesWon, stranded: me.strandedTiles, illegal: me.illegal, oppBest: Math.max(...scores.filter((_, i) => i !== seat)) });
    }
  }
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
function pct(xs: number[], q: number) { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0; }
// paired bootstrap over deals for score and place vs first candidate
function boot(a: string, b: string, key: keyof Row) {
  const byDeal = new Map<number, number[]>();
  const A = rows.filter(r => r.cand === a), B = rows.filter(r => r.cand === b);
  A.forEach((r, i) => { const d = (B[i]![key] as number) - (r[key] as number); (byDeal.get(r.deal) ?? byDeal.set(r.deal, []).get(r.deal)!).push(d); });
  const dm = [...byDeal.values()].map(mean); const r = rng(99); const bs: number[] = [];
  for (let i = 0; i < 2000; i++) { let s = 0; for (let j = 0; j < dm.length; j++) s += dm[Math.floor(r() * dm.length)]!; bs.push(s / dm.length); }
  return [mean(dm), pct(bs, 0.025), pct(bs, 0.975)];
}
console.log(`miss=${process.env.MISS ?? 0} pool=${poolName} auction=${auctionType} deals=${dealStart}..${dealStart + nDeals - 1} (${nDeals} unique) seats/deal=${seats} games/candidate=${nDeals * seats} wall=${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`calibration (field in ${names[0]} games): opp mean score ${mean(oppStats.map(o=>o.score)).toFixed(1)}, opp tiles ${mean(oppStats.map(o=>o.tiles)).toFixed(1)}, opp spent ${mean(oppStats.map(o=>o.spent)).toFixed(0)}, median paid common ${pct(paidCls.common!,0.5)} other ${pct(paidCls.other!,0.5)}, seats ${SEATS}`);
console.log('cand'.padEnd(22) + 'win%   place  swissPts score  oppBest unspent spent tiles strand illegal bidP99ms');
const summary: any[] = [];
for (const c of names) {
  const R = rows.filter(r => r.cand === c);
  const s = { cand: c, games: R.length, win: mean(R.map(r => r.win)), place: mean(R.map(r => r.place)), swiss: mean(R.map(r => r.swiss)), score: mean(R.map(r => r.score)), oppBest: mean(R.map(r => r.oppBest)), unspent: mean(R.map(r => r.unspent)), spent: mean(R.map(r => r.spent)), tiles: mean(R.map(r => r.tiles)), stranded: mean(R.map(r => r.stranded)), illegal: R.reduce((a, r) => a + r.illegal, 0), bidP99: pct(allBid[c] ?? [0], 0.99) };
  summary.push(s);
  console.log(c.padEnd(22) + `${(100 * s.win).toFixed(1).padStart(5)}  ${s.place.toFixed(2)}  ${s.swiss.toFixed(2).padStart(6)}  ${s.score.toFixed(1).padStart(6)} ${s.oppBest.toFixed(1).padStart(6)}  ${s.unspent.toFixed(1).padStart(6)} ${s.spent.toFixed(1).padStart(5)} ${s.tiles.toFixed(1).padStart(5)} ${s.stranded.toFixed(1).padStart(5)} ${String(s.illegal).padStart(5)}   ${s.bidP99.toFixed(2)}`);
}
const ref = names[0]!;
for (const c of names.slice(1)) {
  const [ds1, lo, hi] = boot(ref, c, 'score'); const [dp, plo, phi] = boot(ref, c, 'place'); const [dw, wlo, whi] = boot(ref, c, 'win');
  console.log(`  ${c} - ${ref}: score ${ds1!.toFixed(1)} [${lo!.toFixed(1)}, ${hi!.toFixed(1)}]  place ${dp!.toFixed(2)} [${plo!.toFixed(2)}, ${phi!.toFixed(2)}]  win ${(100 * dw!).toFixed(1)}pp [${(100 * wlo!).toFixed(1)}, ${(100 * whi!).toFixed(1)}]`);
}
if (out) writeFileSync(out, JSON.stringify({ poolName, auctionType, dealStart, nDeals, seats, summary, rows }, null, 1));
