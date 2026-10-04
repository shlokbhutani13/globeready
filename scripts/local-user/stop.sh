#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PIDS="$ROOT/.local/pids"; LOGS="$ROOT/.local/logs"

stop_process() {
  local name="$1" signal="$2" marker="$3" file pid command
  file="$PIDS/$name.pid"
  [ -f "$file" ] || return 0
  pid="$(cat "$file" 2>/dev/null || true)"
  if ! [[ "$pid" =~ ^[0-9]+$ ]]; then rm -f "$file"; return 0; fi
  command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  if kill -0 "$pid" 2>/dev/null && [[ "$command" == *"$marker"* ]]; then
    kill "-$signal" "$pid"
    for _ in $(seq 1 180); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
    if kill -0 "$pid" 2>/dev/null; then
      echo "Could not stop $name PID $pid; retained $file for diagnosis." >&2
      return 1
    fi
  elif kill -0 "$pid" 2>/dev/null; then
    echo "Ignored stale $name PID $pid because it is not a GlobeReady $marker process." >&2
  fi
  rm -f "$file"
}

stop_process client TERM "$ROOT/client/node_modules/vite/bin/vite.js"
stop_process api TERM "$ROOT/server/src/index.js"
stop_process emulators INT "$ROOT/server/node_modules/.bin/firebase"
if grep -qi "export complete" "$LOGS/emulators.log" 2>/dev/null; then
  echo "Stopped. Local data exported to .local/emulator-data."
else
  echo "Stopped. No export confirmation found in $LOGS/emulators.log; check the log before relying on this state."
fi
