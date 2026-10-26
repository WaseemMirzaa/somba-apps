/* eslint-disable no-console */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../app.module';
import { Category, Hub, HubCoverage, Setting, Translation, User } from './entities';
import { UsersService } from '../users/users.service';
import { seedCategories } from './seed-catalog';
import { DEFAULT_SELLER_PLANS } from '../content/plans';
import { sourceHash } from '../translation/translatable';
import { GeoService } from '../geo/geo.service';
import { CoverageService } from '../geo/coverage.service';

/**
 * Production bootstrap — SAFE to run on a live database, any number of times.
 *
 * Unlike `seed.ts` (demo data; wipes every table), this only INSERTS what is
 * missing: the first super-admin (from env), the category tree, the DRC geography,
 * platform settings and the launch warehouse. It never deletes or overwrites existing rows
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
    const translations = ds.getRepository(Translation);
    for (const [i, c] of seedCategories.entries()) {
      const cat = await cats.save(
        cats.create({
          name: c.name,
          icon: c.icon ?? null,
          image: c.image ?? null,
          sortOrder: i,
        }),
      );
      // The French name is a translations row written by a person (an author row), not a column.
      if (c.nameFr?.trim()) {
        await translations.save(
          translations.create({
            entityType: 'category',
            entityId: cat.id,
            field: 'name',
            locale: 'fr',
            value: c.nameFr.trim(),
            origin: 'author',
            sourceLang: 'en',
            sourceHash: sourceHash('en', cat.name),
          }),
        );
      }
    }
    console.log(`✓ created ${seedCategories.length} categories`);
  } else {
    console.log('• categories present — skipped');
  }

  // 3) The delivery geography: the 26 provinces, 38 cities, Kinshasa's 4 districts and 24 communes (only what is missing).
  const geo = app.get(GeoService);
  const addedAreas = await geo.ensureSeeded();
  console.log(addedAreas ? `✓ created ${addedAreas} delivery areas` : '• delivery areas present — skipped');

  // 4) The launch warehouse (only if none exist): ONE warehouse, "Entrepôt Kinshasa", in Gombe (pinned), covering the
  // province of Kinshasa. Only Kinshasa is served; everything else shows "coming soon" until an admin opens a warehouse
  // there. Existing warehouses are left alone, but one with a known name and no position is placed on the map.
  const POSITIONS: Record<string, { lat: number; lng: number }> = {
    'Entrepôt Kinshasa': { lat: -4.3105, lng: 15.3136 }, // Gombe
    'Kinshasa Hub': { lat: -4.3105, lng: 15.3136 },
    'Limete Hub': { lat: -4.354, lng: 15.347 },
    'Lubumbashi Hub': { lat: -11.6609, lng: 27.4794 },
    'Paris Hub': { lat: 48.8566, lng: 2.3522 },
  };
  const hubs = ds.getRepository(Hub);
  const coverage = app.get(CoverageService);
  if ((await hubs.count()) === 0) {
    const gombe = await geo.getByCode('CD-KN-GOM');
    const hub = await hubs.save(
      hubs.create({ name: 'Entrepôt Kinshasa', city: 'Kinshasa', country: 'DRC', capacity: 800, address: 'Gombe', areaId: gombe?.id ?? null, ...POSITIONS['Entrepôt Kinshasa'] }),
    );
    console.log('✓ created Entrepôt Kinshasa (Gombe, with its map position)');
    const province = await geo.getByCode('CD-KN');
    if (province) {
      await coverage.assign({ hubId: hub.id, areaIds: [province.id] });
      console.log('✓ Entrepôt Kinshasa covers the province of Kinshasa');
    }
  } else if ((await ds.getRepository(HubCoverage).count()) === 0) {
    console.log('• warehouses exist but cover nothing — assign their areas in Admin → Warehouses (the migration covers each city)');
  }
  for (const h of await hubs.find()) {
    const known = POSITIONS[h.name];
    if (known && (h.lat === null || h.lng === null)) {
      await hubs.update({ id: h.id }, known);
      console.log(`✓ placed ${h.name} on the map`);
    }
  }

  // 5) Platform settings (insert each missing key; never overwrite).
  const settings = ds.getRepository(Setting);
  const defaults: Record<string, string> = {
    fxRate: '2850',
    codCapUsd: '500',
    codEnabled: 'false', // matches the client scope: no cash on delivery at launch
    // Delivery fee is decided by the SERVER: base + per km (destination warehouse -> customer pin), capped, plus a
    // transfer fee between warehouses (edit in Admin -> Settings).
    deliveryBaseUsd: '2',
    deliveryPerKmUsd: '0.5',
    deliveryMaxUsd: '15',
    deliveryTransferUsd: '1.5',
    allowInterCityDelivery: 'true', // a parcel may travel between two served cities
    interCityTransferDays: '3', // days added to the estimate of such an order
    requirePinnedAddress: 'true', // checkout needs a map pin on the delivery address
    requireSellerPickupPin: 'true', // a seller pins their pickup location before listing products
    commissionPct: '12',
    productModeration: 'true', // new seller listings wait for a moderator
    requireDeliveryCode: 'true', // riders must enter the customer's 4-digit code on handover
    minPayoutUsd: '10',
    returnWindowDays: '7', // returns are accepted this many days after delivery
    sellerResponseHours: '48', // a seller answers a return, replacement or exchange within this time
    // Verification policy: an account needs a verified phone or email before it can
    // order or top up its wallet (needs SMTP and/or Twilio to be configured, see docs/DEPLOYMENT.md).
    requireVerifiedForCheckout: 'true',
    sellerPlans: JSON.stringify(DEFAULT_SELLER_PLANS),
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (!(await settings.findOne({ where: { key } }))) {
      await settings.save(settings.create({ key, value }));
      console.log(`✓ setting ${key}=${value}`);
    }
  }

  console.log('\nBootstrap complete.');
  await app.close();
}

run().catch((err) => {
  console.error('Bootstrap failed:', err.message);
  process.exit(1);
});
