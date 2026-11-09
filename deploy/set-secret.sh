#!/usr/bin/env bash
# =============================================================================
# Somba&Teka — set a payment key on the server without it ever touching history,
# argv (`ps`), logs or screen output.
#
# Run ON the droplet, as root:
#
#   bash /opt/somba/deploy/set-secret.sh STRIPE_SECRET_KEY          # hidden prompt
#   age -d -i somba-payments.key keys.age \
#     | ssh root@<droplet> 'bash /opt/somba/deploy/set-secret.sh --stdin'   # KEY=VALUE lines
#
# What it does: checks each name against a whitelist and each value against its
# format (prefix, mode, charset), then writes the result atomically (temp file in
# the same directory, mode and owner kept, `mv`) into BOTH
#     /etc/somba/api.extra.env   (root, 600)  the copy that survives deploys
#     /opt/somba/api/.env        (somba, 600) the copy the API reads
# and reloads the API as user `somba`. It prints only `NAME set (…last4)`.
# All values are checked before anything is written: one bad line writes nothing.
#
# Test hooks (not for production use): SOMBA_EXTRA_ENV, SOMBA_API_ENV, SOMBA_NO_RELOAD=1,
# SOMBA_TEST_MODE=1 (allows a non-root user, for trying the script on a laptop).
# =============================================================================
set -euo pipefail
set +x
umask 077

EXTRA="${SOMBA_EXTRA_ENV:-/etc/somba/api.extra.env}"
API_ENV="${SOMBA_API_ENV:-/opt/somba/api/.env}"
APP_USER=somba
PM2_APP=somba-api

ALLOWED="STRIPE_SECRET_KEY STRIPE_PUBLISHABLE_KEY STRIPE_WEBHOOK_SECRET STRIPE_PENDING_TTL_MIN MM_PROVIDER PAWAPAY_API_TOKEN PAWAPAY_BASE_URL PAWAPAY_CURRENCY PAWAPAY_FX_RATE PAWAPAY_VERIFY_SIGNATURES TRANSLATE_PROVIDER GOOGLE_TRANSLATE_API_KEY TRANSLATE_DAILY_CHAR_LIMIT FIREBASE_SERVICE_ACCOUNT_JSON TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_FROM SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS MAIL_FROM"
# Names whose value is a credential: the confirmation shows its last 4 characters.
SECRET_NAMES=" STRIPE_SECRET_KEY STRIPE_PUBLISHABLE_KEY STRIPE_WEBHOOK_SECRET PAWAPAY_API_TOKEN GOOGLE_TRANSLATE_API_KEY FIREBASE_SERVICE_ACCOUNT_JSON TWILIO_AUTH_TOKEN SMTP_PASS "

die() { printf 'set-secret: %s\n' "$*" >&2; exit 1; }

usage() {
  cat >&2 <<EOF
Usage:  set-secret.sh NAME          ask for the value (hidden input)
        set-secret.sh --stdin       read NAME=VALUE lines from standard input
Names:  ${ALLOWED}
EOF
  exit 2
}

NAMES=()
VALUES=()
tmp_files=()
cleanup() {
  local f
  for f in "${tmp_files[@]+"${tmp_files[@]}"}"; do rm -f "$f"; done
  VALUES=()
  value=""
}
trap cleanup EXIT

is_allowed() { [[ " $ALLOWED " == *" $1 "* ]]; }

# Echo nothing; return 0 when the value has the right shape for the name. Never prints the value.
# Patterns for the e-mail settings. Values are written unquoted into an env file, so a password may not contain
# spaces, quotes, backslash, $, backtick or # (a # would start a comment).
SMTP_HOST_RE='^([A-Za-z0-9-]+\.)+[A-Za-z]{2,}$'
SMTP_PASS_RE='^[^[:space:]"'"'"'\\`$#]{8,255}$'
MAIL_ADDR_RE='[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}'
MAIL_FROM_RE="^(${MAIL_ADDR_RE}|[A-Za-z0-9][A-Za-z0-9 &.'-]{0,59} <${MAIL_ADDR_RE}>)$"

