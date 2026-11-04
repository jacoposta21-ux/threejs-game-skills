#!/usr/bin/env bash
# Usage: npm run build && npm run preview & ; bash tests/bot/run.sh [station mall circus museum cityhall]
set -u
cd "$(dirname "$0")/../.."
mkdir -p artifacts/bot
bots=("$@"); [ ${#bots[@]} -eq 0 ] && bots=(station mall circus museum cityhall)
fail=0
for b in "${bots[@]}"; do
  echo "=== $b"
  node "tests/bot/bot-$b.mjs" | tee "artifacts/bot/$b.log" | grep -E "FINAL|FAILED|ERRORS|^[A-Z][0-9] " | cut -c1-200
  grep -q "FAILED" "artifacts/bot/$b.log" && fail=1
done
exit $fail
