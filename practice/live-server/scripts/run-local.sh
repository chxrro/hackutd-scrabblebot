#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
PORT="${PRACTICE_PORT:-3300}"
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo 'PRACTICE_PORT must be numeric'; exit 1; }
CLI="${SPACETIME_CLI:-$ROOT/tools/spacetimedb-cli}"
if [[ ! -x "$CLI" ]]; then CLI=$(command -v spacetime) || { echo 'Install the official SpacetimeDB CLI 2.14.1 first. See README.'; exit 1; }; fi
RUNTIME=$(mktemp -d "${TMPDIR:-/tmp}/scrabblebot-practice.XXXXXX")
mkdir -p reports
SERVER_PID=''; CLIENT_PID=''
cleanup(){ trap - EXIT INT TERM; if [[ -n "$CLIENT_PID" ]]; then kill -TERM "$CLIENT_PID" 2>/dev/null || true; wait "$CLIENT_PID" 2>/dev/null || true; fi; if [[ -n "$SERVER_PID" ]]; then kill -INT "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; fi; rm -rf -- "$RUNTIME"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
"$CLI" --root-dir "$RUNTIME" start --listen-addr "127.0.0.1:$PORT" --in-memory --non-interactive >reports/server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 100); do curl -fsS "http://127.0.0.1:$PORT/v1/ping" >/dev/null 2>&1 && break; kill -0 "$SERVER_PID" 2>/dev/null || { tail -20 reports/server.log; exit 1; }; sleep .1; done
curl -fsS "http://127.0.0.1:$PORT/v1/ping" >/dev/null
"$CLI" --root-dir "$RUNTIME" publish scrabblebot-practice --server "http://127.0.0.1:$PORT" --module-path "$ROOT/upstream/spacetimedb" --anonymous --no-config >reports/publish.log 2>&1
printf 'Official local practice server: http://127.0.0.1:%s\nDatabase: scrabblebot-practice\nTemporary in-memory state. Ctrl+C stops everything.\n' "$PORT"
STDB_HOST="http://127.0.0.1:$PORT" STDB_DB=scrabblebot-practice node --import tsx client/practice.ts "$@" &
CLIENT_PID=$!
wait "$CLIENT_PID"
CLIENT_PID=''

# For one-shot tests, verify the server also shuts down cleanly before success.
if [[ " ${*} " == *" --test "* ]]; then
  kill -INT "$SERVER_PID" 2>/dev/null || true
  set +e
  wait "$SERVER_PID"
  SERVER_STATUS=$?
  set -e
  SERVER_PID=''
  if [[ "$SERVER_STATUS" != 0 && "$SERVER_STATUS" != 130 ]]; then echo "Server exited with status $SERVER_STATUS"; exit 1; fi
  if grep -q 'panicked at' reports/server.log; then echo 'Server panic detected during shutdown'; exit 1; fi
  node --input-type=module -e 'import fs from "node:fs";const p="reports/live-integration.json";const r=JSON.parse(fs.readFileSync(p));r.checks.push("Standalone server stopped cleanly after client close handshakes");fs.writeFileSync(p,JSON.stringify(r,null,2)+"\n");'
fi
