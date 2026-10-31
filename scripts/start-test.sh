#!/usr/bin/env bash
# The whole app on a phone with no billed API: local Firebase emulators with the offline
# coach and voice, seeded with owner@example.com / Test-12345 (an old-app account).
# BYT_LLM_MODE=groq npm run start:test uses Groq for the coach instead, with the key from
# ~/byt-secrets-backup/groq.env, and BYT_LLM_MODE=gemini uses the real Gemini coach and voice
# with the key from the local backup (never printed; Gemini's free tier until billing is on).
# The phone must be on the Mac's Wi-Fi; the emulators are reached on the Mac's LAN address.
set -euo pipefail
cd "$(dirname "$0")/.."

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
[ -n "$LAN_IP" ] || { echo "No Wi-Fi address found. Join a Wi-Fi network first." >&2; exit 1; }

JDK="$(ls -d "$PWD"/.tools/jdk-21* 2>/dev/null | head -1 || true)"
[ -d "$JDK/Contents/Home" ] && JDK="$JDK/Contents/Home"
[ -n "$JDK" ] && export JAVA_HOME="$JDK" PATH="$JDK/bin:$PATH"

if ! curl -s -o /dev/null "http://127.0.0.1:9099/"; then
  npm --prefix functions run build >/dev/null
  LOG="$(mktemp -t byt-emulators)"
  MODE="${BYT_LLM_MODE:-mock}"
  if [ "$MODE" = groq ]; then
    GROQ_API_KEY="$(grep '^GROQ_API_KEY=' "$HOME/byt-secrets-backup/groq.env" | cut -d= -f2-)"
    export GROQ_API_KEY
  elif [ "$MODE" = gemini ]; then
    SECRETS="${BYT_SECRETS_FILE:-$HOME/byt-secrets-backup/env-before-provider-key-removal.env}"
    BYT_GEMINI_TEST_KEY="$(grep -E '^(GEMINI_API_KEY|EXPO_PUBLIC_GEMINI_API_KEY)=' "$SECRETS" | head -1 | cut -d= -f2- | tr -d '\r"'"'")"
    [ -n "$BYT_GEMINI_TEST_KEY" ] || { echo "No Gemini key in $SECRETS." >&2; exit 1; }
    export BYT_GEMINI_TEST_KEY
    # The free tier turns gemini-3.8-flash away under load; 3.5 answers. Billing removes this.
    export BYT_REPLY_MODEL="${BYT_REPLY_MODEL:-gemini-3.5-flash}"
  fi
  BYT_LLM_MODE="$MODE" npx firebase emulators:start --only functions,firestore,auth --project demo-byt >"$LOG" 2>&1 &
  EMULATORS_PID=$!
  trap 'kill "$EMULATORS_PID" 2>/dev/null || true' EXIT
  echo "Starting the Firebase emulators (log: $LOG)…"
  for _ in $(seq 1 90); do grep -q 'All emulators ready' "$LOG" && break; sleep 2; done
  grep -q 'All emulators ready' "$LOG" || { cat "$LOG" >&2; exit 1; }
fi

FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  npx --prefix functions tsx functions/scripts/seed-emulator.ts

echo "Test login: owner@example.com / Test-12345 (or sign up with any email)."
# Write the QR once Metro answers on the LAN address.
(
  for _ in $(seq 1 60); do
    curl -sf -m 3 -o /dev/null "http://$LAN_IP:8081/status" && node scripts/expo-qr.cjs expo-dev-qr.png "exp://$LAN_IP:8081" && exit 0
    sleep 2
  done
) &

EXPO_PUBLIC_USE_FIREBASE_EMULATORS=1 EXPO_PUBLIC_FIREBASE_EMULATOR_HOST="$LAN_IP" EXPO_PUBLIC_FIREBASE_PROJECT_ID=demo-byt \
  caffeinate -dims bash scripts/start-expo.sh --go --lan "$@"
