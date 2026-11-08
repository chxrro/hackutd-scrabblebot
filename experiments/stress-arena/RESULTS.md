# Stress arena: results (2026-11-07)

**Two kinds of evidence, labelled throughout:**
- **SIM**: an offline simulator written independently in this folder (`engine.ts`), following the official game logic at clockworklabs/scrabblebot `b5ccb36` (the latest commit at the time of writing).
- **LOCAL-SERVER**: the real official SpacetimeDB 2.14.1 server running the unchanged upstream module on loopback, driven by the *production adapter* `bot-starter/src/index.ts`.

No game was played on maincloud or in the tournament. No credentials were used. No third-party code was executed.

## Headline

1. **Confirmed: the old live default (`strategy.ts`, "baseline") underbids and finishes with nearly all of its cash.** In SIM it ends with 97–112 unspent cash out of 100 starting cash, wins 1.4–8 tiles, and averages place 5.1–5.9 of 6 against fields calibrated to public live data. On the LOCAL-SERVER it finished 6, 6, 6 and 4 of 6, with 102–120 cash unspent. Public bots measured live clearing prices of about 10–12 for common letters. The baseline bids about 4–7 on them.
2. **New default: `BOT_POLICY=pacer`.** It is the frozen learned policy with two additions. The first is a market floor: it bids at least 0.7 × the clearing price for useful letters, using a published-median prior that is updated from public `AuctionResult.paid`. The second is spend-down pacing: it adds 1.0 × balance ÷ auctions left on wanted letters.
   - In SIM against held-out opponents on held-out deals it improved mean place by 1.0–4.3 places over baseline and 1.0–3.9 over challenger.
   - On the LOCAL-SERVER (7 games, Vickrey) it placed 1, 2, 1 (tied), 3, 1, 1, 3, with 7–12 cash left.
3. **Controls.** The gain is not just bidding more:
   - Plain bid increases (`baseline-x1.5`, `baseline-x2`, `l-M1.3-F0-k0`) are much worse than the pacer in every setting.
   - Pacing alone (`l-M1-F0-k1`) captures most of the gain.
   - The market floor adds 0.15–0.9 places in strong or large-table fields.
4. Win probability for the tournament is **not** estimated. The opponents are approximations, and the strongest live bots (GodOfThudner, RackMaw) have no public code.

## Method

- Rules (`engine.ts`):
  - 98 tiles, 5 hidden tiles dealt per seat, 100 starting cash.
  - Positive bids only, random tie-break.
  - Vickrey pays the runner-up bid, or min(1, top) when there is only one bid. First-price pays the bid.
  - An unbid tile is discarded.
  - The final tile can't be played.
  - Score multiplier is 1 / 1.5 / 2 / 2.5 / 3 by word length.
  - Ordering: each external bot plays its words, then bids, at every auction open. This is how the live adapter behaves, since it defers a bid while a word is in flight.
- Placement follows the tournament rule: ties share the higher place, and Swiss points = seats − place.
- Paired design: every candidate plays the identical deal, seat, opponent lineup and tie RNG. Results report 95% bootstrap intervals over **unique deals**.
- Seats rotate by deal. Metrics:
  - win (shared first place)
  - mean place
  - Swiss points
  - score
  - unspent cash
  - tiles won
  - stranded tiles
  - illegal actions (0 everywhere)
  - p99 bid latency (≤ 7 ms here)
- Opponents:
  - **Tuning pool** (used to choose parameters): aggressive, common-letter specialist, cash recycler, long-word, adaptive/pacing, and starter. Also `nigel-like` at 3 scales, re-implemented from the public Nigel bid formula.
  - **Held-out pools** (never used for tuning):
    - `exzell-like`, a re-implementation of the #3 live bot's published per-letter table and adjustments
    - `hoarder-like` (Tile Hoarders)
    - `market-floor` bidders using published median prices
    - hyper-aggressive, sniper, common-hoarder, spend-down, adaptive-high and greedy-cash styles
    - our own learned and challenger policies
    - `strong`, a mix that includes copies of the pacer itself
    - tables with 8 and 10 seats
    - a stress mode where we miss 10% of action windows
