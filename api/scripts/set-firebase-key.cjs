#!/usr/bin/env node
/* Put the Firebase service-account key (the server's push credential) into api/.env as
 * FIREBASE_SERVICE_ACCOUNT_JSON (base64, so .env quoting can't break it). The key never needs to be pasted anywhere.
 *
 *   Firebase console → Project settings → Service accounts → Generate new private key  (downloads a .json)
 *   node scripts/set-firebase-key.cjs ~/Downloads/somba-et-teka-firebase-adminsdk-xxxx.json
 *
 * Then restart the API. Its log no longer says "Push disabled". Delete the downloaded file afterwards.
 */
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/set-firebase-key.cjs <path-to-service-account.json>');
  process.exit(2);
}
let key;
try {
  key = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`Could not read a JSON key from ${file}: ${e.message}`);
  process.exit(1);
}
if (key.type !== 'service_account' || !key.private_key || !key.client_email) {
  console.error('This is not a Firebase service-account key (expected "type": "service_account" with a private key).');
  process.exit(1);
}
const expected = process.env.FIREBASE_PROJECT_ID || 'somba-et-teka';
if (key.project_id !== expected) {
  console.error(`The key is for project "${key.project_id}", not "${expected}". Set FIREBASE_PROJECT_ID to override.`);
  process.exit(1);
}

const envPath = path.join(__dirname, '..', '.env');
const line = `FIREBASE_SERVICE_ACCOUNT_JSON=${Buffer.from(JSON.stringify(key)).toString('base64')}`;
const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const kept = current
  .split('\n')
  .filter((l) => !l.startsWith('FIREBASE_SERVICE_ACCOUNT_JSON=') && !l.startsWith('# Firebase push (service account'));
while (kept.length && kept[kept.length - 1] === '') kept.pop();
fs.writeFileSync(envPath, [...kept, '# Firebase push (service account for project ' + key.project_id + ')', line, ''].join('\n'), { mode: 0o600 });
fs.chmodSync(envPath, 0o600); // owner-only: it now holds a private key
console.log(`Saved the key for ${key.client_email} to api/.env. Restart the API, then delete ${file}.`);
