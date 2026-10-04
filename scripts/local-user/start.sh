#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL="$ROOT/.local"; DATA="$LOCAL/emulator-data"; LOGS="$LOCAL/logs"; PIDS="$LOCAL/pids"
FIREBASE="$ROOT/server/node_modules/.bin/firebase"
VITE="$ROOT/client/node_modules/vite/bin/vite.js"
STARTED=()

find_node22() {
  local candidate version
  for candidate in "${GLOBEREADY_NODE_BINARY:-}" "$HOME/.nvm/versions/node/v22.23.1/bin/node" "$(command -v node 2>/dev/null || true)"; do
    [ -n "$candidate" ] && [ -x "$candidate" ] || continue
    version="$($candidate --version 2>/dev/null || true)"
    if [[ "$version" == v22.* ]]; then printf '%s\n' "$candidate"; return 0; fi
  done
  echo "GlobeReady local-user mode requires Node 22 (see .nvmrc). Install/select Node 22 and retry." >&2
  return 1
}

NODE_BIN="$(find_node22)"
export PATH="$(dirname "$NODE_BIN"):$PATH"

process_matches() {
  local pid="$1" marker="$2" command
  kill -0 "$pid" 2>/dev/null || return 1
  command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  [[ "$command" == *"$marker"* ]]
}

pid_for() {
  local name="$1" marker="$2" file pid
  file="$PIDS/$name.pid"
  [ -f "$file" ] || return 1
  pid="$(cat "$file" 2>/dev/null || true)"
  if [[ "$pid" =~ ^[0-9]+$ ]] && process_matches "$pid" "$marker"; then printf '%s\n' "$pid"; return 0; fi
  rm -f "$file"
  return 1
}

cleanup_started() {
  local entry name pid signal
  trap - ERR INT TERM
  for entry in "${STARTED[@]}"; do
    IFS=: read -r name pid signal <<< "$entry"
    kill "-$signal" "$pid" 2>/dev/null || true
    rm -f "$PIDS/$name.pid"
  done
}
trap cleanup_started ERR INT TERM

[ -x "$FIREBASE" ] || { echo "Install server dependencies first: cd server && npm ci" >&2; exit 1; }
[ -f "$VITE" ] || { echo "Install client dependencies first: cd client && npm ci" >&2; exit 1; }
mkdir -p "$DATA" "$LOGS" "$PIDS"
if pid_for emulators "$FIREBASE" >/dev/null || pid_for api "$ROOT/server/src/index.js" >/dev/null || pid_for client "$VITE" >/dev/null; then
  echo "GlobeReady local-user mode is already running. Stop it first: scripts/local-user/stop.sh" >&2
  exit 1
fi
for port in 9099 8089 9199 4000 5051 5173; do
  if lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
    echo "Port $port is already in use. Free it before starting local-user mode." >&2; exit 1
  fi
done

cd "$ROOT"
if [ -n "$(ls -A "$DATA" 2>/dev/null)" ]; then
  nohup "$FIREBASE" emulators:start --only auth,firestore,storage --project globeready-local \
    --import "$DATA" --export-on-exit "$DATA" > "$LOGS/emulators.log" 2>&1 &
else
  nohup "$FIREBASE" emulators:start --only auth,firestore,storage --project globeready-local \
    --export-on-exit "$DATA" > "$LOGS/emulators.log" 2>&1 &
fi
EMULATOR_PID=$!; echo "$EMULATOR_PID" > "$PIDS/emulators.pid"; STARTED+=("emulators:$EMULATOR_PID:INT")

wait_for_port() {
  local port="$1" pid="$2" name="$3" log="$4"
  for _ in $(seq 1 120); do
    if lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1; then return 0; fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "$name exited before port $port became ready. Last log lines:" >&2; tail -80 "$log" >&2 || true; return 1
    fi
    sleep 1
  done
  echo "Timed out waiting for $name on port $port. Last log lines:" >&2; tail -80 "$log" >&2 || true; return 1
}
wait_for_port 9099 "$EMULATOR_PID" "Firebase emulators" "$LOGS/emulators.log"
wait_for_port 8089 "$EMULATOR_PID" "Firebase emulators" "$LOGS/emulators.log"
wait_for_port 9199 "$EMULATOR_PID" "Firebase emulators" "$LOGS/emulators.log"
wait_for_port 4000 "$EMULATOR_PID" "Firebase Emulator UI" "$LOGS/emulators.log"

LOCAL_ENV=(env -u NODE_ENV -u GEMINI_API_KEY -u GEMINI_MODEL -u GEMINI_EMBEDDINGS_ENABLED
  -u NEWS_SYNC_ENABLED -u NEWS_SYNC_SECRET -u GOOGLE_APPLICATION_CREDENTIALS
  -u FIREBASE_CLIENT_EMAIL -u FIREBASE_PRIVATE_KEY LOCAL_USER_MODE=true FIREBASE_PROJECT_ID=globeready-local
  FIREBASE_STORAGE_BUCKET=globeready-local.appspot.com FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8089 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
  STORAGE_EMULATOR_HOST=http://127.0.0.1:9199 ADMIN_UIDS=local-admin CLIENT_URL=http://127.0.0.1:5173
  PORT=5051 DOCUMENT_OCR_ENABLED=true)

(cd "$ROOT/server" && "${LOCAL_ENV[@]}" "$NODE_BIN" scripts/seed-local-user.mjs) | tee "$LOGS/seed.log"
(cd "$ROOT/server" && exec nohup "${LOCAL_ENV[@]}" "$NODE_BIN" "$ROOT/server/src/index.js") > "$LOGS/api.log" 2>&1 &
API_PID=$!; echo "$API_PID" > "$PIDS/api.pid"; STARTED+=("api:$API_PID:TERM")
(cd "$ROOT/client" && exec nohup "$NODE_BIN" "$VITE" --mode local-user --host 127.0.0.1 --port 5173 --strictPort) > "$LOGS/client.log" 2>&1 &
CLIENT_PID=$!; echo "$CLIENT_PID" > "$PIDS/client.pid"; STARTED+=("client:$CLIENT_PID:TERM")
wait_for_port 5051 "$API_PID" "GlobeReady API" "$LOGS/api.log"
wait_for_port 5173 "$CLIENT_PID" "Vite client" "$LOGS/client.log"
trap - ERR INT TERM

cat <<INFO

GlobeReady local-user mode is running with $($NODE_BIN --version).
  App:             http://127.0.0.1:5173/
  Emulator UI:     http://127.0.0.1:4000/
  API health:      http://127.0.0.1:5051/api/health
Sign in using .local/credentials.json (student@local.example or admin@local.example).
The Google button uses a mock emulator identity, not your Google account.
Stop/save: scripts/local-user/stop.sh
Reset:     scripts/local-user/reset.sh
INFO
