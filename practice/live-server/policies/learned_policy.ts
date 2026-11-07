/** Frozen learned policy. Offline experiment; live play is not verified. */
import { decideBid as bid, chooseWord as word, type BidContext, type WordContext, type Parameters } from './parametric_strategy.js';
export { LETTER_VALUE, wordReward, canSpell, prepareDictionary } from './parametric_strategy.js';
export type { BidContext, WordContext } from './parametric_strategy.js';
export const LEARNED_PARAMETERS: Parameters = {
  "face": 3.289016834748909,
  "marginal": 0.44609652369159775,
  "future": 0.2624546149098246,
  "shade": 0.6894965810197132,
  "cash": 27.50927319932018,
  "minLength": 7.793261559292988,
  "liquidate": 2.246031833458863,
  "cap": 31.115967787688003
};
export function decideBid(ctx: BidContext): number { return bid(ctx, LEARNED_PARAMETERS); }
export function chooseWord(ctx: WordContext): string | null { return word(ctx, LEARNED_PARAMETERS); }
