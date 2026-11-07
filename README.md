# HackUTD ScrabbleBot

A Scrabble-style letter-auction bot, offline simulator, and compact learned-policy experiment. This is an independent project based on [Clockwork Labs' ScrabbleBot](https://github.com/clockworklabs/scrabblebot), not an official HackUTD or Clockwork Labs entry or endorsement.

## Start here

Requires Node.js 20.11+ and npm. The offline commands need no account, bot token, paid API, GPU, or server connection.

```sh
cd bot-starter
npm ci
npm test
npm run build
npm run demo
```

For 200 seeded games per scenario, run `npm run benchmark -- 200`. See [the bot guide](bot-starter/README.md) for strategy details, reported results, and the separate live setup process.

## Repository layout

- [`bot-starter/`](bot-starter/): enhanced heuristic bot, live adapter, offline demo, simulator, tests, and baseline reports.
- [`experiments/learned-policy/`](experiments/learned-policy/): isolated eight-parameter policy training, frozen weights, held-out results, and experimental tests. The original bot remains unchanged.
- [`experiments/robust-arena/`](experiments/robust-arena/): source-backed rule tests, stronger independent opponents, seat-balanced evaluation, and synthetic timing stresses for the unchanged frozen policy.
- [`spacetimedb/`](spacetimedb/): inspected upstream game/schema source and official dictionary used as reference. This is not a complete deployable server checkout.
- [`docs/`](docs/): upstream bot guide and repository validation notes.
- [`UPSTREAM-README.md`](UPSTREAM-README.md): retained upstream documentation. It describes the full upstream project, not all of this smaller repository; source code takes precedence where prose is stale.

## Learned-policy experiment

```sh
cd experiments/learned-policy
npm install
npm test
npm run build
```

`npm run train` repeats training, validation, and held-out evaluation and **overwrites** the supplied weights and reports. See the experiment [README](experiments/learned-policy/README.md) and [results summary](experiments/learned-policy/SUMMARY.md) before running it. The supplied model is an interpretable black-box-optimized policy, not a neural network or LLM.

The archived experiment improved mean score in all eight tested offline settings. Those results use a fixed synthetic opponent league and do not establish live tournament performance. The old policy's behavioral compatibility tests intentionally remain as evidence: 10 passed and 5 failed when applied to the learned wrapper. Do not treat that wrapper as a drop-in, live-validated replacement.

## Robust arena follow-on

The [robust arena](experiments/robust-arena/README.md) adds source-pinned rule parity tests, independent portfolio-search opponents, all-seat paired comparisons, deal-cluster uncertainty intervals, and synthetic missed-action-window stresses. It improves simulator coverage and the quality of the evidence; it does not retrain the policy or replace the live bot.

The [new results](experiments/robust-arena/RESULTS.md) include 5,376 games over 32 fresh deals. Against the stronger frontier league, the frozen learned policy wins outright in 30.7% of Vickrey games and 39.6% of first-price games. Those local results are much less reassuring than the earlier weak-opponent win rates and are not tournament forecasts. The 34-test robust suite and TypeScript check were independently repeated during integration. All baseline and archived experiment files remain unchanged.

## Status and safety

- No live account, team, credentials, tournament registration, or submission was created while preparing this project.
- No live match or reconnect behavior has been validated. The simulator does not model every timing, networking, or opponent behavior.
- Keep `.env` files, bot-token files, and credentials out of Git. Dependency directories and runtime outputs are ignored.
- The live adapter automatically bids and submits words once configured. Follow its guide and verify current organizer requirements before connecting it.
- This repository starts private. Confirm submission visibility requirements before making it public or sharing it.

## Provenance

The starter archive was based on upstream commit [`b5ccb36aa238ad16692f8d6af54da15ef9f11324`](https://github.com/clockworklabs/scrabblebot/tree/b5ccb36aa238ad16692f8d6af54da15ef9f11324). Upstream MIT notices are retained in [`LICENSE`](LICENSE). The initial contents combine the baseline starter and learned-policy experiment prepared on 2026-11-07. Archived benchmark logs describe those earlier runs; see [validation notes](docs/VALIDATION.md) for checks repeated during repository preparation.
