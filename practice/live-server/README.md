# Live ScrabbleBot practice

Run the **real official SpacetimeDB server**, not the offline simulator. The package publishes the unchanged ScrabbleBot TypeScript module from upstream commit `b5ccb36aa238ad16692f8d6af54da15ef9f11324`, then connects six real WebSocket bots. The default lineup is the preserved enhanced baseline against the frozen mixed frontier league: frozen learned policy, high-pressure, low-price, portfolio-search, and adaptive market-portfolio opponents.

## Start

Requires Node 20.11+, npm, Bash and curl (macOS, Linux, or WSL).

```sh
npm run setup
npm run test:live    # one full game, assertions, clean shutdown
npm start           # repeated live games until Ctrl+C
```

Setup downloads the official **SpacetimeDB 2.14.1** release for your platform, checks its published SHA-256, and installs the locked npm dependencies. Everything stays inside this package or a temporary runtime directory. It does not change your system PATH. Alternatively set `SPACETIME_CLI` to your existing 2.14.1 `spacetime` executable and run `npm ci` plus `npm ci --prefix upstream/spacetimedb`.

The launcher binds **127.0.0.1:3300** only. Database: **scrabblebot-practice**. Set `PRACTICE_PORT=3301` if needed. It never publishes to maincloud, joins the real competition, or opens an external network interface. This package intentionally has no public hosted URL.

The supplied cloud test used an isolated command network, so this localhost address is **not reachable from your laptop or browser**. Run this launcher on your own computer to use its localhost address. Hosting for other computers is a separate deployment, not included here.

## Practice with the challenger

The frozen challenger is included separately. Use `npm run start:challenger` for continuous practice or `npm run test:challenger` for one tested game. The baseline remains the default.

A policy module can export `prepareDictionary(words)`, `decideBid(ctx)` and `chooseWord(ctx)`:

```sh
PRACTICE_POLICY=/absolute/path/to/challenger_policy.ts npm start
PRACTICE_POLICY=/absolute/path/to/challenger_policy.ts npm run test:live
```

The context includes `auctionType`, `myRack`, `myBalance`, `bagRemaining`, `dictionary`, and the current `letter`. This integration never promotes a challenger over the baseline. The live lobby uses official **Vickrey** rules and the default **one-second** auction window; first-price is evaluated offline unless an explicit separate live configuration is added.

## Test the preserved production adapter

The copied `bot-starter/src/index.ts` and `strategy.ts` are byte-identical to the previously supplied enhanced baseline. Generated bindings were added separately. To exercise that exact adapter's connection/subscription/bid/word loop as a separate process:

```sh
PRACTICE_ADAPTER=1 npm run test:live
```

This supplies a temporary local bot token to the child process environment, not the command line, and checks that the process bids, plays words and exits on SIGINT. Do not combine this baseline-adapter check with `PRACTICE_POLICY`.

## State, privacy and stopping

- Database data is in memory. Each launch starts fresh; **all game state disappears when stopped**.
- Local anonymous identities are registered with the existing official team/nonce/credential reducers. Tokens remain in process memory and are never printed or saved.
- The standalone server creates temporary signing keys. Its entire temporary runtime directory is removed on launcher exit. No real competition credentials are used.
- Only your own rack view is available to each bot. The observer sees public game state, not hidden racks or bids. The adaptive opponent consumes only public auction outcomes.
- Ctrl+C stops clients and server. Reports contain results and timings, not secrets. `reports/live-integration.json` and the runtime logs are replaced by the next run; copy them first to preserve a particular run.

## Verification

`npm run build` typechecks both the practice runner and preserved production adapter. `npm run test:upstream` runs the official module's unit tests. `npm run test:live` provisions a fresh real database, verifies anonymous rejection and rack isolation, rejects illegal bids and words, completes a match, reconnects one bot with its memory-only token, rejects post-end actions, and shuts down. Real scheduling, reducer transactions, serialization, subscriptions and WebSocket traffic are exercised. These local timings and individual game scores are integration evidence, **not tournament-strength estimates**.

The server's unchanged source/wordlist hashes are recorded in `PROVENANCE.json`. The source remains subject to its included MIT license. SpacetimeDB is a separate official dependency with its own license.

Official sources:
- https://github.com/clockworklabs/scrabblebot/tree/b5ccb36aa238ad16692f8d6af54da15ef9f11324
- https://github.com/clockworklabs/SpacetimeDB/releases/tag/v2.14.1