- Calibration: in the calibrated pools, opponent fields average 60–72 points, 10–13 tiles and 120–158 spent per game, and common letters clear at a median of 9–12. The public live ladder snapshot shows a field average of about 75, the top bots at 90–100 points with 13–15 tiles, and commons clearing at 10–12.
- Deal ranges:
  - grid tuning: 10000–10079
  - held-out evaluation: 30000–30119 and 40000–40079
  - final confirmation: 50000–50099 (fresh, after choosing between the two finalists)

## Tuning (SIM, live-tune pool, 80 deals × 2 seats)

The grid covered base ∈ {learned, challenger}, mult ∈ {1, 1.3}, floor ∈ {0, 0.7, 0.9, 1.1} and pace ∈ {0, 0.5, 1}, plus an extension around the optimum. The learned base beat the challenger base. A multiplier of 1.3 hurt. Results plateaued at floor 0.5–0.7 and pace 0.5–1.5. Two finalists were frozen: `l-M1-F0.5-k1` and `l-M1-F0.7-k1`. See `results/grid-*` and `results/ext-*`.

## Held-out (SIM): mean place / win% / unspent cash

| Setting | Seats | Deals × seats | baseline | baseline-x1.5 | l-M1.3-F0-k0 | learned | challenger | pace only F0-k1 | F0.5-k1 | **F0.7-k1 (default)** |
|---|---|---|---|---|---|---|---|---|---|---|
| exzell FirstPrice | 6 | 120 × 2 | 5.93 / 0% / 112 | 5.53 / 1% / 93 | 5.00 / 1% / 76 | 5.80 / 0% / 102 | 5.86 / 0% / 106 | 4.22 / 8% / 58 | 3.98 / 12% / 50 | 3.29 / 20% / 43 |
| exzell Vickrey | 6 | 120 × 2 | 5.45 / 1% / 110 | 4.68 / 7% / 90 | 2.89 / 25% / 60 | 4.07 / 16% / 101 | 3.91 / 17% / 83 | 2.45 / 40% / 61 | 2.30 / 43% / 51 | 2.18 / 44% / 34 |
| heldout FirstPrice | 6 | 120 × 2 | 2.45 / 39% / 98 | 1.27 / 84% / 30 | 1.32 / 78% / 15 | 1.14 / 90% / 53 | 1.12 / 91% / 34 | 1.09 / 95% / 15 | 1.07 / 95% / 7 | 1.25 / 83% / 5 |
| heldout Vickrey | 6 | 120 × 2 | 2.42 / 30% / 102 | 1.29 / 80% / 46 | 1.31 / 75% / 22 | 1.15 / 88% / 60 | 1.32 / 77% / 60 | 1.09 / 93% / 30 | 1.09 / 92% / 21 | 1.16 / 87% / 13 |
| live-heldout FirstPrice | 6 | 120 × 2 | 5.17 / 1% / 110 | 4.16 / 7% / 79 | 2.82 / 23% / 53 | 4.03 / 13% / 97 | 3.63 / 18% / 88 | 1.91 / 49% / 30 | 1.83 / 52% / 20 | 1.93 / 42% / 10 |
| live-heldout Vickrey | 6 | 120 × 2 | 5.07 / 2% / 109 | 4.03 / 12% / 78 | 2.35 / 33% / 35 | 3.83 / 11% / 89 | 2.79 / 23% / 69 | 1.73 / 55% / 39 | 1.64 / 58% / 30 | 1.89 / 50% / 14 |
| mixed FirstPrice | 6 | 120 × 2 | 3.85 / 5% / 106 | 2.37 / 34% / 53 | 1.60 / 57% / 21 | 2.15 / 44% / 76 | 1.63 / 60% / 54 | 1.16 / 87% / 17 | 1.17 / 86% / 9 | 1.52 / 60% / 4 |
| mixed Vickrey | 6 | 120 × 2 | 3.70 / 8% / 105 | 2.53 / 32% / 62 | 1.94 / 38% / 22 | 2.02 / 48% / 70 | 1.82 / 47% / 57 | 1.37 / 70% / 27 | 1.35 / 72% / 19 | 1.55 / 58% / 10 |
| live-heldout FirstPrice | 10 | 80 × 2 | 7.91 / 0% / 110 | 5.22 / 6% / 95 | 5.03 / 4% / 92 | 7.47 / 1% / 107 | 7.77 / 0% / 110 | 3.61 / 17% / 61 | 3.11 / 21% / 50 | 2.52 / 35% / 35 |
| live-heldout Vickrey | 10 | 80 × 2 | 7.96 / 0% / 108 | 5.07 / 5% / 92 | 4.13 / 9% / 86 | 7.14 / 1% / 104 | 6.78 / 4% / 96 | 3.63 / 18% / 69 | 3.45 / 19% / 59 | 3.18 / 23% / 43 |
| live-heldout FirstPrice | 8 | 80 × 2 | 6.61 / 0% / 109 | 5.03 / 3% / 90 | 4.12 / 8% / 85 | 5.86 / 2% / 105 | 6.04 / 1% / 107 | 2.97 / 23% / 50 | 2.71 / 32% / 40 | 2.29 / 38% / 25 |
| live-heldout Vickrey | 8 | 80 × 2 | 6.71 / 1% / 108 | 5.15 / 4% / 89 | 3.57 / 18% / 70 | 5.67 / 1% / 102 | 4.98 / 6% / 88 | 2.73 / 31% / 54 | 2.38 / 38% / 44 | 2.17 / 44% / 27 |
| strong FirstPrice | 6 | 120 × 2 | 5.72 / 0% / 112 | 5.27 / 1% / 93 | 4.17 / 8% / 73 | 5.35 / 0% / 105 | 5.35 / 0% / 105 | 3.10 / 23% / 47 | 2.86 / 28% / 42 | 2.57 / 30% / 31 |
| strong Vickrey | 6 | 120 × 2 | 5.81 / 0% / 109 | 5.28 / 2% / 90 | 3.45 / 16% / 51 | 5.31 / 1% / 97 | 4.85 / 4% / 78 | 3.09 / 21% / 50 | 2.95 / 25% / 41 | 2.71 / 28% / 26 |

