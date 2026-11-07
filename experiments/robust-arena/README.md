# ScrabbleBot robust arena

An offline follow-on to the archived learned-policy experiment. This package improves the **quality of the evidence**, not the live bot. It does not change the frozen weights, connect to a server, submit bids, join a tournament, register an account, or require credentials.

## What changed

- **Actual source-backed rule tests.** Selected unchanged declarations and reducer callbacks are extracted from official upstream commit `b5ccb36aa238ad16692f8d6af54da15ef9f11324` and executed against a small in-memory fixture. Tests cover 800 auction fixtures and 2,340 simulated bidding comparisons, word legality, repeated letters, reward rounding, cash/score accounting, bag distribution, bid replacement, dictionary ordering, and the final-tile timing distinction between server and external bots. Source hashes are checked. See `reference/README.md` for the exact boundaries.
- **Stronger, more diverse opponents.** In addition to the original leagues: five copies of the frozen learned policy, a mixed frontier league, and independent portfolio-search opponents. Portfolio search maximizes total current-rack reward across a partition into multiple words rather than using the original best-word/one-missing-letter heuristic. One opponent adapts to public paid prices. No live entrant data is used.
- **Independent randomness.** Deal, server jitter, tie priority, and synthetic missed-window draws use separate keyed streams. Changing bids or policy state cannot perturb the exogenous draws. Policy factories reset all match-specific state for each game.
- **Seat-balanced evaluation.** Each deal is replayed in all six focal seats. Paired bootstrap intervals resample independent deals, with six seats treated as one correlated cluster. Outright wins, server-style shared wins, fractional wins, pairwise finish scores, ranks, spending, stranded tiles and missed windows are reported separately.
- **Explicit timing stresses.** Optional 10% missed external action windows and one-word-per-window limits expose dependence on perfect callback delivery. These are controlled stress scenarios, not measurements of network behavior.
- **Reproducible evaluation plan.** The frozen policy, settings, fresh seed range and code/data hashes are written before the evaluation workers start. No training or winner selection occurs on these evaluation seeds.

## Reproduce

Node 20.11+ and npm:

```sh
npm install
npm test
npm run build
npm run evaluate
```

Default evaluation: 32 fresh deals (`710001`–`710032`), six seats, two frozen comparison policies, 14 auction/league/stress settings, **5,376 full games**. Three child processes run jobs in parallel. Results go to `results/robust-evaluation/`. Re-running overwrites that directory; use a different `RESULT_DIR` to preserve a run.

Quick smoke run, on a separate seed range and output directory:

```sh
DEALS=2 SEED_START=610001 WORKERS=3 RESULT_DIR=results/my-smoke npm run evaluate
```

Adjust `WORKERS` to fit available CPU and memory. Parallelism is across independent experiment jobs; no LLM is called inside a game. Each process constructs its dictionary once. The reported wall-clock call maxima include contention and are diagnostic, not latency guarantees.

## Results and how to interpret them

See `RESULTS.md` for the completed run and `results/robust-evaluation/report.json` for all metrics and paired intervals. Per-game rows retain seed, seat and policy so comparisons can be independently recomputed.

Do not compare the new scores directly with the old archive as if only the opponent changed: v2 uses newly domain-separated deal randomness and a fresh seed range. Compare frozen and original **within the same v2 setting**. The exact same-agent mirror is an internal control: over all six seats, the mean pairwise score must be 0.5 and fractional win share 1/6.

The archived experiment measured outright wins. Official server win statistics also count a tie for first as a win. Both are now labeled explicitly; fractional win share avoids counting multiple winners as multiple full wins when studying symmetry.

## Files and provenance

- `arena_v2.ts`: deterministic arena, canonical dictionary input, optional traces and timing stresses.
- `league.ts`: frozen opponent factories and independent portfolio-search architecture.
- `evaluate.ts`, `evaluate-worker.ts`, `statistics.ts`: parallel jobs, pre-written plan, raw data and deal-cluster bootstrap.
- `tests/`: source parity, deterministic RNG, state isolation, conservation, stress, statistics and symmetry tests.
- `reference/`: exact pinned upstream fixtures with URLs and hashes.
- `original_strategy.ts`, `original_simulator.ts`, `parametric_strategy.ts`, `arena.ts`, `learned_policy.ts`, `learned-weights.json`, `experiment.test.ts`, and `wordlist.txt`: byte-preserved inputs from the earlier experiment. They are copied here to make this package runnable independently. The archived learned-policy experiment and its results remain unchanged.

The legacy `GreedyDictionary` preserves input-order ties. `CanonicalDictionary` normalizes v2 inputs to length descending, then lexical ascending, matching official server dictionary selection. This correction is confined to v2; it does not rewrite the archived experiment.

The original `experiment.test.ts` safety/runtime tests are retained, but this package does not claim the original starter's policy-preference suite passes with the learned wrapper. The earlier compatibility limitations remain in the archived experiment.

## Limits

This is a source-pinned model, **not a live-server integration test or tournament forecast**. The test harness mocks DB rows, clock, scheduling markers and match-end side effects. It does not test SpacetimeDB transactions, schema decoding, authentication, subscriptions, scheduler races, rollback, ratings or tournaments. Small wordlists are injected into source tests; the production evaluation dictionary is separately hash-pinned from the supplied starter.

The league contains our own strategies, not other entrants. Even the independent policy is a synthetic opponent. Portfolio search is exact on current racks up to 16 tiles and falls back to a longest-word approximation on larger racks. It has no full-game planning or hidden-rack inference. Shared dictionary caches store deterministic values only; adaptive price history is fresh for every game.

Intervals are descriptive, per-comparison percentile bootstrap intervals from 32 independent deals. They are not adjusted for multiple comparisons and do not justify a universal win claim. This follow-on deliberately does not tune or promote a new model using the evaluation outcomes.
