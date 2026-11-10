#!/usr/bin/env bash
# Tries the newer settings of deploy/set-secret.sh (mobile-money, payout, Redis, translation guard, --web) on temp files only:
# nothing real is touched, no reload.
#   bash deploy/tests/set-secret-keys.test.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../set-secret.sh"
DIR="$(mktemp -d)"
trap 'rm -rf "$DIR"' EXIT
export SOMBA_TEST_MODE=1 SOMBA_NO_RELOAD=1 SOMBA_EXTRA_ENV="$DIR/extra.env" SOMBA_API_ENV="$DIR/api.env" SOMBA_WEB_ENV="$DIR/web.env"
pass=0 fail=0
reset() { printf 'KEEP=1\n' >"$SOMBA_EXTRA_ENV"; printf 'KEEP=1\n' >"$SOMBA_API_ENV"; chmod 600 "$SOMBA_EXTRA_ENV" "$SOMBA_API_ENV"; rm -f "$SOMBA_WEB_ENV"; }
run() { printf '%s\n' "$1" | bash "$SCRIPT" --stdin 2>&1; }
runweb() { printf '%s\n' "$1" | bash "$SCRIPT" --web --stdin 2>&1; }
ok() { pass=$((pass + 1)); printf 'ok   %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL %s\n' "$1"; }
mode() { stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1"; }
SECRET='mmsecret0123456789abcdef'

# New API names are accepted, written to both files, mode kept; secrets are masked.
reset
out="$(run "MM_WEBHOOK_SECRET=$SECRET
MM_PENDING_TTL_MIN=30
PAYOUT_CLEARANCE_HOURS=0
REDIS_URL=redis://:p4ssw0rd@127.0.0.1:6379")"
[[ "$out" == *"MM_WEBHOOK_SECRET set (…cdef)"* ]] && ok "webhook secret masked to last 4" || bad "webhook mask: $out"
[[ "$out" == *"REDIS_URL set (…6379)"* ]] && ok "redis url masked to last 4" || bad "redis mask: $out"
[[ "$out" != *"$SECRET"* && "$out" != *p4ssw0rd* ]] && ok "no secret in the output" || bad "a secret was printed"
[[ "$out" == *"MM_PENDING_TTL_MIN set"* && "$out" != *"MM_PENDING_TTL_MIN set (…"* ]] && ok "ttl is not masked" || bad "ttl output: $out"
for f in "$SOMBA_EXTRA_ENV" "$SOMBA_API_ENV"; do
  grep -q "^MM_WEBHOOK_SECRET=$SECRET$" "$f" && grep -q "^MM_PENDING_TTL_MIN=30$" "$f" && grep -q "^PAYOUT_CLEARANCE_HOURS=0$" "$f" \
    && grep -q "^REDIS_URL=redis://:p4ssw0rd@127.0.0.1:6379$" "$f" && grep -q "^KEEP=1$" "$f" \
    && ok "values written, other lines kept ($(basename "$f"))" || bad "values missing in $f"
  [[ "$(mode "$f")" == 600 ]] && ok "mode 600 kept ($(basename "$f"))" || bad "mode changed on $f"
done
[[ ! -e "$SOMBA_WEB_ENV" ]] && ok "API keys do not create the web file" || bad "web file created by an API key"

refuse() { # label line [expected text in message]
  reset
  local before out; before="$(cat "$SOMBA_EXTRA_ENV")"
  if out="$(run "$2")"; then bad "accepted: $1"; else
    [[ "$(cat "$SOMBA_EXTRA_ENV")" == "$before" && "$(cat "$SOMBA_API_ENV")" == "$before" && ! -e "$SOMBA_WEB_ENV" ]] && ok "refused, nothing written: $1" || bad "wrote something for: $1"
    [[ -z "${3:-}" || "$out" == *"$3"* ]] || bad "message for '$1' lacks '$3': $out"
  fi
}
refuse "webhook secret too short" "MM_WEBHOOK_SECRET=short"
refuse "webhook secret with a space" "MM_WEBHOOK_SECRET=abcdefghij klmnopqrst"
refuse "ttl zero" "MM_PENDING_TTL_MIN=0"
refuse "ttl with letters" "MM_PENDING_TTL_MIN=15m"
refuse "clearance 721" "PAYOUT_CLEARANCE_HOURS=721"
refuse "clearance negative" "PAYOUT_CLEARANCE_HOURS=-1"
refuse "clearance leading zero" "PAYOUT_CLEARANCE_HOURS=048"
refuse "redis not a url" "REDIS_URL=127.0.0.1:6379"
refuse "redis http" "REDIS_URL=http://127.0.0.1:6379"
refuse "redis with a space" "REDIS_URL=redis://host :6379"
refuse "redis with a #" "REDIS_URL=redis://u:pa#ss@host:6379"

# TRANSLATE_PROVIDER=fake is refused with an explanation; google and off still work.
refuse "translate fake" "TRANSLATE_PROVIDER=fake" "must not be fake"
refuse "translate FAKE (any case)" "TRANSLATE_PROVIDER=FAKE" "must not be fake"
refuse "translate junk" "TRANSLATE_PROVIDER=deepl" "google, off"
refuse "fake among good lines writes nothing" "SMTP_PORT=587
TRANSLATE_PROVIDER=fake" "production"
for v in google off; do
  reset
  run "TRANSLATE_PROVIDER=$v" >/dev/null && grep -q "^TRANSLATE_PROVIDER=$v$" "$SOMBA_API_ENV" && ok "TRANSLATE_PROVIDER=$v accepted" || bad "TRANSLATE_PROVIDER=$v refused"
done

# A web key given without --web points to --web.
reset
out="$(run "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyA0123456789abcdefghijklmnopqrstuv")" && bad "web key accepted without --web" || { [[ "$out" == *"--web"* ]] && ok "web key without --web points to --web" || bad "no --web hint: $out"; }

# --web: writes only web.env (created root-only), keeps other lines, masks nothing, says to rebuild.
reset
out="$(runweb "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyA0123456789abcdefghijklmnopqrstuv
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=abc123_DEF
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyB0123456789abcdefghijklmnopqrstuv
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BPabc-DEF_0123456789")"
[[ -f "$SOMBA_WEB_ENV" ]] && ok "--web created web.env" || bad "web.env missing"
[[ "$(mode "$SOMBA_WEB_ENV")" == 600 ]] && ok "web.env is mode 600" || bad "web.env mode $(mode "$SOMBA_WEB_ENV")"
grep -q "^NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=abc123_DEF$" "$SOMBA_WEB_ENV" && grep -q "^NEXT_PUBLIC_FIREBASE_VAPID_KEY=BPabc-DEF_0123456789$" "$SOMBA_WEB_ENV" && ok "--web values written" || bad "--web values missing"
[[ "$(cat "$SOMBA_EXTRA_ENV")" == "KEEP=1" && "$(cat "$SOMBA_API_ENV")" == "KEEP=1" ]] && ok "--web leaves the API files alone" || bad "--web touched an API file"
[[ "$out" == *REBUILT* && "$out" == *droplet-deploy.sh* ]] && ok "--web says the web must be rebuilt" || bad "no rebuild notice: $out"
[[ "$out" != *"API reloaded"* && "$out" != *"reload skipped"* ]] && ok "--web does not reload the API" || bad "--web reloaded the API"
# A second run replaces the value and keeps the rest.
runweb "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=zzz" >/dev/null
[[ "$(grep -c '^NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=' "$SOMBA_WEB_ENV")" == 1 ]] && grep -q "^NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=zzz$" "$SOMBA_WEB_ENV" && grep -q "^NEXT_PUBLIC_FIREBASE_API_KEY=" "$SOMBA_WEB_ENV" && ok "--web replaces a value, keeps the others" || bad "--web replace"

refuseweb() {
  reset
  if runweb "$2" >/dev/null; then bad "--web accepted: $1"; else
    [[ ! -e "$SOMBA_WEB_ENV" ]] && ok "--web refused, nothing written: $1" || bad "--web wrote for: $1"
  fi
}
refuseweb "an API secret" "STRIPE_SECRET_KEY=sk_test_abcdefghijklmnop"
refuseweb "a NEXT_PUBLIC name outside the list" "NEXT_PUBLIC_API_URL=https://evil.example"
refuseweb "maps key with the wrong shape" "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=notakey"
refuseweb "firebase value with a space" "NEXT_PUBLIC_FIREBASE_PROJECT_ID=my project"
refuseweb "firebase value with a quote" "NEXT_PUBLIC_FIREBASE_PROJECT_ID=\"my\"proj"
refuseweb "one bad line among good ones" "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=ok
NEXT_PUBLIC_API_URL=x"
reset
bash "$SCRIPT" --web >/dev/null 2>&1 && bad "--web alone accepted" || ok "--web with no name is refused"

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