valid_value() {
  local name="$1" value="$2"
  case "$name" in
    STRIPE_SECRET_KEY) [[ "$value" =~ ^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$ ]] ;;
    STRIPE_PUBLISHABLE_KEY) [[ "$value" =~ ^pk_(test|live)_[A-Za-z0-9]{10,}$ ]] ;;
    STRIPE_WEBHOOK_SECRET) [[ "$value" =~ ^whsec_[A-Za-z0-9+/=_-]{16,}$ ]] ;;
    STRIPE_PENDING_TTL_MIN) [[ "$value" =~ ^[1-9][0-9]{0,3}$ ]] ;;
    MM_PROVIDER) [[ "$value" =~ ^(none|sandbox|manual|pawapay)$ ]] ;;
    PAWAPAY_API_TOKEN) [[ "$value" =~ ^[A-Za-z0-9._~+/=-]{16,}$ ]] ;;
    PAWAPAY_BASE_URL) [[ "$value" =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$ ]] ;;
    PAWAPAY_CURRENCY) [[ "$value" =~ ^(USD|CDF)$ ]] ;;
    PAWAPAY_FX_RATE) [[ "$value" =~ ^[0-9]+(\.[0-9]+)?$ ]] ;;
    PAWAPAY_VERIFY_SIGNATURES) [[ "$value" =~ ^(true|false)$ ]] ;;
    TRANSLATE_PROVIDER) [[ "$value" =~ ^(google|fake|off)$ ]] ;;
    GOOGLE_TRANSLATE_API_KEY) [[ "$value" =~ ^AIza[0-9A-Za-z_-]{30,}$ ]] ;;
    TRANSLATE_DAILY_CHAR_LIMIT) [[ "$value" =~ ^[1-9][0-9]{0,8}$ ]] ;;
    FIREBASE_SERVICE_ACCOUNT_JSON) [[ "$value" =~ ^(\{.+\}|[A-Za-z0-9+/=]{100,})$ ]] ;;
    TWILIO_ACCOUNT_SID) [[ "$value" =~ ^AC[0-9a-fA-F]{32}$ ]] ;;
    TWILIO_AUTH_TOKEN) [[ "$value" =~ ^[0-9a-fA-F]{32}$ ]] ;;
    # A Twilio number (+ and digits), a Messaging Service SID (MG…), or an alphanumeric sender name (3 to 11 letters/digits, at least one letter).
    TWILIO_FROM) [[ "$value" =~ ^\+[1-9][0-9]{6,14}$ || "$value" =~ ^MG[0-9a-fA-F]{32}$ || ( "$value" =~ ^[A-Za-z0-9]{3,11}$ && "$value" =~ [A-Za-z] ) ]] ;;
    SMTP_HOST) [[ "$value" =~ $SMTP_HOST_RE ]] ;;
    SMTP_PORT) [[ "$value" =~ ^(25|465|587|2525)$ ]] ;;
    SMTP_USER) [[ "$value" =~ ^[A-Za-z0-9._@+-]{1,254}$ ]] ;;
    SMTP_PASS) [[ "$value" =~ $SMTP_PASS_RE ]] ;;
    MAIL_FROM) [[ "$value" =~ $MAIL_FROM_RE ]] ;;
    *) return 1 ;;
  esac
}

why_invalid() {
  case "$1" in
    STRIPE_SECRET_KEY) echo "must look like sk_test_… / sk_live_… / rk_test_… / rk_live_… (letters and digits only)" ;;
    STRIPE_PUBLISHABLE_KEY) echo "must look like pk_test_… or pk_live_…" ;;
    STRIPE_WEBHOOK_SECRET) echo "must look like whsec_…" ;;
    STRIPE_PENDING_TTL_MIN) echo "must be a whole number of minutes, 1 to 9999" ;;
    MM_PROVIDER) echo "must be one of: none, sandbox, manual, pawapay" ;;
    PAWAPAY_API_TOKEN) echo "must be the pawaPay API token (16+ characters, no spaces or quotes)" ;;
    PAWAPAY_BASE_URL) echo "must be an https:// origin such as https://api.pawapay.io" ;;
    PAWAPAY_CURRENCY) echo "must be USD or CDF" ;;
    PAWAPAY_FX_RATE) echo "must be a number (CDF per USD)" ;;
    PAWAPAY_VERIFY_SIGNATURES) echo "must be true or false" ;;
    TRANSLATE_PROVIDER) echo "must be one of: google, fake, off" ;;
    GOOGLE_TRANSLATE_API_KEY) echo "must look like AIza… (a Google API key, restricted to Cloud Translation)" ;;
    TRANSLATE_DAILY_CHAR_LIMIT) echo "must be a whole number of characters, 1 to 999999999" ;;
    FIREBASE_SERVICE_ACCOUNT_JSON) echo "must be the service-account JSON, or its base64 on one line" ;;
    TWILIO_ACCOUNT_SID) echo "must be the Twilio Account SID: AC followed by 32 letters/digits (Twilio console, Account Info; not an API key SID that starts with SK)" ;;
    TWILIO_AUTH_TOKEN) echo "must be the Twilio Auth Token: 32 letters/digits (Twilio console, Account Info)" ;;
    TWILIO_FROM) echo "must be a Twilio phone number like +15551234567, a Messaging Service SID (MG followed by 32 letters/digits), or a sender name of 3 to 11 letters/digits with at least one letter" ;;
    SMTP_HOST) echo "must be a host name such as smtp.sendgrid.net (no http://, no spaces)" ;;
    SMTP_PORT) echo "must be 587 (recommended), 465, 2525 or 25" ;;
    SMTP_USER) echo "must be the SMTP user name (for SendGrid: the word apikey), letters, digits and . _ @ + - only" ;;
    SMTP_PASS) echo "must be 8 to 255 characters with no spaces, quotes, backslash, \$, backtick or # (for SendGrid: the API key that starts with SG.)" ;;
    MAIL_FROM) echo "must be an address like no-reply@yourdomain.com, or a name and address like Somba&Teka <no-reply@yourdomain.com>" ;;
  esac
}

