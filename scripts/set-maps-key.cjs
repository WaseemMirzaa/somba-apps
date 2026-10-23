#!/usr/bin/env node
/* Install the Google Maps API key everywhere the address picker needs it, then check it works.
 *
 *   node scripts/set-maps-key.cjs AIza...            (from the repo root)
 *
 * Writes (all git-ignored):
 *   mobile/android/local.properties        GOOGLE_MAPS_API_KEY=…   (Maps SDK for Android)
 *   mobile/ios/Flutter/Secrets.xcconfig    GOOGLE_MAPS_API_KEY=…   (Maps SDK for iOS)
 *   mobile/dart-defines.local.json         {"GOOGLE_MAPS_API_KEY": "…"}   (Places / Geocoding calls from Dart)
 *   web/.env.local                         NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=…   (Maps JavaScript API on the web)
 *
 * Then: run the customer app with  flutter run --dart-define-from-file=dart-defines.local.json  and rebuild the web.
 * The key needs these APIs enabled: Maps SDK for Android, Maps SDK for iOS, Maps JavaScript API, Places API (New),
 * Geocoding API. Add --no-check to skip the live check (one Geocoding and one Places request).
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const key = args.find((a) => !a.startsWith('--'));
const check = !args.includes('--no-check');
if (!key || !/^AIza[0-9A-Za-z_-]{35}$/.test(key)) {
  console.error('Usage: node scripts/set-maps-key.cjs AIza... (a Google API key: 39 characters starting with AIza)');
  process.exit(2);
}
const root = path.join(__dirname, '..');

/** Set KEY=value in a KEY=value file (created if missing), replacing any earlier value. */
function setLine(file, name, value, header) {
  const p = path.join(root, file);
  const lines = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n') : [];
  const kept = lines.filter((l) => !l.startsWith(`${name}=`));
  while (kept.length && kept[kept.length - 1] === '') kept.pop();
  if (header && !kept.some((l) => l === header)) kept.push(header);
  kept.push(`${name}=${value}`, '');
  fs.writeFileSync(p, kept.join('\n'));
  fs.chmodSync(p, 0o600);
  console.log(`  ✓ ${file}`);
}

console.log('Installing the Maps key:');
setLine('mobile/android/local.properties', 'GOOGLE_MAPS_API_KEY', key);
setLine('mobile/ios/Flutter/Secrets.xcconfig', 'GOOGLE_MAPS_API_KEY', key, '// Google Maps key for the iOS Maps SDK (git-ignored).');
const defines = path.join(root, 'mobile/dart-defines.local.json');
const current = fs.existsSync(defines) ? JSON.parse(fs.readFileSync(defines, 'utf8') || '{}') : {};
fs.writeFileSync(defines, JSON.stringify({ ...current, GOOGLE_MAPS_API_KEY: key }, null, 2) + '\n');
fs.chmodSync(defines, 0o600);
console.log('  ✓ mobile/dart-defines.local.json');
setLine('web/.env.local', 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', key, '# Google Maps (address picker): Maps JavaScript API + Geocoding.');

async function verify() {
  const out = [];
  try {
    const g = await (await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=-4.3224,15.307&key=${key}`)).json();
    out.push(`Geocoding API: ${g.status === 'OK' ? 'works' : `${g.status}${g.error_message ? ` (${g.error_message})` : ''}`}`);
  } catch (e) {
    out.push(`Geocoding API: could not reach Google (${e.message})`);
  }
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify({ input: 'Gombe Kinshasa', includedRegionCodes: ['cd'] }),
    });
    const p = await res.json();
    out.push(`Places API (New): ${res.ok ? 'works' : `${p.error?.status ?? res.status} (${p.error?.message ?? 'refused'})`}`);
  } catch (e) {
    out.push(`Places API (New): could not reach Google (${e.message})`);
  }
  console.log('\nChecking the key:');
  for (const l of out) console.log(`  ${l}`);
  console.log('  (Maps SDK for Android / iOS and the Maps JavaScript API are checked when the map first loads in the apps / web.)');
}

(check ? verify() : Promise.resolve()).then(() => {
  console.log('\nNext: rebuild the web app; run the customer app with --dart-define-from-file=dart-defines.local.json.');
});