Choosing between the finalists: `F0.7-k1` has the better mean place over all 14 settings (2.16 vs 2.28) and is better in every strong or large-table field. `F0.5-k1` is better against weaker fields. Paired intervals are in `results/ho-*.txt`.

## Final confirmation (SIM, fresh deals 50000+; F0.7-k1 vs others: Δplace with 95% CI)

| Setting | F0.7-k1 place / win | F0.5-k1 Δplace | challenger Δplace | baseline Δplace |
|---|---|---|---|---|
| live-heldout V (6) | 1.97 / 45% | −0.15 [−0.31, −0.01] | +1.00 [0.76, 1.26] | +3.17 [2.96, 3.40] |
| live-heldout FP (6) | 1.94 / 45% | −0.14 [−0.27, −0.01] | +1.71 [1.46, 1.95] | +3.30 [3.13, 3.46] |
| exzell V | 2.29 / 45% | −0.06 [−0.25, 0.14] | +1.66 | +3.17 |
| exzell FP | 3.31 / 23% | +0.90 [0.70, 1.09] | +2.49 | +2.63 |
| strong V | 2.79 / 28% | +0.12 [−0.07, 0.29] | +2.17 | +3.00 |
| strong FP | 2.58 / 25% | +0.58 [0.35, 0.81] | +2.92 | +3.08 |
| 8 seats V | 2.42 / 38% | +0.15 [−0.04, 0.38] | +2.81 | +4.28 |
| 8 seats FP | 2.41 / 35% | +0.32 [0.08, 0.56] | +3.85 | +4.34 |
| miss 10% V | 1.90 / 42% | +0.04 [−0.08, 0.15] | +1.37 | +3.35 |
| miss 10% FP | 2.02 / 37% | +0.02 [−0.12, 0.17] | +1.83 | +3.19 |

## LOCAL-SERVER games (real official server, Vickrey, one-second scheduler, frontier practice opponents)

