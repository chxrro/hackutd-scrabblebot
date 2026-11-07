#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=2.14.1
case "$(uname -s)-$(uname -m)" in
 Linux-x86_64) TARGET=x86_64-unknown-linux-gnu; SHA=67a3c99c19abc4ba58b4ab999b309b3c5899602b3f0f7ae75e296335c174c82b;;
 Linux-aarch64|Linux-arm64) TARGET=aarch64-unknown-linux-gnu; SHA=5be10038649944d1711ee4b88888301f7b88463024d72ea68cd32e039510fae7;;
 Darwin-arm64) TARGET=aarch64-apple-darwin; SHA=3b0f7b2c96a89cbbd323a1f66f7b4bf853cb4b6bac2d471e90213f8b1beb4604;;
 Darwin-x86_64) TARGET=x86_64-apple-darwin; SHA=c52bd00eddeb817090cec1daeed60665b8906c5211eeb902531826c449e0786c;;
 *) echo 'Use WSL or install the official SpacetimeDB 2.14.1 CLI and set SPACETIME_CLI.'; exit 1;;
esac
mkdir -p tools
ARCHIVE="tools/spacetime-$VERSION-$TARGET.tar.gz"
curl -fL --retry 2 "https://github.com/clockworklabs/SpacetimeDB/releases/download/v$VERSION/spacetime-$TARGET.tar.gz" -o "$ARCHIVE"
ACTUAL=$(shasum -a 256 "$ARCHIVE" | cut -d ' ' -f 1)
[[ "$ACTUAL" = "$SHA" ]] || { echo 'Release checksum mismatch. Refusing to run.'; exit 1; }
tar -xzf "$ARCHIVE" -C tools
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix upstream/spacetimedb
npm run build
printf '\nReady: npm run test:live or npm start\n'
