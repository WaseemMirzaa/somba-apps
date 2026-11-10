#!/usr/bin/env bash
# =============================================================================
# Somba&Teka — set a payment key on the server without it ever touching history,
# argv (`ps`), logs or screen output.
#
# Run ON the droplet, as root:
#
#   bash /opt/somba/deploy/set-secret.sh STRIPE_SECRET_KEY          # hidden prompt
#   bash /opt/somba/deploy/set-secret.sh --web NEXT_PUBLIC_GOOGLE_MAPS_API_KEY   # a web (browser) key, see below
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
# --web NAME (or --web --stdin): for the NEXT_PUBLIC_* keys the web portal needs in the browser
# (NEXT_PUBLIC_FIREBASE_*, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID). They go ONLY into
#     /etc/somba/web.env         (root, 600)  which droplet-deploy.sh copies into web/.env.local at build time
# The API is not touched or reloaded. NEXT_PUBLIC_* values are baked into the web bundle, so a web REBUILD is
# needed afterwards: re-run deploy/droplet-deploy.sh with the same DOMAIN / ADMIN_EMAIL / SSL as before.
#
# Test hooks (not for production use): SOMBA_EXTRA_ENV, SOMBA_API_ENV, SOMBA_WEB_ENV, SOMBA_NO_RELOAD=1,
# SOMBA_TEST_MODE=1 (allows a non-root user, for trying the script on a laptop).
# =============================================================================
set -euo pipefail
set +x
umask 077

EXTRA="${SOMBA_EXTRA_ENV:-/etc/somba/api.extra.env}"
API_ENV="${SOMBA_API_ENV:-/opt/somba/api/.env}"
WEB_ENV="${SOMBA_WEB_ENV:-/etc/somba/web.env}"
APP_USER=somba
PM2_APP=somba-api

ALLOWED="STRIPE_SECRET_KEY STRIPE_PUBLISHABLE_KEY STRIPE_WEBHOOK_SECRET STRIPE_PENDING_TTL_MIN MM_PROVIDER PAWAPAY_API_TOKEN PAWAPAY_BASE_URL PAWAPAY_CURRENCY PAWAPAY_FX_RATE PAWAPAY_VERIFY_SIGNATURES TRANSLATE_PROVIDER GOOGLE_TRANSLATE_API_KEY TRANSLATE_DAILY_CHAR_LIMIT FIREBASE_SERVICE_ACCOUNT_JSON TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_FROM SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS MAIL_FROM MM_WEBHOOK_SECRET MM_PENDING_TTL_MIN PAYOUT_CLEARANCE_HOURS REDIS_URL"
# Browser keys for --web (same names droplet-deploy.sh copies from /etc/somba/web.env into the web build).
WEB_ALLOWED_RE='^NEXT_PUBLIC_(FIREBASE_[A-Z0-9_]+|GOOGLE_MAPS_API_KEY|GOOGLE_MAPS_MAP_ID)$'
# Names whose value is a credential: the confirmation shows its last 4 characters.
SECRET_NAMES=" STRIPE_SECRET_KEY STRIPE_PUBLISHABLE_KEY STRIPE_WEBHOOK_SECRET PAWAPAY_API_TOKEN GOOGLE_TRANSLATE_API_KEY FIREBASE_SERVICE_ACCOUNT_JSON TWILIO_AUTH_TOKEN SMTP_PASS MM_WEBHOOK_SECRET REDIS_URL "

die() { printf 'set-secret: %s\n' "$*" >&2; exit 1; }

usage() {
  cat >&2 <<EOF
Usage:  set-secret.sh NAME              ask for the value (hidden input)
        set-secret.sh --stdin           read NAME=VALUE lines from standard input
        set-secret.sh --web NAME        a NEXT_PUBLIC_* browser key -> /etc/somba/web.env (then rebuild the web)
        set-secret.sh --web --stdin     the same, NAME=VALUE lines from standard input
Names:  ${ALLOWED}
Web names: NEXT_PUBLIC_FIREBASE_* (API_KEY, AUTH_DOMAIN, PROJECT_ID, SENDER_ID, APP_ID, VAPID_KEY),
        NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID
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

WEB=0
is_allowed() {
  if [[ "$WEB" == 1 ]]; then [[ "$1" =~ $WEB_ALLOWED_RE ]]; else [[ " $ALLOWED " == *" $1 "* ]]; fi
}
not_allowed_msg() {
  if [[ "$WEB" == 1 ]]; then echo "$1 is not a web key this script manages (allowed: NEXT_PUBLIC_FIREBASE_*, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID)."
  elif [[ "$1" == NEXT_PUBLIC_* ]]; then echo "$1 is a web key: use  set-secret.sh --web $1"
  else echo "$1 is not a setting this script manages."; fi
}

# Echo nothing; return 0 when the value has the right shape for the name. Never prints the value.
# Patterns for the e-mail settings. Values are written unquoted into an env file, so a password may not contain
# spaces, quotes, backslash, $, backtick or # (a # would start a comment).
SMTP_HOST_RE='^([A-Za-z0-9-]+\.)+[A-Za-z]{2,}$'
SMTP_PASS_RE='^[^[:space:]"'"'"'\\`$#]{8,255}$'
REDIS_URL_RE='^rediss?://[^[:space:]"'"'"'\\`$#]{1,255}$'
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
    # `fake` is refused: the API will not boot in production with it (api/src/config/assert-production.ts).
    TRANSLATE_PROVIDER) [[ "$value" =~ ^(google|off)$ ]] ;;
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
    MM_WEBHOOK_SECRET) [[ "$value" =~ ^[A-Za-z0-9._~+/=-]{16,}$ ]] ;;
    MM_PENDING_TTL_MIN) [[ "$value" =~ ^[1-9][0-9]{0,4}$ ]] ;;
    PAYOUT_CLEARANCE_HOURS) [[ "$value" =~ ^(0|[1-9][0-9]{0,2})$ && "$value" -le 720 ]] ;;
    REDIS_URL) [[ "$value" =~ $REDIS_URL_RE ]] ;;
    # Browser keys (--web). They are public once the site is built, but the same charset rules keep the env file safe.
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) [[ "$value" =~ ^AIza[0-9A-Za-z_-]{30,}$ ]] ;;
    NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID) [[ "$value" =~ ^[A-Za-z0-9_-]{1,64}$ ]] ;;
    NEXT_PUBLIC_FIREBASE_*) [[ "$value" =~ ^[A-Za-z0-9._:-]{1,255}$ ]] ;;
    *) return 1 ;;
  esac
}

