# Repository preparation checks

Checked on 2026-11-07 in the preparation environment.

## Repeated checks

- `bot-starter`: `npm test` passed all 26 tests; `npm run build` passed strict TypeScript checking; `npm run demo` completed its offline dictionary and seeded-game demonstration.
- `experiments/learned-policy`: `npm test` passed all 7 experimental tests; `npm run build` passed strict TypeScript checking.
- The baseline source and frozen experimental source were imported from the supplied archives without algorithm changes. Experiment manifest hashes were checked.
- Dependency directories, credentials, and machine-specific configuration are excluded. Reviewed benchmark logs are retained as evidence.

These checks reused the previously installed dependencies matching the starter's lockfile. They do not establish that a fresh network install works on every supported operating system. The baseline has a lockfile; the archived experiment uses its original version ranges and `npm install`.

## Not repeated or not tested here

- Full 200-game baseline benchmark and full training/held-out evaluation were not rerun during repository creation. Their original data and logs are preserved.
- The 15-test old-behavior compatibility run is archived, not part of the experimental default test script. Its 5 policy-preference failures remain disclosed in the experimental README.
- No live service connection, credentials, tournament registration, live end-to-end game, or reconnect scenario was exercised.
- No CI service has been enabled or verified by this repository preparation step.
