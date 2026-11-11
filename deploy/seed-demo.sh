#!/usr/bin/env bash
# =============================================================================
# KOMORIKO: demo data on a server. ADDITIVE and REMOVABLE: it never wipes, never changes a setting, a real
# warehouse or the geography. Run ON the server, as root, after the normal deploy (which ran the bootstrap).
#
#   bash /opt/somba/deploy/seed-demo.sh              add the demo (a second run adds nothing)
#   bash /opt/somba/deploy/seed-demo.sh --with-express  add the demo AND switch express delivery on (see below)
#   bash /opt/somba/deploy/seed-demo.sh --with-2fa      add the demo with two-factor ON for the admins and stores (default: OFF, the password is enough)
#   bash /opt/somba/deploy/seed-demo.sh reset        same, and give every demo account a NEW password
#   bash /opt/somba/deploy/seed-demo.sh remove       show what would be removed (changes nothing)
#   bash /opt/somba/deploy/seed-demo.sh remove --yes remove it
#   bash /opt/somba/deploy/seed-demo.sh code EMAIL   print the current two-factor code of a demo account
#
# Accounts and passwords go to /etc/somba/demo-credentials.txt (root only, mode 600). Never into git or the screen.
# Optional: DEMO_PASSWORD='12+ characters' (otherwise a random one), SKIP_RELOAD=1 (do not reload the API).
#
# --with-express (or DEMO_WITH_EXPRESS=1) is the ONE thing that changes a setting: it sets expressDeliveryEnabled (the same-commune express orders of store C).
# Switch it on only once the current rider app build (it knows the express job) is installed on the riders' phones.
# =============================================================================
set -euo pipefail
umask 077

APP_USER=somba
APP_DIR="${APP_DIR:-/opt/somba}"
CONF_DIR="${CONF_DIR:-/etc/somba}"
CRED="$CONF_DIR/demo-credentials.txt"
API_ENV="$APP_DIR/api/.env"
die() { printf 'seed-demo: %s\n' "$*" >&2; exit 1; }

# --with-express and --with-2fa may stand anywhere; the other arguments keep their order. An old --with-cod is accepted and ignored.
args=()
for a in "$@"; do
  if [[ "$a" == "--with-cod" ]]; then echo "Cash on delivery was removed from the product; the flag does nothing." >&2; elif [[ "$a" == "--with-express" ]]; then export DEMO_WITH_EXPRESS=1; elif [[ "$a" == "--with-2fa" ]]; then export DEMO_WITH_2FA=1; else args+=("$a"); fi
done
set -- ${args[@]+"${args[@]}"}
cmd="${1:-seed}"
[[ $EUID -eq 0 ]] || [[ "${SOMBA_TEST_MODE:-}" == "1" ]] || die "Run as root (sudo -i)."
[[ -f "$API_ENV" ]] || die "$API_ENV not found: deploy first (deploy/droplet-deploy.sh)."

# The three values the script needs from the API environment (never sourced whole: it may hold JSON keys).
envval() { grep -E "^$1=" "$API_ENV" | head -1 | cut -d= -f2- || true; }
export UPLOAD_DIR="$(envval UPLOAD_DIR)" PRIVATE_UPLOAD_DIR="$(envval PRIVATE_UPLOAD_DIR)" PUBLIC_API_URL="$(envval PUBLIC_API_URL)"
[[ -n "$PUBLIC_API_URL" && -n "$UPLOAD_DIR" ]] || die "PUBLIC_API_URL and UPLOAD_DIR must be set in $API_ENV."

run_as_app() { if [[ $EUID -eq 0 ]]; then sudo -u "$APP_USER" --preserve-env=UPLOAD_DIR,PRIVATE_UPLOAD_DIR,PUBLIC_API_URL,DEMO_PASSWORD,DEMO_RESET_PASSWORDS,DEMO_WITH_EXPRESS,DEMO_WITH_2FA,DEMO_CREDENTIALS_FILE "$@"; else "$@"; fi; }
reload_api() { [[ "${SKIP_RELOAD:-}" == "1" ]] && return 0; [[ $EUID -eq 0 ]] && sudo -u "$APP_USER" bash -c 'pm2 reload somba-api --update-env >/dev/null' && echo "API reloaded." || true; }