why_invalid() {
  case "$1" in
    TRANSLATE_PROVIDER)
      if [[ "$(printf '%s' "${2:-}" | tr '[:upper:]' '[:lower:]')" == fake ]]; then
        echo "must not be fake: the API refuses to start in production with TRANSLATE_PROVIDER=fake (it would show \"[fr] text\" to customers). Use google (with GOOGLE_TRANSLATE_API_KEY) or off"
      else
        echo "must be one of: google, off"
      fi ;;
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
    MM_WEBHOOK_SECRET) echo "must be the shared secret of the aggregator webhook (16+ characters: letters, digits and . _ ~ + / = -)" ;;
    MM_PENDING_TTL_MIN) echo "must be a whole number of minutes, 1 to 99999 (default 15; 1440 with MM_PROVIDER=manual)" ;;
    PAYOUT_CLEARANCE_HOURS) echo "must be a whole number of hours, 0 to 720 (the admin Settings value 'Clearance hours' overrides it)" ;;
    REDIS_URL) echo "must look like redis://host:6379 or rediss://user:password@host:6380 (no spaces, quotes, backslash, \$, backtick or #)" ;;
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) echo "must look like AIza… (the browser Maps key, restricted to your site's address)" ;;
    NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID) echo "must be the Maps map ID: letters, digits, _ and - only" ;;
    NEXT_PUBLIC_FIREBASE_*) echo "must be the Firebase web value: letters, digits and . _ : - only (no spaces or quotes)" ;;
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
if [[ "$1" == "--web" ]]; then
  WEB=1
  shift
  [[ $# -ge 1 ]] || usage
fi
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
      is_allowed "$name" || die "line $lineno: $(not_allowed_msg "$name")"
      valid_value "$name" "$value" || die "line $lineno: $name $(why_invalid "$name" "$value")."
      remember "$name" "$value"
    done
    ;;
  -h | --help) usage ;;
  -*) usage ;;
  *)
    [[ $# -eq 1 ]] || usage
    name="$1"
    is_allowed "$name" || die "$(not_allowed_msg "$name")"
    [[ -t 0 ]] || die "no terminal for the hidden prompt: pipe NAME=VALUE lines with --stdin instead."
    IFS= read -rs -p "$name: " value
    printf '\n'
    valid_value "$name" "$value" || die "$name $(why_invalid "$name" "$value")."
    remember "$name" "$value"
    ;;
esac
value=""

[[ ${#NAMES[@]} -gt 0 ]] || die "nothing to set."

# ── 1. Write both env files (atomic), only after every value passed ──────────
wrote_api=0
if [[ "$WEB" == 1 ]]; then
  # The web file may not exist yet (the deploy only reads it when it is there): create it root-only.
  if [[ ! -e "$WEB_ENV" ]]; then
    mkdir -p "$(dirname "$WEB_ENV")"
    : >"$WEB_ENV"
    chmod 600 "$WEB_ENV"
  fi
  apply_to "$WEB_ENV"
else
  [[ -e "$EXTRA" ]] || die "$EXTRA does not exist: run deploy/droplet-deploy.sh first."
  apply_to "$EXTRA"
  if [[ -e "$API_ENV" ]]; then
    apply_to "$API_ENV"
    wrote_api=1
  fi
fi

for i in "${!NAMES[@]}"; do
  v="${VALUES[$i]}"
  if [[ "$SECRET_NAMES" == *" ${NAMES[$i]} "* ]]; then
    printf '%s set (…%s)\n' "${NAMES[$i]}" "${v: -4}"
  else
    printf '%s set\n' "${NAMES[$i]}"
  fi
done
if [[ "$WEB" == 0 && $wrote_api -eq 0 ]]; then
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
if [[ "$WEB" == 1 ]]; then
  echo "Saved in $WEB_ENV. The web must be REBUILT to use it: re-run deploy/droplet-deploy.sh with the same DOMAIN, ADMIN_EMAIL and SSL as before."
elif [[ "${SOMBA_NO_RELOAD:-}" == "1" ]]; then
  echo "reload skipped (SOMBA_NO_RELOAD=1)."
elif sudo -u "$APP_USER" -H pm2 reload "$PM2_APP" --update-env >/dev/null 2>&1; then
  echo "API reloaded."
else
  echo "warning: could not reload the API. Run: sudo -u $APP_USER -H pm2 reload $PM2_APP --update-env" >&2
fi
