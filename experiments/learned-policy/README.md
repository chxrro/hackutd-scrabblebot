# ScrabbleBot learned-policy experiment

Independent offline experiment based on the supplied HackUTD starter. The live bot and original strategy have not been changed. No credentials, network services, account access, registration or live submissions are used.

## What is trained

An eight-parameter policy is trained using cross-entropy black-box optimization over complete simulated six-player games. The parameters control face-value bidding, immediate and future rack value, first-price bid shading, cash liquidation, word-length preference, endgame liquidation and the bid cap. This is a trained compact policy, not a neural network or an LLM. Its arithmetic is cheap; the dictionary trie search remains the main runtime cost.

The search and safety rules remain hand-written. The experimental model also allows larger fixed caps for immediate/future feature contributions (32/12 versus the original 16/6), so the comparison includes that small architecture change as well as learned coefficients. This is deliberately a small, interpretable experiment that can run tonight without a GPU. Training changes coefficients, not the dictionary or the game rules.

## Run

Requires Node 20.11+ and npm. Run in this directory:

```sh
npm install
npm test
npm run train
```

Training writes `learned-weights.json`, per-game held-out data under `reports/`, and the aggregate `reports/learning-report.json`. The supplied report was produced from real local simulation runs. Training seed: 772211 for the optimizer. Default settings: 4 generations, 20 candidates per generation, 18 training deals, up to 16 candidate finalists tested on 36 validation deals, and 100 entirely held-out deals for each auction/opponent combination. Different candidates repeatedly see the same training seeds; the total training-game count is not a count of unique deals.

For a quick smoke run, use `GENERATIONS=1 POPULATION=4 TRAIN_GAMES=6 HOLDOUT_GAMES=2 npm run train`. This overwrites results, so preserve the supplied reports first. Full reproduction uses the defaults above. Wall times and latency depend on machine and load.

## Opponents and comparison

Both Vickrey and first-price auctions are evaluated against:

1. Five official starter policies.
2. Mixed server-style Cheapskate, ValueBidder and Aggressive bots.
3. Five diverse rack-aware policies: original strategy, more aggressive bidding, conservative bidding, greedy immediate liquidation and earlier cash-out.
4. Five copies of the original enhanced strategy.

Each held-out deal is run with the learned policy, untouched original enhanced policy and official starter in the same focal seat. The focal seat rotates. A separate deterministic random stream for each round gives paired policies identical deal order, server jitter and tie priority even when bids differ. Training and validation never see the held-out seeds. The frozen winner is written before held-out evaluation starts.

The optimizer maximizes mean pairwise finishing score plus 0.002 times game score. It is not directly optimized for outright first place. The report includes mean score, outright first-place rate, pairwise success, mean rank and paired mean-score differences with approximate 95% intervals.

## Limits

This is a local rules mirror, not live-server or tournament evidence. Network latency, connection loss, asynchronous callback races, live server scheduling, hidden starting-rack inference and adaptive opponent learning are not modeled. Smart opponents share the same core trie/utility design, so the league is diverse in behavior but narrow in architecture. Training and validation use small seed sets; the held-out test is essential and a weak result should not be hidden.

Rules follow the inspected server source rather than stale prose in its guide: no-bid letters are discarded; ties are randomized; words pay score and cash; simulated server bots may use the last tile immediately but an external bot cannot. This simulator is not claimed to replicate the server's exact PRNG.

Original source is preserved in `original_strategy.ts` and `original_simulator.ts`. `parametric_strategy.ts` adds tunable parameters. `arena.ts` adds heterogeneous opponents and paired counter-keyed randomness. `train.ts` runs training, frozen selection and held-out testing. `experiment.test.ts` checks legality, deterministic runs and accounting.

## Runtime integration is optional and unverified live

The frozen model is in `learned_policy.ts` with eight literal coefficients. Re-create it after retraining using `npm run emit-runtime`. To trial it in a separate copy of the starter, copy `parametric_strategy.ts` into that copy's `src/` and use `learned_policy.ts` as its `src/strategy.ts`. Keep the current bot intact for rollback. The wrapper exports the existing API; no runtime JSON file, Python, GPU or paid API is required.

Do not assume the original full test suite is unchanged: a compatibility run of the original 15 strategy tests passes 10 and fails 5 assertions that encode the previous policy preferences (immediate seven-letter cash-out, liquidation at 3–4 remaining tiles, and specific completion-letter priority). Their full output is retained in `reports/old-behavior-compatibility.log` and their unchanged expectations are in `compatibility/`. These are disclosed strategy behavior changes, not legality failures. The experimental suite checks the frozen weights and the new late-liquidation behavior explicitly. An integration review should update behavioral expectations consciously, retain all safety/legality checks, and validate live event timing before deployment.
