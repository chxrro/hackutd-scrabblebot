/** Candidate overlays on frozen base policies. Uses only own rack, balance, bag count and public auction results. */
import { DICT, type BotFactory, type Rack } from './engine.js';
import { makePacer, type PacerParams } from '../../bot-starter/src/pacer.js';
import * as learned from '../robust-arena/learned_policy.js';
import * as challenger from '../robust-arena/challenger_policy.js';

export function pacerBot(name: string, base: 'learned' | 'challenger', pp: PacerParams): BotFactory {
  const mod = base === 'learned' ? learned : challenger;
  return () => {
    const pol = makePacer(mod, pp);
    let seen = 0;
    return {
      name,
      chooseWord: (rack: Rack, balance, p) => pol.chooseWord({ myRack: rack, dictionary: DICT, myBalance: balance, bagRemaining: p.bagRemaining, auctionType: p.auctionType }),
      bid: (letter, rack, balance, p) => {
        for (; seen < p.history.length; seen++) { const h = p.history[seen]!; pol.observe(h.letter, h.winner !== null, h.paid); }
        return pol.decideBid({ letter, myBalance: balance, myRack: rack, dictionary: DICT, bagRemaining: p.bagRemaining, auctionType: p.auctionType });
      },
    };
  };
}
export const CANDIDATES: Record<string, BotFactory> = {};
for (const base of ['learned', 'challenger'] as const)
  for (const M of [1, 1.3])
    for (const F of [0, 0.7, 0.9, 1.1])
      for (const k of [0, 0.5, 1]) {
        const name = `${base[0]}-M${M}-F${F}-k${k}`;
        CANDIDATES[name] = pacerBot(name, base, { mult: M, floor: F, pace: k });
      }
for (const [F, k] of [[0.5, 1], [0.7, 1.5], [0.5, 1.5], [0.7, 2], [0.85, 1]] as const) {
  const name = `l-M1-F${F}-k${k}`; CANDIDATES[name] = pacerBot(name, 'learned', { mult: 1, floor: F, pace: k });
}
