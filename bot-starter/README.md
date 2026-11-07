# Enhanced HackUTD ScrabbleBot

A tested, local TypeScript bot based on the official Clockwork Labs starter.
It is not connected to the live service and has not registered for a tournament.

## Run the offline demo first

Requires Node.js 20.11+ (Node 22 or 24 recommended) and npm. No account, API key,
OpenAI credits, GPU, SpacetimeDB installation, or model training is needed.

From this `bot-starter` directory:

```bash
npm ci
npm test
npm run build
npm run demo
```

`demo` uses the complete bundled 172,820-word official dictionary and runs a
seeded match with five built-in-style opponents. It never connects to a server.
For a longer reproducible evaluation: `npm run benchmark -- 200`.

## What the bot does

- Searches dictionary prefixes compatible with its rack using a cached trie.
- Values a letter by existing rack, immediate score gained, one-letter-away
  word opportunities, vowel balance, duplicates, and available cash.
- Holds short early words to aim for the 7+ letter 3x multiplier.
- Chooses reward rather than just word length, and checks leftover word value.
- Sells earlier when cash is low and liquidates near the end.
- Shades first-price bids. Never bids beyond its balance.
- Refuses the final auction tile because external bots cannot play it before
  the server ends the match in the same transaction.

This is a classical search-and-heuristic AI, not an LLM making network calls on
one-second deadlines. AI assistance helped implement and test the code; the
running bot is ordinary deterministic TypeScript. It needs no paid AI service.

## Verified offline results

200 distinct seeded games in each scenario, plus paired starter baselines:

| Auction | Five opponents | Enhanced wins | Mean enhanced score | Mean starter score |
| --- | --- | ---: | ---: | ---: |
| Vickrey | official-starter-style | 100% | 249.5 | 30.2 |
| Vickrey | mixed built-in-style | 100% | 201.4 | 18.6 |
| First-price | official-starter-style | 98% | 135.6 | 30.2 |
| First-price | mixed built-in-style | 74% | 99.6 | 24.2 |

All 26 tests and the TypeScript check pass. Warm decision latency p99 was
2.53 ms for bids and 0.55 ms for words in this environment. Dictionary indexing
is done once before connecting (about 300 ms here).

These are simulator results, not live results or a promise against strong
competitors. The simulator does not model network lag, callback races, server
scheduling, adaptive opponents, or the exact server RNG. First-price opponents
are the main observed weakness. Full data and assumptions are in `reports/`.

## Before live play: steps you must complete

1. Confirm with the organizers the current tournament deadline, ID, host,
   database name, and any bot/rules constraints. Tournament details have not
   been independently verified. Defaults below come from the official starter.
2. Go to https://scrabblebot.spacetimedb.com/account and link your identity.
   Then create or join a team at https://scrabblebot.spacetimedb.com/team/new.
3. On your team page, generate the bot token. Treat it like a password.
   Do not paste it into a chat, commit it, put it in a screenshot, or share it.
4. Put the token in a private local text file, and keep that file out of your
   project/repository. On macOS/Linux set its permissions to `600`.
5. Run the bot yourself using the confirmed settings. This performs live bids,
   word submissions, and (when supplied) tournament registration as your bot.

Example macOS/Linux command, after replacing the placeholders:

```bash
BOT_NAME=hackutd-bot \
BOT_TOKEN_FILE=/absolute/path/to/private-token.txt \
STDB_HOST=https://maincloud.spacetimedb.com \
STDB_DB=scrabblebot \
TOURNAMENT_ID=CONFIRMED_NUMERIC_ID \
npm start
```

On Windows PowerShell, set each variable with `$env:NAME='value'`, then run
`npm start`. The token file path may use a Windows absolute path.

For ordinary practice matches omit `TOURNAMENT_ID`. The bot automatically joins
lobbies and rejoins after games. With `TOURNAMENT_ID`, it registers itself and
stays out of ordinary lobbies so it is free when the organizer starts the event.
Keep the terminal running, maintain a reliable internet connection, and prevent
your computer from sleeping. Ctrl+C stops the bot process.

A successful connection is not the same as successful tournament registration:
look for `registered for tournament <id>` and confirm your entry on the site.
If registration fails or the organizer changes the ID, correct it and restart.
Bindings are bundled, so `npm run generate` and the SpacetimeDB CLI are not needed.

## Credential behavior

No token means an immediate exit without connecting. Tokens can come from
`BOT_TOKEN_FILE`, `BOT_TOKEN`, or an existing `.token-<BOT_NAME>` file. This bot
never saves a token by default. Only setting `SAVE_BOT_TOKEN=1` explicitly opts
into writing one. No account or credential was created while developing this.

## Files to customize

- `src/strategy.ts`: bid and word policy.
- `src/index.ts`: live connection and match lifecycle.
- `src/demo.ts`: offline demonstration.
- `src/simulator.ts`, `src/simulate.ts`: offline evaluation.
- `src/*.test.ts`: legality, rules, boundary cases and timing tests.
- `src/module_bindings/`: generated official protocol bindings; do not edit.
- `../spacetimedb/wordlist.txt`: official dictionary.

## Current-code rules, not stale README assumptions

Based on official commit `b5ccb36aa238ad16692f8d6af54da15ef9f11324`:

- Defaults are 100 currency, five hidden starting tiles each, six players,
  one-second auctions, and a 90-second rolling lobby. Admins can change some
  defaults; the live bot reads per-match auction type and remaining bag size.
- The standard 98 tiles include the initial deal. With six five-tile racks,
  there are 68 auctioned tiles. An unbid tile is discarded in current code.
- Opponents' initial racks are hidden. We do not reconstruct or access them.
- Live winning top bids are hidden from bots. This strategy does not use them.
- Points and cash are distinct: bids reduce cash, not accumulated points.
- Reward = floor(sum of tile values x length multiplier): 1x for 2–3 letters,
  1.5x for four, 2x for five, 2.5x for six, 3x for seven or more.
- The last auction ends the match immediately. There is no external-bot final
  submission grace period in this version.

Source: https://github.com/clockworklabs/scrabblebot/tree/b5ccb36aa238ad16692f8d6af54da15ef9f11324
Official guide: https://github.com/clockworklabs/scrabblebot/blob/main/docs/bot-guide.md

The live adapter compiles and its no-token guard was exercised, but a live
credential/handshake, live end-to-end game, reconnect behavior, and tournament
registration have not been tested. A practice match is the next real validation.
