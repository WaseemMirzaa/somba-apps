/* eslint-disable no-console */
import './demo/demo-quiet';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { removeDemo } from './demo/demo-remove-core';
import { loadManifest } from './demo/demo-images';
import { PRIVATE_UPLOAD_DIR } from '../sellers/private-files.service';
import { UPLOAD_DIR } from '../uploads/uploads.controller';

/**
 * Takes the demo data out again (see seed-demo.ts). It finds the demo through the users whose e-mail ends in
 * @demo.sombateka.test and deletes only what belongs to them: their stores, listings, orders, payments, messages,
 * reviews, tickets and so on, the demo warehouse, the demo picture files. Real rows are not touched.
 *
 *   npm run seed:demo:remove:prod              shows what would go and changes nothing
 *   npm run seed:demo:remove:prod -- --yes     does it
 *
 * It refuses (and deletes nothing) while a real order or delivery still points at demo data.
 */
async function run() {
  const yes = process.argv.includes('--yes');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const ds = app.get(DataSource);
    const manifest = loadManifest();
    const res = await removeDemo(ds, { yes, uploadDir: UPLOAD_DIR, privateDir: PRIVATE_UPLOAD_DIR, manifestNames: manifest.map((m) => `${m.uuid}.jpg`) });
    if (!res.userIds.length && !res.counts.length) {
      console.log('There is no demo data here: nothing to remove.');
      return;
    }
    console.log(`Demo data found: ${res.userIds.length} demo accounts.\n`);
    console.log('Rows that belong to the demo:');
    for (const [t, n] of res.counts) console.log(`  ${t.padEnd(26)} ${String(n).padStart(6)}`);
    console.log(`\nFiles: ${res.files.public.length} picture(s) in the uploads folder, ${res.files.private.length} private document(s).`);
    for (const n of res.notes) console.log(`Note: ${n}`);
    if (res.blockers.length) {
      console.log('');
      for (const b of res.blockers) console.log(`BLOCKED: ${b}`);
      console.log('\nNothing was deleted.');
      process.exitCode = 2;
      return;
    }
    if (!yes) {
      console.log('\nNothing was deleted. Run it again with --yes to delete exactly the rows above.');
      return;
    }
    const total = res.deleted.reduce((t, [, n]) => t + n, 0);
    console.log(`\n✅ Removed ${total} rows, ${res.filesRemoved.public} picture file(s) and ${res.filesRemoved.private} private document(s).`);
    console.log('Restart the API so it forgets the demo warehouse and the demo stores (deploy/seed-demo.sh does it).');
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error('Demo removal failed:', err.message ?? err);
  process.exit(1);
});
