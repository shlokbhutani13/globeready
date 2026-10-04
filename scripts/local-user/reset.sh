#!/usr/bin/env bash
# Deletes all local-user data (accounts, Firestore, Storage, sample credentials). Asks first.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
read -r -p "This deletes all local GlobeReady data in .local/. Type RESET to continue: " answer
if [ "$answer" != "RESET" ]; then
  echo "Cancelled."
  exit 0
fi
"$ROOT/scripts/local-user/stop.sh" || true
rm -rf "$ROOT/.local/emulator-data" "$ROOT/.local/credentials.json" "$ROOT/.local/logs" "$ROOT/.local/pids"
echo "Local data reset. The next start creates new accounts and sample data."