# Remember NAME=VALUE (a later line for the same name wins).
remember() {
  local name="$1" value="$2" i
  for i in "${!NAMES[@]}"; do
    if [[ "${NAMES[$i]}" == "$name" ]]; then
      VALUES[i]="$value"
      return
    fi
  done
  NAMES+=("$name")
  VALUES+=("$value")
}

value_of() {
  local i
  for i in "${!NAMES[@]}"; do
    if [[ "${NAMES[$i]}" == "$1" ]]; then
      printf '%s' "${VALUES[$i]}"
      return 0
    fi
  done
  return 1
}

file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }
file_owner() { stat -c '%u:%g' "$1" 2>/dev/null || stat -f '%u:%g' "$1"; }

# Rewrite one env file: every line that sets one of our names is dropped, then the new values are appended.
apply_to() {
  local file="$1" dir base tmp mode owner line key i
  dir="$(dirname "$file")"
  base="$(basename "$file")"
  mode="$(file_mode "$file")"
  owner="$(file_owner "$file")"
  tmp="$(mktemp "$dir/.$base.XXXXXX")"
  tmp_files+=("$tmp")
  {
    while IFS= read -r line || [[ -n "$line" ]]; do
      key="${line%%=*}"
      drop=0
      if [[ "$line" == *=* ]]; then
        for i in "${!NAMES[@]}"; do
          if [[ "${NAMES[$i]}" == "$key" ]]; then drop=1; fi
        done
      fi
      if [[ "$drop" == 0 ]]; then printf '%s\n' "$line"; fi
    done <"$file"
    for i in "${!NAMES[@]}"; do printf '%s=%s\n' "${NAMES[$i]}" "${VALUES[$i]}"; done
  } >"$tmp"
  chmod "$mode" "$tmp"
  if [[ $EUID -eq 0 ]]; then chown "$owner" "$tmp"; fi
  mv -f "$tmp" "$file"
}

mode_of_key() {
  case "$1" in
    *_test_*) echo test ;;
    *_live_*) echo live ;;
    *) echo "" ;;
  esac
}