Our adapter plays under the harness label "baseline". `BOT_POLICY` sets the actual policy.

| Run | Policy | Our place | Our score | Cash left | Field scores | Notes |
|---|---|---|---|---|---|---|
| p0 | pacer | 1 | 145 | 10 | 145,87,73,45,44,30 | 61 bids, 7 words, 0 reducer failures |
| p1 | pacer | 2 | 95 | 7 | 110,95,65,54,40,33 | |
| p2 | pacer | 1 (tie) | 122 | 8 | 122,122,77,53,50,15 | |
| p3r | pacer | 3 | 87 | 12 | 123,90,87,61,44,35 | SIGKILL at 30 s, restarted with same token; 36 bids after restart |
| p4 | pacer | 1 | 173 | 10 | 173,106,79,38,37,20 | after the clock-skew fix |
| p5r | pacer | 1 | 170 | 10 | 170,83,81,44,32,22 | SIGKILL at 20 s and restart |
| p6 | pacer | 3 | 85 | 11 | 134,100,85,70,40,22 | |
| b1 | baseline | 6 | 45 | 111 | 123,107,100,61,51,45 | |
| b2 | baseline | 6 | 33 | 120 | 115,93,82,67,34,33 | |
| b3r | baseline | 6 | 24 | 107 | 154,117,93,32,30,24 | restart |
| b4 | baseline | 4 | 59 | 102 | 117,74,71,59,51,28 | |

Every run passed the harness assertions:
- anonymous and illegal actions rejected
- full 68-round match
- post-end actions rejected
- adapter exits cleanly on SIGINT
- 0 unexpected errors

Client action latency p95 was 2.8–4.9 ms on loopback. Evidence is in `live-evidence/`. This is integration evidence, not a strength estimate: 11 games, one opponent league, and the deals are not paired.

## Known differences from the live tournament

- The tournament's auction type, `matchSize`, Swiss rounds and top cut are set by the admin and are unknown. Tables can be larger than `matchSize`, because leftover entrants are spread one per table. Larger tables mean fewer auctions (98 − 5·seats). The pacer still led at 8 and 10 seats in SIM, with mean place 2.2–3.2.
- Maincloud latency is tens to hundreds of ms, not loopback. Liquidation in the last 2–3 auctions needs several word round trips. The local games completed them, but at real latency there is less margin.
- First-price was not tested on the local server, because the practice lobby is Vickrey-only. First-price is SIM only.
- The opponents are re-implementations from published descriptions, using our word engine. The real bots' rack valuation (Monte Carlo, target words) differs, and the strongest live bots have no public code.
- Clearing prices at large tournament tables were reported at 25–40 in another event. The pacer's market estimate adapts from observed `paid`, but its per-bid cap is 45% of balance outside the last 5 auctions.
- The adapter subscribes to all tables, like the official starter. On maincloud the initial sync includes historical public rows. This was not measured here.
- Tournament registration (`TOURNAMENT_ID`) and the real token flow were not exercised.

## Reproduce

```sh
cd experiments/stress-arena && npm ci
npx tsx run.ts live-heldout Vickrey 30000 120 2 l-M1-F0.7-k1,l-M1-F0.5-k1,baseline,baseline-x1.5,learned,challenger,l-M1-F0-k1,l-M1.3-F0-k0
SEATS=8 npx tsx run.ts live-heldout FirstPrice 40000 80 2 l-M1-F0.7-k1,challenger,baseline
MISS=0.1 npx tsx run.ts live-heldout Vickrey 50000 100 2 l-M1-F0.7-k1,baseline
./grid.sh live-tune Vickrey 10000 80 2 results/grid-V      # tuning grid
# real local server (after `npm run setup` in practice/live-server):
cd ../../practice/live-server
PRACTICE_PORT=3311 PRACTICE_ADAPTER=1 PRACTICE_ADAPTER_ENTRY=$PWD/../../bot-starter/src/index.ts BOT_POLICY=pacer npm run test:live
PRACTICE_ADAPTER_RESTART_MS=30000 ...   # adds a SIGKILL + same-token restart mid-match
```
