# Learned-policy experiment results

**Offline simulation only. No live tournament or account access.**

## Outcome

The eight-parameter trained policy improved mean score in all eight held-out comparisons. The current bot was preserved unchanged.

| Auction | Five opponents | Learned score | Original score | Learned outright wins | Original outright wins |
| --- | --- | ---: | ---: | ---: | ---: |
| Vickrey | starters | 305.76 | 248.98 | 100% | 100% |
| Vickrey | server-mixed | 289.79 | 202.96 | 100% | 100% |
| Vickrey | smart-mixed | 170.60 | 59.95 | 84% | 2% |
| Vickrey | clones | 205.35 | 69.79 | 99% | 14% |
| FirstPrice | starters | 176.92 | 134.91 | 100% | 99% |
| FirstPrice | server-mixed | 163.64 | 90.64 | 100% | 68% |
| FirstPrice | smart-mixed | 158.72 | 64.87 | 77% | 0% |
| FirstPrice | clones | 188.59 | 71.11 | 100% | 11% |

Each row is 100 games per policy on unseen seed range 410001–410100. All three policies (learned, original enhanced, official starter) were run on the same deals and rotated seats. Full individual scores are retained under `reports/raw-*.json`.

## How much work actually ran

- 4 generations × 20 candidates × 18 training deals = 1,440 training simulation runs.
- 16 finalists × 36 separate validation deals = 576 validation runs.
- 8 auction/opponent settings × 100 unseen deals × 3 comparison policies = 2,400 held-out runs.
- 4,416 complete games total. Repeated candidate evaluations reuse their fixed training deals; this is not 4,416 unique random seeds.
- Learned coefficients were frozen and saved before the held-out tests.
- Optimizer objective: mean pairwise finishing score + 0.002 × own game score.
- Full train/validate/evaluate wall time: 372.4 seconds (6.21 minutes).

## Runtime

- Bid calls: 54,400. Warm p99: 4.04 ms; max 50.95 ms.
- Word calls: 60,132. Warm p99: 0.83 ms; max 60.54 ms.
- Eight learned coefficients, no neural network, no remote model call, no GPU. Dictionary trie indexing is done before connecting in the starter.
- Feature extraction is still a dictionary search, not eight arithmetic operations alone. Timings are local and warm; they do not measure network or event-loop delivery.

## Verification and deployment caveat

Seven experiment tests and strict TypeScript checking pass. The untouched original strategy has the same SHA-256 as the original project. The experimental wrapper is API-compatible but has not been deployed or tested against the live event loop.

Running the original 15 strategy tests against the learned wrapper yields 10 passes and 5 failures because those tests hard-code old policy choices: immediate seven-letter play, liquidation at 3–4 remaining tiles, and a specific completion-letter priority. The failed expectations and log are retained. Do not describe the original full suite as passing against the learned policy. Keep the original as a fallback and update behavior tests deliberately during integration.

## Honest limits

These results establish an improvement against a fixed local opponent league, not a winning tournament bot. The stronger opponents are our own rack-aware variants and copies of the original strategy, not real entrants. They share the same core search design. There is no adaptation to newly observed live opponents. Training and validation use small seed sets. The experiment also increases the fixed caps for immediate/future features from 16/6 to 32/12, so the comparison includes that small architectural change alongside learned coefficients.

No external performance claims, live bids, team creation, credentials or registration were involved. See README.md for reproduction, optional integration and full simulator assumptions.
