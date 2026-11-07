# Tough-league challenger results

Completed a fixed-budget policy optimization run in **684.0 seconds**: **8,064 training games, 4,320 validation games, and 6,912 final-test games**. The final test used **48 independent deals**, each played in all six seats. The baseline, source, dictionary and selected weights passed hash verification. No failed games or conditions were excluded.

## What improved

- On the fixed frontier league, outright wins rose from **28.1% to 53.1% in Vickrey** and **43.8% to 62.5% in first-price**. These comparisons use the same new deals and seats for both policies; they do not compare across historical seed sets.
- Across all six final settings, first-price mean score rose **17.67 points** (95% deal-cluster interval **14.54 to 20.83**) and outright wins rose from **39.8% to 68.3%**.
- Vickrey is mixed. Its aggregate score gain was **1.54 points** (95% interval **−0.81 to 3.98**), so this run does not establish an aggregate Vickrey score improvement. Both auctions lose score against the final portfolio population; Vickrey also loses score against the final balanced population.
- Keep the challenger as an experimental alternative, with the frozen baseline available. The results do not support a universal upgrade or tournament-win claim.

## Complete final results

Each row has 288 games per policy: 48 deals × 6 seats. Intervals are paired percentile bootstrap intervals over 48 deal means, with 5,000 resamples. They are per-comparison intervals without multiple-comparison correction.

| Auction | Opponent setting | Baseline score | Challenger score | Baseline outright wins | Challenger outright wins | Paired score gain, 95% interval |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Vickrey | pressure | 80.05 | 89.14 | 38.9% | 50.7% | +9.09 [+4.95, +13.22] |
| Vickrey | portfolio | 126.40 | 122.02 | 82.3% | 71.9% | -4.37 [-8.26, -0.48] |
| Vickrey | balanced | 111.11 | 105.32 | 63.9% | 57.6% | -5.80 [-9.54, -2.08] |
| Vickrey | frontier-mixed | 100.09 | 116.53 | 28.1% | 53.1% | +16.44 [+12.39, +20.76] |
| Vickrey | balanced-miss-10pct | 107.31 | 106.76 | 53.1% | 52.4% | -0.55 [-3.76, +2.70] |
| Vickrey | balanced-one-word | 111.20 | 105.64 | 63.9% | 57.6% | -5.57 [-9.29, -1.87] |
| FirstPrice | pressure | 70.76 | 101.95 | 23.6% | 74.0% | +31.19 [+26.82, +35.67] |
| FirstPrice | portfolio | 150.68 | 136.11 | 97.6% | 94.1% | -14.57 [-19.46, -9.57] |
| FirstPrice | balanced | 84.34 | 111.35 | 24.7% | 63.5% | +27.01 [+21.47, +32.67] |
| FirstPrice | frontier-mixed | 108.24 | 119.86 | 43.8% | 62.5% | +11.61 [+7.94, +15.42] |
| FirstPrice | balanced-miss-10pct | 82.96 | 106.77 | 24.3% | 52.4% | +23.81 [+19.41, +27.98] |
| FirstPrice | balanced-one-word | 84.45 | 111.40 | 24.7% | 63.5% | +26.94 [+21.44, +32.58] |

The frontier outright-win increases were **25.0 percentage points** (95% interval **18.4 to 31.3**) in Vickrey and **18.8 points** (**11.5 to 26.4**) in first-price. Shared wins, fractional wins, pairwise finishes, rank, spending, balance, stranded tiles, words and missed windows are all retained in the JSON report.

## Experiment controls

- Training: `1000001`–`1000016`. Validation: `1100001`–`1100024`. Final: `1200001`–`1200048`. The prior robust-test range `710001`–`710032` was not reused.
- Separate deterministic population seeds produced 45 distinct generated opponent profiles across three splits and three families. They share policy implementations, so this tests parameter/population shift rather than completely independent software or real entrants.
- The historical frontier population is a separate fixed benchmark. Its frozen opponents are intentionally unchanged.
- Selection used only the stated validation objective: pairwise finish score plus 0.002 times game score. Four training finalists and the frozen baseline competed on validation, separately for each auction type.
- The weight artifact and SHA-256 were written before any final-test game. No training or model selection used the final test. The generated policy reproduces exactly the evaluated model’s complete traces in the runtime parity tests.
- All settings and auction types sharing a deal remain together in aggregate bootstrap clusters. Additional seats and settings do not increase the independent-deal count beyond 48.

## Verification and artifacts

- **40 tests pass**, including 600 challenger budget/legality checks, per-auction wrapper parity, full-game trace equivalence, split-disjoint population profiles, and the retained source-backed server-rule tests.
- Strict TypeScript check passes.
- `challenger_verify.ts` independently checks all 19,296 raw rows, split membership, duplicate keys, cash conservation, the validation choice, all locked source/baseline/weight hashes, and recomputes aggregate intervals.
- Frozen weights: `challenger-weights.json`. Drop-in module: `challenger_policy.ts`. Its SHA-256 provenance is `77a7c5b5c7fdef82a896d51c593e14d023ca12a5dd09463c90c084f568d30407`.
- Full experiment: `results/challenger-20261107/`. Start with `training-plan.json`, `final-evaluation-lock.json`, and `report.json`.
- Verification records: `validation/challenger/`.

## Scope and limits

This experiment tunes eight coefficients for each auction type in the existing policy architecture. It is black-box policy optimization, with no neural-network training, LLM inference or external paid services. The old frozen policy and earlier experiments remain unchanged.

The offline model does not measure actual networking, callback races, scheduler contention, authentication or live entrant behavior. The missed-window setting is synthetic. Current-rack portfolio search is exact up to 16 tiles, then uses a bounded fallback. Only 48 independent final deals were evaluated, and the many displayed comparisons are not multiplicity-adjusted.

Actual practice-server integration is verified and documented separately from these performance results. A successful live integration match is not evidence of tournament strength.
