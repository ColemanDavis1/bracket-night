#!/usr/bin/env bash
# Diagnose Supabase<->Google OAuth by asking Google's token endpoint directly.
# Reads credentials from scripts/google-oauth.env (gitignored) so they never
# appear in the terminal command or chat.
#
# Usage:
#   1) Create scripts/google-oauth.env with two lines:
#        CLIENT_ID=xxxxx.apps.googleusercontent.com
#        CLIENT_SECRET=GOCSPX-xxxxxxxx
#   2) Run:  bash scripts/diag-google.sh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ENVFILE="$DIR/google-oauth.env"
REDIRECT="https://mikpqxejtljnhhiiibzf.supabase.co/auth/v1/callback"

if [ ! -f "$ENVFILE" ]; then
  echo "Missing $ENVFILE"
  echo "Create it with:"
  echo "  CLIENT_ID=...apps.googleusercontent.com"
  echo "  CLIENT_SECRET=GOCSPX-..."
  exit 1
fi

# shellcheck disable=SC1090
source "$ENVFILE"

if [ -z "${CLIENT_ID:-}" ] || [ -z "${CLIENT_SECRET:-}" ]; then
  echo "CLIENT_ID or CLIENT_SECRET not set in $ENVFILE"
  exit 1
fi

echo "Client ID ends with: ...${CLIENT_ID: -30}"
echo "Secret length: ${#CLIENT_SECRET} chars (should be ~35, starts with GOCSPX-)"
echo "Testing token exchange against Google with a dummy code..."
echo "----------------------------------------------------------"

# A deliberately-fake code. We only care about WHICH error Google returns:
#   invalid_client        -> wrong/mismatched Client ID+Secret, or wrong client TYPE
#   redirect_uri_mismatch -> the Supabase callback isn't registered on this client
#   invalid_grant         -> credentials + redirect are GOOD (fake code rejected, as expected)
curl -s -X POST https://oauth2.googleapis.com/token \
  --data-urlencode "client_id=${CLIENT_ID}" \
  --data-urlencode "client_secret=${CLIENT_SECRET}" \
  --data-urlencode "code=fake-diagnostic-code" \
  --data-urlencode "grant_type=authorization_code" \
  --data-urlencode "redirect_uri=${REDIRECT}"
echo
echo "----------------------------------------------------------"
echo 'Interpretation:'
echo '  "invalid_client"        => Secret/ID wrong, from different clients, or client is not type "Web application"'
echo '  "redirect_uri_mismatch" => add the Supabase callback to Authorized redirect URIs'
echo '  "invalid_grant"         => creds + redirect are CORRECT; re-paste exactly these into Supabase'
