/**
 * Live policy selection. BOT_POLICY=pacer (default) | baseline.
 *  - pacer:    frozen learned policy + market floor (0.7 x public clearing price) + spend-down pacing (1.0).
 *              Selected on tuning opponents; validated on held-out deals/opponents (offline simulation only,
 *              see experiments/stress-arena/RESULTS.md).
 *  - baseline: the preserved original strategy.ts, unchanged (fallback).
 * One instance per match: the pacer keeps public clearing-price statistics for its match.
 */
import * as baseline from "./strategy.js";
import * as learned from "./learned_policy.js";
import { makePacer, type PacerParams } from "./pacer.js";

export type PolicyName = "pacer" | "baseline";
export const PACER_PARAMS: PacerParams = { mult: 1, floor: 0.7, pace: 1 };

export interface MatchPolicy {
  name: PolicyName;
  decideBid(ctx: Parameters<typeof baseline.decideBid>[0]): number;
  chooseWord(ctx: Parameters<typeof baseline.chooseWord>[0]): string | null;
  /** Feed one public AuctionResult row (call once per auction id). */
  observe(auctionId: string, letter: string, sold: boolean, paid: number): void;
}

export function policyName(): PolicyName {
  const raw = (process.env.BOT_POLICY ?? "pacer").toLowerCase();
  if (raw !== "pacer" && raw !== "baseline") throw new Error(`BOT_POLICY must be 'pacer' or 'baseline', got '${raw}'`);
  return raw;
}

export function prepare(dictionary: string[]): void {
  baseline.prepareDictionary(dictionary);
  learned.prepareDictionary(dictionary);
}

export function newMatchPolicy(name: PolicyName = policyName()): MatchPolicy {
  if (name === "baseline") {
    return { name, decideBid: baseline.decideBid, chooseWord: baseline.chooseWord, observe() {} };
  }
  const p = makePacer(learned, PACER_PARAMS);
  const seen = new Set<string>();
  return {
    name,
    decideBid: (ctx) => p.decideBid(ctx),
    chooseWord: (ctx) => p.chooseWord(ctx),
    observe(auctionId, letter, sold, paid) {
      if (seen.has(auctionId)) return;
      seen.add(auctionId);
      p.observe(letter, sold, paid);
    },
  };
}
