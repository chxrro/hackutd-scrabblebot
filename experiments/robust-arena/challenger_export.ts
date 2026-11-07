/** Export frozen JSON weights as a network-free drop-in policy module. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const bytes=readFileSync(new URL('./challenger-weights.json',import.meta.url));
const saved=JSON.parse(bytes.toString()),sha=createHash('sha256').update(bytes).digest('hex');
for(const auctionType of ['Vickrey','FirstPrice'])if(!saved.parameters?.[auctionType])throw Error(`Missing ${auctionType} weights`);
const source=`/** Frozen challenger selected on validation only. No network or model calls.
 * Weights SHA-256: ${sha}
 * Pass auctionType to both callbacks. Omitted auctionType defaults to Vickrey.
 * This is an experimental policy, not a claim of tournament readiness.
 */
import { decideBid as bid, chooseWord as word, type BidContext, type WordContext, type Parameters } from './parametric_strategy.js';
export { LETTER_VALUE, wordReward, canSpell, prepareDictionary } from './parametric_strategy.js';
export type { BidContext, WordContext } from './parametric_strategy.js';
export type AuctionType = 'Vickrey' | 'FirstPrice';
export const CHALLENGER_PARAMETERS: Readonly<Record<AuctionType, Readonly<Parameters>>> = ${JSON.stringify(saved.parameters,null,2)};
export const CHALLENGER_WEIGHTS_SHA256 = '${sha}';
export function decideBid(ctx: BidContext): number { return bid(ctx, CHALLENGER_PARAMETERS[ctx.auctionType ?? 'Vickrey']); }
export function chooseWord(ctx: WordContext & { auctionType?: AuctionType }): string | null { return word(ctx, CHALLENGER_PARAMETERS[ctx.auctionType ?? 'Vickrey']); }
`;
writeFileSync(new URL('./challenger_policy.ts',import.meta.url),source);
console.log(JSON.stringify({file:'challenger_policy.ts',sha256:sha}));
