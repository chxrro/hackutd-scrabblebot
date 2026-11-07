/** Frozen challenger selected on validation only. No network or model calls.
 * Weights SHA-256: 77a7c5b5c7fdef82a896d51c593e14d023ca12a5dd09463c90c084f568d30407
 * Pass auctionType to both callbacks. Omitted auctionType defaults to Vickrey.
 * This is an experimental policy, not a claim of tournament readiness.
 */
import { decideBid as bid, chooseWord as word, type BidContext, type WordContext, type Parameters } from './parametric_strategy.js';
export { LETTER_VALUE, wordReward, canSpell, prepareDictionary } from './parametric_strategy.js';
export type { BidContext, WordContext } from './parametric_strategy.js';
export type AuctionType = 'Vickrey' | 'FirstPrice';
export const CHALLENGER_PARAMETERS: Readonly<Record<AuctionType, Readonly<Parameters>>> = {
  "Vickrey": {
    "face": 4.438737706858465,
    "marginal": 0.12918511941210686,
    "future": 0.2788116878051139,
    "shade": 0.25,
    "cash": 13.575433598127795,
    "minLength": 8.864172119129918,
    "liquidate": 3.7849320111305023,
    "cap": 36.82952505102769
  },
  "FirstPrice": {
    "face": 5.246183055352143,
    "marginal": 0.4369322124232993,
    "future": 0.527566916001006,
    "shade": 0.6299476507628509,
    "cash": 21.629430816771787,
    "minLength": 8.385166254204869,
    "liquidate": 1,
    "cap": 12
  }
};
export const CHALLENGER_WEIGHTS_SHA256 = '77a7c5b5c7fdef82a896d51c593e14d023ca12a5dd09463c90c084f568d30407';
export function decideBid(ctx: BidContext): number { return bid(ctx, CHALLENGER_PARAMETERS[ctx.auctionType ?? 'Vickrey']); }
export function chooseWord(ctx: WordContext & { auctionType?: AuctionType }): string | null { return word(ctx, CHALLENGER_PARAMETERS[ctx.auctionType ?? 'Vickrey']); }
