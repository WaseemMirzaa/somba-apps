/* Send yourself a test notification (`devices:test`): it is saved for the account and pushed to every device the
 * account registered (phones and browsers). Prints how many devices can receive it and whether push is on.
 *
 *   API_URL=https://api.example.com node test/push-test.cjs you@example.com 'your-password'
 */
const { io } = require('socket.io-client');
const API = process.env.API_URL ?? 'http://localhost:3001';
const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: node test/push-test.cjs <email> <password>');
  process.exit(2);
}
(async () => {
  const res = await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  const { accessToken } = await res.json();
  const sock = io(API, { auth: { token: accessToken }, transports: ['websocket'] });
  await new Promise((resolve, reject) => { sock.on('ready', resolve); sock.on('connect_error', reject); setTimeout(() => reject(new Error('socket timeout')), 8000); });
  const r = await new Promise((resolve) => sock.emit('devices:test', {}, resolve));
  if (!r.ok) throw new Error(r.error);
  console.log(r.data.pushEnabled
    ? `Test notification sent. Devices registered for this account: ${r.data.devices}.`
    : `Test notification saved in the app. Push is OFF on this server (set FIREBASE_SERVICE_ACCOUNT_JSON). Devices registered: ${r.data.devices}.`);
  sock.close();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
