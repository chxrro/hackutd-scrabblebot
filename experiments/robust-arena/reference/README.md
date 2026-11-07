# Pinned server reference and test boundaries

The `server-*.ts` files are official upstream source snapshots supplied through the GitHub connector, pinned to commit `b5ccb36aa238ad16692f8d6af54da15ef9f11324`. See `SOURCES.json` for verified upstream permalinks and local content hashes. They are reference fixtures, not application modules. Keep them unchanged when improving the simulator.

`tests/server-reference.ts` parses these files with the TypeScript AST, selects original declarations and the original `submitBid` / `submitWord` reducer callbacks, and transpiles them without rewriting their bodies. It evaluates them in a Node VM with no credentials, network client, SDK, live database, or server process. This executes actual source logic rather than a second handwritten copy of the rules.

## Executed upstream behavior

- `closeAuction`, including positive-bid filtering, shuffle then stable sort, first-price/Vickrey payment, single-positive-bid reserve, rack credit, pending-bid deletion, and match termination or next-auction scheduling.
- `playWord`, including repeated-letter checks before writes, tile consumption, integer-division rewards, cash credit, score credit and word-play records.
- `decideBid`, across all three simulated strategies, 26 letters, six balances and five jitter values: 2,340 differential comparisons.
- `drawLetter`, letter values, multipliers and all 98 bag tiles.
- Dictionary lookup and longest-then-lexicographic word selection.
- `submitBid` and `submitWord` callbacks, including timing, lowercase normalization, dictionary validation, ASCII restrictions, minimum length and match-state gates.

## Differential tests

The suite compares 800 auction fixtures with the archived mirror and the v2 `resolveWithPriority` implementation, including random tie priority. It compares final-tile behavior and a two-auction external-play window with `gameV2`. The final tile can be used immediately by a simulated server winner; an external client's subsequent word reducer is rejected because the match has already ended.

The legacy `GreedyDictionary` resolves equal-length ties in input order. That file is intentionally preserved. The canonical v2 dictionary must normalize input to length descending, then lexical ascending. Tests explicitly retain the legacy-input discrepancy rather than claiming arbitrary input ordering has server parity.

## Mocked boundaries and limits

The harness supplies snapshot-valued in-memory rows and the indexes used by these functions. It supplies deterministic inclusive random draws, timestamps and a schedule marker. `onMatchEnded` is replaced by a call counter: rating updates, archive migration, tournaments and result publication are not tested. Small explicit wordlists are injected as the upstream `WORDLIST` constant; this verifies dictionary algorithms, not the provenance or completeness of a production wordlist.

The harness does not emulate database transactions, SDK schema validation (including integer-range decoding), authentication infrastructure, scheduler execution, subscriptions, rollback, concurrency, network latency, PRNG seed compatibility or live service behavior. No-mutation rejection tests concern validations that run before writes, not transactional rollback. Match setup/dealing is not executed by this harness; the bag distribution and draw behavior are tested separately. Explicit v2 racks and bags are deterministic test controls, not an assertion that the server uses the same PRNG or dealing sequence.

Run with `node --import tsx --test tests/server-parity.test.ts`.
