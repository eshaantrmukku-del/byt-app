#!/usr/bin/env bash
# Puts the coach live on ascend-9d17e once billing is on. Run it yourself, in a terminal:
#   npm run go-live
# 1. stores the Gemini key from the local backup as a Functions secret (never printed)
# 2. deploys the functions (coachTurn, voiceTurn, voiceAudio, voicePreview, getAccount, deleteAccount)
# 3. waits while you open the app once, so your old account is copied to the new collections
# 4. deploys the Firestore rules and indexes
# 5. runs the coaching eval against the live model
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT=ascend-9d17e
SECRETS="${BYT_SECRETS_FILE:-$HOME/byt-secrets-backup/env-before-provider-key-removal.env}"
FIREBASE="npx --no-install firebase"

gemini_key() {
  # Prefer the server-side name; fall back to the prototype's old client name.
  grep -E '^(GEMINI_API_KEY|EXPO_PUBLIC_GEMINI_API_KEY)=' "$SECRETS" | head -1 | cut -d= -f2- | tr -d '\r"'"'"
}

[ -r "$SECRETS" ] || { echo "Can't read $SECRETS." >&2; exit 1; }
[ -n "$(gemini_key)" ] || { echo "No Gemini key in $SECRETS." >&2; exit 1; }
if $FIREBASE login:list 2>&1 | grep -q 'No authorized accounts'; then
  echo "Sign in first: npx firebase login (as an owner of $PROJECT)." >&2
  exit 1
fi

echo "== Checks"
npm run verify

echo "== Storing GEMINI_API_KEY as a Functions secret"
gemini_key | $FIREBASE functions:secrets:set GEMINI_API_KEY --data-file=- --project "$PROJECT"

echo "== Deploying functions (europe-west2)"
$FIREBASE deploy --only functions --project "$PROJECT"

echo
echo "Now open BYT on your phone (npm run start:lan, signed in as you) and wait for Home."
echo "That copies your old account into the new collections before the new rules go live."
read -r -p "Press Enter once Home has loaded… "

echo "== Deploying Firestore rules and indexes"
npm run deploy:rules

echo "== Live coaching eval (takes a few minutes)"
GEMINI_API_KEY="$(gemini_key)" npm --prefix functions run eval
echo "Report: eval/out/latest.md"
