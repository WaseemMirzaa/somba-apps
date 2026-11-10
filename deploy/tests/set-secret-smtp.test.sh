#!/usr/bin/env bash
# Tries the e-mail (SMTP) settings of deploy/set-secret.sh on temp files only: nothing real is touched, no reload.
#   bash deploy/tests/set-secret-smtp.test.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../set-secret.sh"
DIR="$(mktemp -d)"
trap 'rm -rf "$DIR"' EXIT
export SOMBA_TEST_MODE=1 SOMBA_NO_RELOAD=1 SOMBA_EXTRA_ENV="$DIR/extra.env" SOMBA_API_ENV="$DIR/api.env"
pass=0 fail=0
reset() { printf 'KEEP=1\n' >"$SOMBA_EXTRA_ENV"; printf 'KEEP=1\n' >"$SOMBA_API_ENV"; chmod 600 "$SOMBA_EXTRA_ENV" "$SOMBA_API_ENV"; }
run() { printf '%s\n' "$1" | bash "$SCRIPT" --stdin 2>&1; }
ok() { pass=$((pass + 1)); printf 'ok   %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL %s\n' "$1"; }
KEY='SG.abcdefghijklmnop.qrstuvwxyz0123456789ABCDEFGHIJ'

# A good set is accepted, written to both files, mode kept, and the password is never printed in full.
reset
out="$(run "SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=$KEY
MAIL_FROM=Somba&Teka <no-reply@somba.example>")"
[[ "$out" == *"SMTP_PASS set (…GHIJ)"* ]] && ok "password is masked to its last 4" || bad "password mask: $out"
[[ "$out" != *"$KEY"* ]] && ok "the password is not in the output" || bad "the password was printed"
for f in "$SOMBA_EXTRA_ENV" "$SOMBA_API_ENV"; do
  grep -q "^SMTP_HOST=smtp.sendgrid.net$" "$f" && grep -q "^SMTP_PORT=587$" "$f" && grep -q "^SMTP_USER=apikey$" "$f" \
    && grep -q "^SMTP_PASS=$KEY$" "$f" && grep -q "^MAIL_FROM=Somba&Teka <no-reply@somba.example>$" "$f" && grep -q "^KEEP=1$" "$f" \
    && ok "values written, other lines kept ($(basename "$f"))" || bad "values missing in $f"
  [[ "$(stat -f '%Lp' "$f" 2>/dev/null || stat -c '%a' "$f")" == "600" ]] && ok "mode 600 kept ($(basename "$f"))" || bad "mode changed on $f"
done
[[ "$out" != *warning* ]] && ok "a correct SendGrid set gives no warning" || bad "unexpected warning: $out"

# Refused values: the script fails and writes nothing at all.
refuse() { # label line
  reset
  local before; before="$(cat "$SOMBA_EXTRA_ENV")"
  if run "$2" >/dev/null; then bad "accepted: $1"; else
    [[ "$(cat "$SOMBA_EXTRA_ENV")" == "$before" ]] && ok "refused, nothing written: $1" || bad "wrote something for: $1"
  fi
}
refuse "host with http://" "SMTP_HOST=http://smtp.sendgrid.net"
refuse "host without a dot" "SMTP_HOST=localhost"
refuse "host with a space" "SMTP_HOST=smtp sendgrid.net"
refuse "port 80" "SMTP_PORT=80"
refuse "port with letters" "SMTP_PORT=587abc"
refuse "user with a space" "SMTP_USER=api key"
refuse "password with a space" "SMTP_PASS=SG.abc def ghijklmnop"
refuse "password with a quote" "SMTP_PASS=SG.abc\"defghijklmnop"
refuse "password with a #" "SMTP_PASS=SG.abc#defghijklmnop"
refuse "password with a \$" "SMTP_PASS=SG.abc\$defghijklmnop"
refuse "password too short" "SMTP_PASS=SG.abc"
refuse "from without an address" "MAIL_FROM=Somba"
refuse "from with a #" "MAIL_FROM=Somba#1 <no-reply@somba.example>"
refuse "from with a bad address" "MAIL_FROM=Somba <no-reply>"
refuse "one bad line among good ones" "SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=80"

# Plain address is fine for MAIL_FROM; SendGrid mix-ups warn but are still saved.
reset
run "MAIL_FROM=no-reply@somba.example" >/dev/null && grep -q "^MAIL_FROM=no-reply@somba.example$" "$SOMBA_EXTRA_ENV" && ok "a plain from address is accepted" || bad "plain from address"
reset
out="$(run "SMTP_HOST=smtp.sendgrid.net
SMTP_USER=someone
SMTP_PASS=notasendgridkey123")"
[[ "$out" == *"user name to be exactly: apikey"* ]] && ok "warns when the SendGrid user is not apikey" || bad "no user warning: $out"
[[ "$out" == *"starts with SG."* ]] && ok "warns when the SendGrid key does not start with SG." || bad "no key warning: $out"

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
