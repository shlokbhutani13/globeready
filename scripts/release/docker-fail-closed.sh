#!/usr/bin/env bash
# Runs the production image with deliberately unsafe or incomplete configuration and expects every run to refuse
# to start. Containers run with no network, so a configuration that could start would fail for lack of network
# and still be reported; each case therefore also checks the refusal reason, not only the exit code.
set -uo pipefail

IMAGE="${1:-globeready-api:ci}"
failures=0

expect_refusal() {
  local name="$1" pattern="$2"
  shift 2
  local output status
  output="$(docker run --rm --network none "$@" "$IMAGE" 2>&1)"
  status=$?
  if [ "$status" -ne 0 ] && printf '%s' "$output" | grep -Eq "$pattern"; then
    echo "PASS  $name (exit $status)"
  else
    echo "FAIL  $name (exit $status)"
    printf '%s\n' "$output" | sed -n '1,6p' | sed 's/^/      /'
    failures=$((failures + 1))
  fi
}

# No configuration at all: production mode, which must require Firebase, a bucket, an origin, and a scope.
expect_refusal "no configuration refuses (production by default)" "refused to start: FIREBASE_PROJECT_ID is required"

# Demo and local-user modes are development-only and must not start under NODE_ENV=production.
expect_refusal "demo mode refused under production" "DEMO_MODE=true is not allowed when NODE_ENV=production" \
  -e DEMO_MODE=true
expect_refusal "local-user mode refused under production" "LOCAL_USER_MODE=true is not allowed when NODE_ENV=production" \
  -e LOCAL_USER_MODE=true -e FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 -e FIRESTORE_EMULATOR_HOST=127.0.0.1:8089 \
  -e FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 -e STORAGE_EMULATOR_HOST=http://127.0.0.1:9199

# Emulator variables without the explicit local-user flag must never configure real Firebase.
expect_refusal "emulator host without local-user flag refused" "Emulator host variables .* without LOCAL_USER_MODE=true" \
  -e FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099

# Complete-looking configuration with placeholders and an unusable service account must not start.
expect_refusal "placeholder values refused" "placeholder value" \
  -e FIREBASE_PROJECT_ID=your-project-id \
  -e FIREBASE_STORAGE_BUCKET=your-bucket.firebasestorage.app \
  -e CLIENT_URL=https://app.globeready-prod.test \
  -e RATE_LIMIT_SCOPE=single-instance

expect_refusal "http origin refused in production" "must use https" \
  -e FIREBASE_PROJECT_ID=globeready-prod-7 \
  -e FIREBASE_STORAGE_BUCKET=globeready-prod-7.firebasestorage.app \
  -e CLIENT_URL=http://app.globeready-prod.test \
  -e RATE_LIMIT_SCOPE=single-instance

# A complete configuration with a malformed key fails inside Firebase Admin, before any traffic is accepted.
expect_refusal "malformed service-account key refused without echoing it" "malformed" \
  -e FIREBASE_PROJECT_ID=globeready-prod-7 \
  -e FIREBASE_STORAGE_BUCKET=globeready-prod-7.firebasestorage.app \
  -e CLIENT_URL=https://app.globeready-prod.test \
  -e RATE_LIMIT_SCOPE=single-instance \
  -e FIREBASE_CLIENT_EMAIL=deploy@globeready-prod-7.iam.gserviceaccount.com \
  -e FIREBASE_PRIVATE_KEY=not-a-real-key

# With no network, a plausible configuration cannot reach Firebase Auth and must refuse rather than serve.
expect_refusal "unreachable Firebase Auth refuses to start" "could not reach Firebase Auth|did not respond in time" \
  -e FIREBASE_PROJECT_ID=globeready-prod-7 \
  -e FIREBASE_STORAGE_BUCKET=globeready-prod-7.firebasestorage.app \
  -e CLIENT_URL=https://app.globeready-prod.test \
  -e RATE_LIMIT_SCOPE=single-instance \
  -e GOOGLE_APPLICATION_CREDENTIALS=/nonexistent/key.json

echo
if [ "$failures" -eq 0 ]; then
  echo "All production fail-closed checks passed."
else
  echo "$failures production fail-closed check(s) failed."
  exit 1
fi