# ── 0. Who and how ───────────────────────────────────────────────────────────
if [[ $EUID -ne 0 && "${SOMBA_TEST_MODE:-}" != "1" ]]; then die "run as root (sudo -i)."; fi
if [[ $# -lt 1 ]]; then usage; fi

value=""
case "$1" in
  --stdin)
    [[ $# -eq 1 ]] || usage
    lineno=0
    while IFS= read -r line || [[ -n "$line" ]]; do
      lineno=$((lineno + 1))
      line="${line%$'\r'}"
      line="${line#"${line%%[![:space:]]*}"}"
      if [[ -z "$line" || "$line" == \#* ]]; then continue; fi
      [[ "$line" == *=* ]] || die "line $lineno: expected NAME=VALUE."
      name="${line%%=*}"
      value="${line#*=}"
      # Tolerate one pair of quotes around the value (KEY="value").
      if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi
      is_allowed "$name" || die "line $lineno: $name is not a setting this script manages."
      valid_value "$name" "$value" || die "line $lineno: $name $(why_invalid "$name")."
      remember "$name" "$value"
    done
    ;;
  -h | --help) usage ;;
  -*) usage ;;
  *)
    [[ $# -eq 1 ]] || usage
    name="$1"
    is_allowed "$name" || die "$name is not a setting this script manages."
    [[ -t 0 ]] || die "no terminal for the hidden prompt: pipe NAME=VALUE lines with --stdin instead."
    IFS= read -rs -p "$name: " value
    printf '\n'
    valid_value "$name" "$value" || die "$name $(why_invalid "$name")."
    remember "$name" "$value"
    ;;
esac
value=""

[[ ${#NAMES[@]} -gt 0 ]] || die "nothing to set."

# ── 1. Write both env files (atomic), only after every value passed ──────────
[[ -e "$EXTRA" ]] || die "$EXTRA does not exist: run deploy/droplet-deploy.sh first."
apply_to "$EXTRA"
wrote_api=0
if [[ -e "$API_ENV" ]]; then
  apply_to "$API_ENV"
  wrote_api=1
fi

for i in "${!NAMES[@]}"; do
  v="${VALUES[$i]}"
  if [[ "$SECRET_NAMES" == *" ${NAMES[$i]} "* ]]; then
    printf '%s set (…%s)\n' "${NAMES[$i]}" "${v: -4}"
  else
    printf '%s set\n' "${NAMES[$i]}"
  fi
done
if [[ $wrote_api -eq 0 ]]; then
  printf 'note: %s does not exist yet; the next deploy copies %s into it.\n' "$API_ENV" "$EXTRA"
fi

# ── 2. Warn (without showing anything) when the Stripe keys disagree ─────────
# A value just set wins; otherwise the one already stored counts, so setting only one key is checked against the other.
current_value() {
  local name="$1" line v="" got
  if got="$(value_of "$name")"; then
    printf '%s' "$got"
    return 0
  fi
  [[ -r "$EXTRA" ]] || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "$name="* ]]; then v="${line#*=}"; fi
  done <"$EXTRA"
  [[ -n "$v" ]] || return 1
  printf '%s' "$v"
}
if value_of STRIPE_SECRET_KEY >/dev/null || value_of STRIPE_PUBLISHABLE_KEY >/dev/null; then
  sk="$(current_value STRIPE_SECRET_KEY || true)"
  pk="$(current_value STRIPE_PUBLISHABLE_KEY || true)"
  if [[ -n "$sk" && -n "$pk" && "$(mode_of_key "$sk")" != "$(mode_of_key "$pk")" ]]; then
    printf 'warning: the Stripe secret and publishable keys are in different modes (test vs live); card payments stay off until they match.\n' >&2
  fi
  sk="" pk=""
fi

# ── 2b. Hints (nothing is shown beyond the words below) when a SendGrid setup looks mixed up ──────────────────────────
if value_of SMTP_HOST >/dev/null || value_of SMTP_USER >/dev/null || value_of SMTP_PASS >/dev/null; then
  host="$(current_value SMTP_HOST || true)"
  user="$(current_value SMTP_USER || true)"
  pass="$(current_value SMTP_PASS || true)"
  if [[ "$host" == *sendgrid* && -n "$user" && "$user" != "apikey" ]]; then
    printf 'warning: SendGrid SMTP expects the user name to be exactly: apikey\n' >&2
  fi
  if [[ "$host" == *sendgrid* && -n "$pass" && "$pass" != SG.* ]]; then
    printf 'warning: a SendGrid API key starts with SG. (the password you set does not)\n' >&2
  fi
  if [[ -z "$host" ]]; then
    printf 'note: SMTP_HOST is not set yet; no e-mail is sent until it is.\n'
  fi
  host="" user="" pass=""
fi

# ── 3. Reload the API so it picks the values up ──────────────────────────────
if [[ "${SOMBA_NO_RELOAD:-}" == "1" ]]; then
  echo "reload skipped (SOMBA_NO_RELOAD=1)."
elif sudo -u "$APP_USER" -H pm2 reload "$PM2_APP" --update-env >/dev/null 2>&1; then
  echo "API reloaded."
else
  echo "warning: could not reload the API. Run: sudo -u $APP_USER -H pm2 reload $PM2_APP --update-env" >&2
fi
