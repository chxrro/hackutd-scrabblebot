# Robust arena evaluation results

**Offline only. The frozen model was not retrained or changed.**

Evaluated 5,376 full games in 175.0 seconds using three parallel workers. There were 32 unique fresh deals, each evaluated in all six seats, with two policies in 14 settings. A separate 336-game smoke run used different seeds. No live server or entrant data was collected.

## Main finding

The learned policy still substantially beats the original policy, but the stronger league makes the earlier near-perfect win rates look much less reassuring. Against the new frontier mixture, outright wins were **30.7% in Vickrey** and **39.6% in first-price**, compared with 82.3% and 80.7% against the older smart-mixed opponents. The original policy won 0 of 192 games in either frontier setting. These are local league outcomes, not tournament forecasts.

Against five identical frozen policies, mean pairwise success is exactly 50% and fractional win share is exactly 1/6 across all seats. This is the intended fairness control, not an improvement claim.

## Complete results

Each row has 192 games per policy (32 deals × 6 seats). Score-gain intervals use a paired bootstrap over 32 deal means, keeping the six seats together. They are per-comparison intervals, without multiple-comparison correction.

| Auction | League / stress | Frozen score | Original score | Frozen outright wins | Original outright wins | Paired score gain, 95% interval |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Vickrey | server-mixed / ideal | 283.78 | 198.53 | 100.00% | 100.00% | +85.26 [78.08, 93.17] |
| Vickrey | smart-mixed / ideal | 169.98 | 57.73 | 82.29% | 0.52% | +112.25 [106.74, 118.01] |
| Vickrey | frozen-mirror / ideal | 81.11 | 40.20 | 16.15% | 0.52% | +40.91 [38.91, 42.81] |
| Vickrey | frontier-mixed / ideal | 100.52 | 45.39 | 30.73% | 0.00% | +55.13 [51.09, 59.07] |
| Vickrey | portfolio-mixed / ideal | 120.18 | 52.52 | 45.83% | 0.00% | +67.67 [64.67, 70.65] |
| Vickrey | frontier-mixed / miss-10pct | 95.68 | 45.16 | 24.48% | 0.00% | +50.53 [46.99, 53.91] |
| Vickrey | frontier-mixed / one-word | 100.52 | 45.39 | 29.69% | 0.00% | +55.13 [51.09, 59.07] |
| FirstPrice | server-mixed / ideal | 163.60 | 100.58 | 100.00% | 75.52% | +63.02 [56.64, 69.54] |
| FirstPrice | smart-mixed / ideal | 161.65 | 63.17 | 80.73% | 0.52% | +98.48 [92.80, 104.05] |
| FirstPrice | frozen-mirror / ideal | 80.94 | 40.70 | 16.67% | 0.52% | +40.23 [37.76, 42.43] |
| FirstPrice | frontier-mixed / ideal | 103.33 | 41.81 | 39.58% | 0.00% | +61.52 [57.81, 65.48] |
| FirstPrice | portfolio-mixed / ideal | 127.50 | 52.77 | 53.12% | 0.00% | +74.73 [69.88, 79.56] |
| FirstPrice | frontier-mixed / miss-10pct | 101.42 | 45.68 | 38.54% | 1.04% | +55.74 [51.84, 59.96] |
| FirstPrice | frontier-mixed / one-word | 103.47 | 41.81 | 39.58% | 0.00% | +61.67 [57.98, 65.59] |

## Stress observations

- Skipping 10% of external action windows reduced the frozen policy’s observed Vickrey frontier outright-win rate from 30.7% to 24.5%, and mean score from 100.52 to 95.68. First-price outright wins were 39.6% without missed windows and 38.5% with them. The stress applies to all external participants, not only the focal policy.
- One word per window produced little change in this seed set. It does not prove reducer round trips or callback races are harmless. Real timing still needs a separate live integration test.
- The strongest observed bid-call wall time was 83.64 ms and word-call wall time was 27.35 ms, pooled across both focal policies and all concurrent jobs. These are machine-specific diagnostics, not isolated single-policy latency benchmarks or server deadlines.

## Verification

- 34 tests pass; strict TypeScript check passes.
- Source parity tests execute unchanged pinned upstream code, including 800 auction fixtures and 2,340 simulated bid comparisons.
- All five official source fixtures match their fetched Git blob hashes.
- All code and dictionary hashes recorded before evaluation still match the completed run.
- Core inputs and frozen weights remain byte-identical to the earlier experiment.
- Every evaluation setting completed; no failed games or settings were excluded.

## Next useful experiments

The useful next step is to train on the tougher league with fresh training/validation seeds, then evaluate a frozen challenger on another untouched test range. Public result logging and actual callback timing would help calibrate opponents and timing stresses, but this package has not connected to the live service. It does not replace the current bot or claim tournament readiness.

See `results/robust-evaluation/report.json` for shared-win, fractional-win, pairwise, rank, budget and stranded-tile metrics, plus intervals and all raw per-game files.
