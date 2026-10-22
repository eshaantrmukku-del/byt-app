#!/usr/bin/env bash
# Expo Go from any network: a Cloudflare quick tunnel in front of Metro.
# Works when the phone isn't on the Mac's Wi-Fi, or the router isolates devices.
# The URL changes every time this starts; the QR is rewritten to match.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v cloudflared >/dev/null || { echo "cloudflared is not installed: brew install cloudflared" >&2; exit 1; }

PORT="${METRO_PORT:-8081}"
LOG="$(mktemp -t byt-tunnel)"
# 127.0.0.1, not localhost: cloudflared tries IPv6 first and Metro listens on IPv4.
cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" >"$LOG" 2>&1 &
TUNNEL_PID=$!
trap 'kill "$TUNNEL_PID" 2>/dev/null || true' EXIT

URL=""
for _ in $(seq 1 60); do
  URL="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 1
done
if [ -z "$URL" ]; then
  echo "The Cloudflare tunnel did not start:" >&2
  cat "$LOG" >&2
  exit 1
fi

EXP_URL="exp://${URL#https://}"
echo "$EXP_URL" > expo-dev-url.txt
echo "Expo Go URL: $EXP_URL"
echo "QR code: expo-dev-qr.png (written once Metro answers)"
# Write the QR once Metro is serving through the tunnel.
(
  for _ in $(seq 1 90); do
    if curl -sf -m 5 -o /dev/null -H 'Expo-Platform: android' -H 'Accept: application/expo+json' "$URL/"; then
      node scripts/expo-qr.cjs expo-dev-qr.png "$EXP_URL" >/dev/null 2>&1 && echo "QR ready: expo-dev-qr.png → $EXP_URL"
      exit 0
    fi
    sleep 2
  done
) &

# http, not https: React Native's dev connection uses plain ws:// on the proxy's port,
# which only works on 80. Cloudflare serves the tunnel on both.
EXPO_PACKAGER_PROXY_URL="http://${URL#https://}" bash scripts/start-expo.sh --go "$@"
