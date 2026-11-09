/**
 * Smoke-test helper for accounts that start with a temporary password.
 *
 * Accounts an admin creates (`roles:createStaff`) and the first admin made by `bootstrap:prod` are flagged
 * `mustChangePassword`: they can sign in, but the server refuses every call except `me:changePassword` until the
 * password is changed (audit AD-02). A smoke script that creates staff or signs in as the bootstrap admin runs this first.
 * The demo seed (`npm run seed`, `seed:demo`) does NOT flag its accounts: they are documented shared logins.
 *
 *   const pw = await settlePassword(API, email, tempPassword);            // returns the password to sign in with from now on
 *   await settlePassword(API, adminEmail, adminPassword, { keep: true }); // changes it and back, so the same password keeps working
 *
 * Against a server without the forced change (no `mustChangePassword` in the login answer) it does nothing and returns the password given.
 */
const { io } = require('socket.io-client');

const NEXT_PASSWORD = 'Smoke-Staff-2026!';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(api, email, password) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${api}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const json = await res.json().catch(() => null);
    if (res.status === 429 && attempt < 6) { await sleep(15000); continue; }
    return { status: res.status, json };
  }
}

const connect = (api, token) => new Promise((resolve, reject) => {
  const s = io(api, { auth: { token }, transports: ['websocket'], forceNew: true });
  s.on('ready', () => resolve(s));
  s.on('connect_error', reject);
  setTimeout(() => reject(new Error('socket timeout')), 8000);
});

const ask = (s, event, body) => new Promise((r) => s.emit(event, body, r));

async function change(api, token, current, next) {
  const s = await connect(api, token);
  try {
    const r = await ask(s, 'me:changePassword', { current, next });
    if (!r?.ok) throw new Error(`me:changePassword refused: ${r?.error}`);
    return r.data; // fresh tokens
  } finally {
    s.close();
  }
}

async function settlePassword(api, email, password, opts = {}) {
  const first = await login(api, email, password);
  if (first.status !== 200) throw new Error(`login ${email}: ${first.status} ${JSON.stringify(first.json)}`);
  if (!first.json.mustChangePassword) return password;
  const next = opts.next ?? NEXT_PASSWORD;
  const fresh = await change(api, first.json.accessToken, password, next);
  if (!opts.keep) return next;
  await change(api, fresh.accessToken, next, password); // back to the original: the account stays unflagged
  return password;
}

module.exports = { settlePassword, NEXT_PASSWORD };
