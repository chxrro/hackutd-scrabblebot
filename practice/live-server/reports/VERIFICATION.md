# Live practice verification

Verified with the unchanged upstream module at commit `b5ccb36aa238ad16692f8d6af54da15ef9f11324` on SpacetimeDB 2.14.1, not the VM/mocked rule harness.

- Official upstream module unit tests: **178 passed**, across 12 files.
- Practice runner, copied production adapter, generated bindings and policy typecheck: **passed**.
- Six real WebSocket clients: local anonymous identity/team/credential setup, public subscriptions, caller-specific racks, accepted bids and words, one-second scheduled auctions and complete 68-auction game.
- Live negative checks: uncredentialed lobby entry, private table subscription, negative and over-budget bids, too-short and non-ASCII words, a dictionary word missing required tiles, post-end word submission and closed-auction bid are rejected.
- Disconnect/reconnect: same local identity recovered from token held only in memory; subscriptions restored and play continued.
- Preserved production adapter: byte-identical `index.ts` and `strategy.ts` connected, subscribed, bid, played words and exited on SIGINT. See `adapter-live-integration.json` and `baseline-adapter.log`.
- Client close handshakes are allowed to complete before standalone server shutdown. Final test launcher verifies exit and checks the server log for a panic.

The baseline and challenger games use different unseeded official server deals. Their game scores must **not** be compared as evidence of improvement. Use the separate paired held-out evaluation for strength estimates. Local RPC timings are diagnostics only, not a latency guarantee or tournament forecast.

The original adapter itself ends immediately on SIGINT; the parent practice runner waits briefly before shutting down the server. No baseline source change was needed. The official server's default lobby is Vickrey. These live runs do not claim first-price/tournament UI/public-hosting coverage.

All servers in the completed tests are stopped. The package can be started again with `npm start` or `npm run start:challenger`. It binds only local loopback and its database is in memory, with no persistent credentials.
