# Tough-league challenger

This adds a fixed-budget, reproducible black-box optimization experiment to the robust arena. It tunes eight policy coefficients separately for Vickrey and first-price auctions. It does not train an LLM or neural network, replace the frozen baseline, or use real entrant data.

## Run

Use Node 20.11+ and the existing package dependencies:

```sh
npm install
npm test
npm run build
WORKERS=3 node --import tsx challenger_train.ts
node --import tsx challenger_export.ts
node --import tsx challenger_verify.ts
```

The default output directory is `results/challenger-20261107/`. The runner refuses to overwrite an existing training plan. An exact replay may use a new `CHALLENGER_RESULT_DIR`, but it is a replay of already-consumed seeds, **not a new holdout experiment**. For a genuinely new experiment, change the disjoint seed ranges and record a new plan before training. Do not retune against the included final results.

See `CHALLENGER-RESULTS.md` for the completed results and regressions.

## Design

- Training deals: `1000001`–`1000016`; validation: `1100001`–`1100024`; final test: `1200001`–`1200048`. None reuse the prior robust evaluation seeds `710001`–`710032`.
- A deterministic search screens 24 candidates per auction on eight training deals and seats 0/2/4, refines 16 candidates on all 16 training deals and seats 1/3/5, and validates four finalists plus the baseline on 24 new deals and all six seats.
- Selection objective: mean pairwise finish score plus 0.002 times score, averaged equally across three generated opponent families. The frozen baseline is eligible, preventing a forced change when validation favors keeping it.
- Opponent populations use separate seeds for train, validation and final. All 45 generated profiles differ across splits and families. They include rack-aware policies and an independently implemented exact current-rack portfolio search, with adaptive public-price variants. They still share implementation families; they are not independent real-world entrants.
- Final evaluation uses all six seats, both policies, both auction types, three new opponent populations, the historical frontier comparator, and missed-window/one-word stresses. This is 6,912 final games but only 48 independent deal clusters.
- The challenger weights and their SHA-256 are locked before the first final game. Training/evaluation source, dictionary and frozen-baseline hashes are verified unchanged after completion. The final data never choose the weights.
- Bootstrap intervals keep all six seats together. Aggregate intervals also keep settings and auction types sharing the same deal together. They are descriptive, per-comparison intervals without multiple-comparison adjustment.

## Use the frozen policy

Import `prepareDictionary`, `decideBid`, and `chooseWord` from `challenger_policy.ts`. Build the dictionary index before connecting or starting a game. Pass the current `auctionType` to both callbacks; omitted type defaults to `Vickrey`. The module contains plain frozen coefficients and makes no network or LLM calls. Its policy logic remains in the unchanged `parametric_strategy.ts`.

Keep `learned_policy.ts` and `learned-weights.json` as the historical frozen baseline. The generated `challenger-weights.json` includes the complete validation ranking and selection provenance. `results/challenger-20261107/` contains the pre-written plan, every candidate's raw games, the final weight lock, per-condition final games and the report.

## Limits

The source-pinned arena does not reproduce SpacetimeDB networking, callback races, authentication, scheduling, subscription delivery, or tournament competition. Skipped windows are a controlled stress, not a measured network failure rate. Portfolio search is exact only for current racks up to 16 tiles, then uses a bounded fallback. A favorable offline result is evidence within these synthetic leagues, not a universal improvement or tournament-win guarantee. Practice-server verification must be reported separately.