case "$cmd" in
  code)
    email="${2:?usage: seed-demo.sh code EMAIL}"
    [[ -f "$CRED" ]] || die "$CRED not found: run the seed first."
    EMAIL="$email" CRED="$CRED" node -e '
      const fs=require("fs"),c=require("crypto");let cur="",key=null;const norm=s=>s.toLowerCase().replace(/@demo\.sombateka\.test$/,"@demo.komoriko.test");
      for(const l of fs.readFileSync(process.env.CRED,"utf8").split("\n")){const h=/^\[(.+)\]$/.exec(l.trim());if(h){cur=norm(h[1]);continue}const k=/^totp_key\s*=\s*(\S+)/.exec(l.trim());if(k&&cur===norm(process.env.EMAIL))key=k[1]}
      if(!key){console.error("no two-factor key for that account");process.exit(1)}
      const A="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let b=0,v=0;const o=[];for(const ch of key.replace(/[\s=-]/g,"").toUpperCase()){v=(v<<5)|A.indexOf(ch);b+=5;if(b>=8){o.push((v>>>(b-8))&255);b-=8}}
      const step=Math.floor(Date.now()/30000),m=Buffer.alloc(8);m.writeBigUInt64BE(BigInt(step));const h=c.createHmac("sha1",Buffer.from(o)).update(m).digest();const f=h[h.length-1]&15;
      console.log(String((((h[f]&127)<<24)|(h[f+1]<<16)|(h[f+2]<<8)|h[f+3])%1e6).padStart(6,"0"),"(valid for about", 30-Math.floor(Date.now()/1000)%30, "seconds)")'
    ;;
  seed|reset)
    [[ "$cmd" == "reset" ]] && export DEMO_RESET_PASSWORDS=1
    [[ "${DEMO_WITH_EXPRESS:-}" == "1" ]] && echo "*** --with-express: express delivery will be SWITCHED ON for the whole platform (setting expressDeliveryEnabled). Only do this once the current rider app is installed. The removal does not switch it off again." >&2
    [[ "${DEMO_WITH_COD:-}" == "1" ]] && echo "Cash on delivery was removed from the product; DEMO_WITH_COD does nothing." >&2
    work="$(mktemp -d)"; chmod 700 "$work"; [[ $EUID -eq 0 ]] && chown "$APP_USER:$APP_USER" "$work"
    trap 'rm -rf "$work"' EXIT
    # The previous file goes in so accounts that already exist keep their passwords; the app user cannot read /etc/somba.
    if [[ -f "$CRED" ]]; then cp "$CRED" "$work/credentials.txt"; [[ $EUID -eq 0 ]] && chown "$APP_USER:$APP_USER" "$work/credentials.txt"; fi
    export DEMO_CREDENTIALS_FILE="$work/credentials.txt"
    ( cd "$APP_DIR/api" && run_as_app npm run --silent seed:demo:prod )
    [[ -f "$work/credentials.txt" ]] || die "the seed did not write the credentials file."
    mkdir -p "$CONF_DIR"; chmod 700 "$CONF_DIR"
    cp "$work/credentials.txt" "$CRED"; chmod 600 "$CRED"; [[ $EUID -eq 0 ]] && chown root:root "$CRED"
    echo "Credentials: $CRED (root only). Read them with:  sudo cat $CRED"
    reload_api
    ;;
  remove)
    shift || true
    ( cd "$APP_DIR/api" && run_as_app npm run --silent seed:demo:remove:prod -- "$@" )
    if [[ " $* " == *" --yes "* ]]; then rm -f "$CRED"; echo "Credentials file removed."; reload_api; fi
    ;;
  *) die "unknown command '$cmd' (seed, reset, remove, code; --with-express anywhere)";;
esac
