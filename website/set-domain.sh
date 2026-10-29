#!/usr/bin/env bash
# Point the website (and the app's privacy links) at a custom domain.
#   ./website/set-domain.sh buildyourtomorrow.app
# Then run ./website/deploy.sh and add the DNS records it prints.
set -euo pipefail

DOMAIN="${1:-}"
DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN%/}"
if [[ -z "$DOMAIN" || "$DOMAIN" == */* ]]; then
  echo "Usage: $0 example.com" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
OLD="$(grep -m1 '^SITE_URL=' "$SCRIPT_DIR/deploy.sh" | cut -d'"' -f2)"
NEW="https://$DOMAIN/"

FILES=(
  "$SCRIPT_DIR/index.html"
  "$SCRIPT_DIR/404.html"
  "$SCRIPT_DIR/privacy/index.html"
  "$SCRIPT_DIR/delete-account/index.html"
  "$SCRIPT_DIR/robots.txt"
  "$SCRIPT_DIR/sitemap.xml"
  "$SCRIPT_DIR/deploy.sh"
  "$SCRIPT_DIR/README.md"
  "$ROOT/src/content/privacyPolicy.ts"
)
for f in "${FILES[@]}"; do
  # Plain string replacement; the URLs contain no regex-special characters besides '.'.
  OLD="$OLD" NEW="$NEW" perl -pi -e 's/\Q$ENV{OLD}\E/$ENV{NEW}/g' "$f"
done
echo "$DOMAIN" > "$SCRIPT_DIR/CNAME"

echo "Website now uses $NEW (was $OLD)."
echo "Next: ./website/deploy.sh, then add the DNS records it prints at your domain registrar."
echo "The app's privacy links change in the next app release; the old GitHub address redirects to the new domain."
