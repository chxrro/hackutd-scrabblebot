# Offline benchmark

Run from bot-starter:

```sh
node --import tsx --test src/simulator.test.ts src/enhanced.test.ts
node --import tsx src/simulate.ts 200
```

`simulate.ts` imports strategy.ts directly. No network or credentials are used. Each run overwrites its `simulation-N.json` output, where N is the number of games per scenario. Reports record seeds, dictionary size, warm decision runtimes, initialization cost and source hashes (source hashes added after the initial 200-seed run).

## Initial results: 200 seeds per scenario

Six players per match, 100 starting currency, five hidden starting tiles, full 172,820-word dictionary. 800 enhanced matches and 800 paired official-starter matches total. Every pair begins with the same seed and deal.

| Auction | Opponents | Enhanced mean score | Starter mean score | Enhanced outright win rate |
| --- | --- | ---: | ---: | ---: |
| Vickrey | Five official starters | 249.46 | 30.18 | 100% |
| Vickrey | Five mixed server bots | 201.35 | 18.61 | 100% |
| FirstPrice | Five official starters | 135.63 | 30.18 | 98% |
| FirstPrice | Five mixed server bots | 99.60 | 24.22 | 74% |

Mixed means one Cheapskate, two ValueBidder and two Aggressive bots. Seed range is 10001–10200. Results are in `simulation-200.json`. Wall time 23.85 seconds. Strategy dictionary preparation took 300ms. Warm bid p99 2.53ms, max 60.10ms; word p99 0.55ms, max 8.02ms. These timings depend on the machine and concurrent load.

## Rules and limitations

- External players act during open auctions, including initial-rack plays. Multiple successive word plays are allowed. Held racks are reconsidered every auction, enabling deadline liquidation.
- Server-controlled bots place their bids when each auction opens and play exactly one longest word of length at least three after winning. They may play the last winning tile. External players may not: the server ends the match atomically on the last resolution.
- Starter bots bid face value plus two for an unseen letter, otherwise face value, and immediately play longest words of length at least two.
- Server bids include uniform integer jitter from -2 to +2, clamped between one and available balance. Ties shuffle before stable descending bid sorting.
- Vickrey winners pay the second bid or a reserve of one. FirstPrice winners pay their own bid. Unbid tiles are discarded. Words add reward to both score and currency.
- A seeded PRNG provides repeatability, not byte-for-byte equivalence to the live server's PRNG. Later random draws in paired games can diverge as the number of positive bids changes.
- Greedy tie ordering follows the loaded length-sorted dictionary. Server dictionary implementation was not available locally to verify equal-length tie ordering.
- This is an offline proxy, not tournament evidence. It excludes network latency, reconnects, reducer scheduling races and adaptive human-authored opponents. The win rates are not guarantees.
