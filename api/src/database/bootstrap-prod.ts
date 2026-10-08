/* eslint-disable no-console */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../app.module';
import { Category, Hub, Setting, User } from './entities';
import { UsersService } from '../users/users.service';
import { seedCategories } from './seed-catalog';

/**
 * Production bootstrap — SAFE to run on a live database, any number of times.
 *
 * Unlike `seed.ts` (demo data; wipes every table), this only INSERTS what is
 * missing: the first super-admin (from env), the category tree, platform
 * settings and the default hubs. It never deletes or overwrites existing rows
 * and creates no demo users or demo catalogue.
 *
 *   ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='long-random' npm run bootstrap:prod
 */
async function run() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required.');
  }
  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const ds = app.get(DataSource);

  // 1) Super-admin (only if absent).
  const users = ds.getRepository(User);
  const emailHash = UsersService.emailHash(email);
  const existing = await users.findOne({ where: { emailHash } });
  if (existing) {
    console.log(`• admin ${email} already exists — left unchanged`);
  } else {
    await users.save(
      users.create({
        email,
        emailHash,
        passwordHash: await bcrypt.hash(password, 12),
        name: process.env.ADMIN_NAME?.trim() || 'Administrator',
        role: 'admin',
      }),
    );
    console.log(`✓ created super-admin ${email}`);
  }

  // 2) Categories (only if the table is empty).
  const cats = ds.getRepository(Category);
  if ((await cats.count()) === 0) {
    for (const [i, c] of seedCategories.entries()) {
      await cats.save(
        cats.create({
          name: c.name,
          nameFr: c.nameFr ?? null,
          icon: c.icon ?? null,
          image: c.image ?? null,
          sortOrder: i,
        }),
      );
    }
    console.log(`✓ created ${seedCategories.length} categories`);
  } else {
    console.log('• categories present — skipped');
  }

  // 3) Platform settings (insert each missing key; never overwrite).
  const settings = ds.getRepository(Setting);
  const defaults: Record<string, string> = {
    fxRate: '2850',
    codCapUsd: '500',
    codEnabled: 'false', // matches the client scope: no cash on delivery at launch
    commissionPct: '12',
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (!(await settings.findOne({ where: { key } }))) {
      await settings.save(settings.create({ key, value }));
      console.log(`✓ setting ${key}=${value}`);
    }
  }

  // 4) Hubs (only if none exist).
  const hubs = ds.getRepository(Hub);
  if ((await hubs.count()) === 0) {
    await hubs.save([
      hubs.create({ name: 'Kinshasa Hub', city: 'Kinshasa', country: 'DRC', capacity: 800 }),
      hubs.create({ name: 'Lubumbashi Hub', city: 'Lubumbashi', country: 'DRC', capacity: 400 }),
    ]);
    console.log('✓ created default hubs');
  }

  console.log('\nBootstrap complete.');
  await app.close();
}

run().catch((err) => {
  console.error('Bootstrap failed:', err.message);
  process.exit(1);
});
