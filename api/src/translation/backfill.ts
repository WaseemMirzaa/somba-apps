/* eslint-disable no-console */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TranslationService, USD_PER_MILLION_CHARS } from './translation.service';

/**
 * Translate everything that is missing a language, once.
 *
 *   npm run translate:backfill -- --dry-run     # how many characters, and about what cost; writes nothing
 *   npm run translate:backfill                   # queue every record missing a language, then run the worker
 *   npm run translate:backfill:prod              # the same from the build (node dist/translation/backfill.js)
 *
 * Text a person wrote (author rows) is never touched. The daily character limit (TRANSLATE_DAILY_CHAR_LIMIT) still
 * applies: if it is reached the rest stays queued and the API's own 60 s sweeper finishes it the next day.
 */
async function run() {
  const dryRun = process.argv.includes('--dry-run');
  process.env.TRANSLATE_SWEEP_MS = '0'; // this process drains the queue itself
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const svc = app.get(TranslationService);
    svc.republish = false; // no socket server in a script
    const plan = await svc.backfill({ dryRun });

    console.log(`Provider: ${svc.providerName}${svc.enabled ? '' : '  (translation is OFF: set TRANSLATE_PROVIDER, GOOGLE_TRANSLATE_API_KEY or FIREBASE_SERVICE_ACCOUNT_JSON)'}`);
    for (const [type, s] of Object.entries(plan.perType)) {
      if (s.records) console.log(`  ${type.padEnd(11)} ${String(s.records).padStart(5)} records · ${String(s.items).padStart(5)} texts · ${String(s.chars).padStart(8)} characters`);
    }
    console.log(`\nTo translate: ${plan.records} records, ${plan.items} texts, ${plan.chars.toLocaleString('en')} characters`);
    console.log(`Estimated cost: about $${plan.estimatedUsd.toFixed(2)} (at $${USD_PER_MILLION_CHARS} per million characters)`);
    console.log(`Daily limit: ${svc.charLimit.toLocaleString('en')} characters; used today: ${(await svc.usedToday()).toLocaleString('en')}`);
    if (dryRun) {
      console.log('\nDry run: nothing was queued.');
      return;
    }
    if (!svc.enabled) {
      console.log('\nNothing queued: translation is off.');
      return;
    }
    if (!plan.records) {
      console.log('\nNothing to do.');
      return;
    }
    console.log('\nQueued. Translating…');
    const done = await svc.drain((n, left) => console.log(`  ${n} done, ${left} waiting`));
    const status = await svc.status();
    console.log(`\nFinished ${done} records. Queue: ${status.pending} pending, ${status.failed} failed. Characters today: ${status.charsToday.toLocaleString('en')}.`);
    if (status.pending) console.log('Some records are still pending (daily limit or provider errors): the API retries them automatically.');
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
