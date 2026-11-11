/* eslint-disable no-console */
import './demo/demo-quiet';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../app.module';
import {
  Category,
  Hub,
  HubCoverage,
  PrivateFile,
  Product,
  Seller,
  SellerTeamMember,
  Setting,
  User,
} from './entities';
import { UsersService } from '../users/users.service';
import { SellersService } from '../ops/sellers.service';
import { ProductsService, cleanListing } from '../products/products.service';
import { WalletService } from '../wallet/wallet.service';
import { CoverageService } from '../geo/coverage.service';
import { GeoService } from '../geo/geo.service';
import { LanesService } from '../logistics/lanes.service';
import { HubOpsSettingsService } from '../logistics/hub-ops-settings.service';
import { PrivateFilesService } from '../sellers/private-files.service';
import { StorefrontService } from '../sellers/storefront.service';
import { sellerContext } from '../sellers/seller-context';
import { newRecoveryCodes, hashRecovery, newTotpSecret } from '../auth/totp';
import {
  CredentialEntry,
  DEMO_DOMAIN,
  DEMO_HUB_NAME,
  demoEmail,
  log,
  randomPassword,
  readCredentials,
  writeCredentials,
} from './demo/demo-common';
import { DEMO_ACCOUNTS, DEMO_TEAM } from './demo/demo-accounts';
import type { DemoAccount } from './demo/demo-accounts';
import { DEMO_PRODUCTS, DEMO_STORES } from './demo/demo-catalog';
import type { DemoStore } from './demo/demo-catalog';
import { DemoImages } from './demo/demo-images';
import { renameLegacyDemoEmails } from './demo/demo-legacy';
import { seedCommerce } from './demo/demo-commerce';
import { seedEngagement } from './demo/demo-engagement';
import { seedAdminQueues } from './demo/demo-admin';
import type { DemoCtx } from './demo/demo-ctx';

/**
 * Demo data for a live server. ADDITIVE, IDEMPOTENT and REMOVABLE: it never wipes, never changes a setting, a real
 * warehouse or the geography, and a second run adds nothing. `seed-demo-remove.ts` takes it all out again.
 *
 *   npm run seed:demo:prod          (on a server, through deploy/seed-demo.sh)
 *   DEMO_PASSWORD='at-least-12-chars' DEMO_RESET_PASSWORDS=1 ...   (optional)
 *
 * Needs `bootstrap:prod` to have run first (settings, categories, geography, the launch warehouse, the admin).
 */

/** The settings the demo is written for (the values `bootstrap-prod` sets). A different value is reported, never changed. */
const EXPECTED: Record<string, string> = {
  requireVerifiedForCheckout: 'true',
  requirePinnedAddress: 'true',
  requireSellerPickupPin: 'true',
  productModeration: 'true',
  requireDeliveryCode: 'true',
  codEnabled: 'false',
};

async function preflight(
  ds: DataSource,
  withCod: boolean,
): Promise<{ warnings: string[]; mainHub: Hub }> {
  const settings = new Map(
    (await ds.getRepository(Setting).find()).map((s) => [s.key, s.value]),
  );
  if (
    !settings.has('requireVerifiedForCheckout') ||
    !settings.has('commissionPct')
  ) {
    throw new Error(
      'The platform settings are missing. Run the bootstrap first (npm run bootstrap:prod), then run this again.',
    );
  }
  if (!(await ds.getRepository(User).count({ where: { role: 'admin' } })))
    throw new Error(
      'There is no admin account yet. Run the bootstrap first (npm run bootstrap:prod).',
    );
  if (!(await ds.getRepository(Category).count()))
    throw new Error(
      'There are no categories yet. Run the bootstrap first (npm run bootstrap:prod).',
    );
  const hubs = await ds.getRepository(Hub).find({ where: { active: true } });
  const mainHub = hubs.find((h) => h.name !== DEMO_HUB_NAME);
  if (!mainHub)
    throw new Error(
      'There is no warehouse yet. Run the bootstrap first (npm run bootstrap:prod).',
    );
  if (
    !(await ds
      .getRepository(HubCoverage)
      .count({ where: { hubId: mainHub.id } }))
  )
    throw new Error(
      `${mainHub.name} covers no area. Run the bootstrap first, or assign its areas in Admin > Warehouses.`,
    );
  const warnings: string[] = [];
  for (const [k, v] of Object.entries(EXPECTED)) {
    // With --with-cod the seed switches cash on delivery on itself and says so; every other difference is only reported.
    if (k === 'codEnabled' && withCod) continue;
    if (settings.get(k) !== v)
      warnings.push(
        `Setting ${k} is "${settings.get(k) ?? 'not set'}" (the demo is written for "${v}"). It was NOT changed; some scenarios will behave differently.`,
      );
  }
  return { warnings, mainHub };
}

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    await main(app);
  } finally {
    await app.close();
  }
}

async function main(app: INestApplicationContext) {
  const ds = app.get(DataSource);
  const credFile =
    process.env.DEMO_CREDENTIALS_FILE ?? '/etc/somba/demo-credentials.txt';
  const resetPasswords = process.env.DEMO_RESET_PASSWORDS === '1';
  const supplied = process.env.DEMO_PASSWORD;
  if (supplied !== undefined && supplied.length < 12)
    throw new Error('DEMO_PASSWORD must be at least 12 characters.');

  // A server seeded before the rename to KOMORIKO keeps one set of accounts: move them to the new demo domain first.
  const moved = await renameLegacyDemoEmails(ds);
  if (moved.renamed || moved.invitations)
    log(
      `• renamed ${moved.renamed} demo account(s) and ${moved.invitations} team invitation(s) to @${DEMO_DOMAIN}`,
    );
  for (const e of moved.skipped)
    log(`! ${e} was not renamed: the new address already exists.`);

  const withCod =
    process.env.DEMO_WITH_COD === '1' || process.argv.includes('--with-cod');
  const { warnings, mainHub } = await preflight(ds, withCod);
  for (const w of warnings) log(`! ${w}`);
  const codOn = await settleCod(ds, withCod);
  const expressOn = await settleExpress(
    ds,
    process.env.DEMO_WITH_EXPRESS === '1' ||
      process.argv.includes('--with-express'),
  );

  const images = new DemoImages();
  const copied = images.install();
  log(
    `• pictures: ${copied.written} copied to ${images.dir}, ${copied.present} already there`,
  );

  // Two passwords per run: one for customers and store owners (what you may hand to a client), one for staff (admins,
  // warehouse, riders). DEMO_PASSWORD, when given, is used for everyone.
  const publicPassword = supplied ?? randomPassword();
  const staffPassword = supplied ?? randomPassword();
  const hashes = {
    public: await bcrypt.hash(publicPassword, 12),
    staff: supplied ? null : await bcrypt.hash(staffPassword, 12),
  };
  if (!hashes.staff) hashes.staff = hashes.public;
  const groupOf = (role: string): 'public' | 'staff' =>
    role === 'customer' || role === 'seller' ? 'public' : 'staff';
  const previous = readCredentials(credFile);
  const userRepo = ds.getRepository(User);
  const credentials = new Map<string, CredentialEntry>();
  const counts = { created: 0, existing: 0 };

  const ctx: DemoCtx = {
    app,
    ds,
    images,
    mainHub,
    demoHub: null as unknown as Hub,
    users: new Map(),
    stores: new Map(),
    products: new Map(),
    created: counts,
    codOn,
    expressOn,
    area: async (code: string) => {
      const a = await app.get(GeoService).getByCode(code);
      if (!a) throw new Error(`Area ${code} is missing from the geography.`);
      return a;
    },
  };

  // ── accounts ────────────────────────────────────────────────────────────────
  const ensureUser = async (
    def: {
      key: string;
      email: string;
      name: string;
      role: User['role'];
      phone?: string;
      locale?: 'en' | 'fr';
      verified: boolean;
      active?: boolean;
      twofa?: boolean;
      hubId?: string | null;
      tier?: User['warehouseTier'];
    },
    scenario: string,
    roleLabel: string,
  ): Promise<User> => {
    const hash = UsersService.emailHash(def.email);
    let user = await userRepo.findOne({ where: { emailHash: hash } });
    let pw: string | null;
    if (!user) {
      user = await userRepo.save(
        userRepo.create({
          email: def.email,
          emailHash: hash,
          passwordHash: hashes[groupOf(def.role)] as string,
          name: def.name,
          role: def.role,
          phone: def.phone ?? null,
          locale: def.locale ?? 'en',
          emailVerified: def.verified,
          phoneVerified: def.verified && !!def.phone,
          active: def.active ?? true,
          hubId: def.hubId ?? null,
          warehouseTier: def.tier ?? null,
        }),
      );
      pw = groupOf(def.role) === 'public' ? publicPassword : staffPassword;
      counts.created++;
    } else {
      counts.existing++;
      const patch: Partial<User> = {};
      if (resetPasswords) {
        patch.passwordHash = hashes[groupOf(def.role)] as string;
        patch.tokenVersion = (user.tokenVersion ?? 0) + 1;
        pw = groupOf(def.role) === 'public' ? publicPassword : staffPassword;
      } else pw = previous.get(def.email)?.password ?? null;
      if (def.hubId !== undefined && user.hubId !== def.hubId)
        patch.hubId = def.hubId;
      if (def.tier !== undefined && user.warehouseTier !== def.tier)
        patch.warehouseTier = def.tier;
      if (user.active !== (def.active ?? true))
        patch.active = def.active ?? true;
      if (Object.keys(patch).length) {
        await userRepo.update({ id: user.id }, patch);
        user = (await userRepo.findOne({ where: { id: user.id } }))!;
      }
    }
    let totp: string | null = null;
    let recovery: string[] | undefined;
    if (def.twofa) {
      if (!user.twofaEnabled || !user.twofaSecret) {
        const secret = newTotpSecret();
        recovery = newRecoveryCodes();
        await userRepo.update(
          { id: user.id },
          {
            twofaSecret: secret as never,
            twofaEnabled: true,
            twofaRecovery: JSON.stringify(recovery.map(hashRecovery)),
            twofaLastStep: 0,
          },
        );
        user = (await userRepo.findOne({ where: { id: user.id } }))!;
      }
      totp = user.twofaSecret;
    }
    credentials.set(def.email, {
      email: def.email,
      role: roleLabel,
      password: pw,
      totpKey: totp,
      recoveryCodes: recovery ?? previous.get(def.email)?.recoveryCodes,
      scenario,
    });
    ctx.users.set(def.key, user);
    return user;
  };

  // ── the demo warehouse (a second one, only for the transfer scenario) ─────────
  const geo = app.get(GeoService);
  const coverage = app.get(CoverageService);
  const hubRepo = ds.getRepository(Hub);
  let demoHub = await hubRepo.findOne({ where: { name: DEMO_HUB_NAME } });
  if (!demoHub) {
    const maluku = await ctx.area('CD-KN-MLK');
    demoHub = await hubRepo.save(
      hubRepo.create({
        name: DEMO_HUB_NAME,
        city: 'Kinshasa',
        country: 'DRC',
        capacity: 200,
        address: 'Maluku (demo warehouse)',
        areaId: maluku.id,
        lat: -4.4614,
        lng: 16.0786,
      }),
    );
    const covered = await ds
      .getRepository(HubCoverage)
      .findOne({ where: { areaId: maluku.id } });
    if (!covered)
      await coverage.assign({ hubId: demoHub.id, areaIds: [maluku.id] });
    log(`✓ demo warehouse ${DEMO_HUB_NAME} (covers Maluku only)`);
  }
  ctx.demoHub = demoHub;
  const lanes = app.get(LanesService);
  if (!(await lanes.list(demoHub.id)).length) {
    await lanes.upsert({
      fromHubId: mainHub.id,
      toHubId: demoHub.id,
      transitHours: 8,
      bidirectional: true,
    });
    log('✓ lane between the two warehouses');
  }
  const opsSettings = app.get(HubOpsSettingsService);
  if ((await opsSettings.view(demoHub.id)).isDefault) {
    await opsSettings.update(
      {
        id: 'demo-seed',
        role: 'admin',
        name: 'Demo seed',
        hubId: null,
        tier: null,
      } as never,
      demoHub.id,
      {
        workStart: '07:00',
        workEnd: '19:00',
        workDays: [1, 2, 3, 4, 5, 6],
        batchSize: 12,
      },
    );
  }

  // ── accounts: staff, customers, store owners, team ─────────────────────────────
  const hubOf = (h?: 'main' | 'demo') =>
    h === 'main' ? mainHub.id : h === 'demo' ? demoHub!.id : undefined;
  for (const acc of DEMO_ACCOUNTS as DemoAccount[]) {
    await ensureUser(
      { ...acc, hubId: hubOf(acc.hub), tier: acc.tier },
      acc.scenario,
      roleLabelOf(acc),
    );
  }
  for (const s of DEMO_STORES) {
    await ensureUser(
      {
        key: `seller.${s.key.toLowerCase()}`,
        email: s.email,
        name: s.ownerName,
        role: 'seller',
        phone: s.phone,
        verified: true,
        twofa: s.twofa,
      },
      `Store owner. ${s.scenario}`,
      `seller owner, store ${s.key}: ${s.storeName}`,
    );
  }
  for (const t of DEMO_TEAM) {
    await ensureUser(
      {
        key: t.key,
        email: demoEmail(t.key),
        name: t.name,
        role: 'seller',
        phone: t.phone,
        verified: true,
        twofa: false,
      },
      `Member of Maison Kinshasa (store A) with the "${t.role}" role.`,
      `seller team member (${t.role}), store A`,
    );
  }
  log(
    `✓ accounts: ${counts.created} created, ${counts.existing} already there`,
  );

  // ── stores ─────────────────────────────────────────────────────────────────────
  await seedStores(ctx);
  await seedProducts(ctx);

  // ── commerce, engagement, admin queues (each part is idempotent on its own) ─────
  await seedCommerce(ctx);
  await seedEngagement(ctx);
  await seedAdminQueues(ctx);

  // The credentials file lists every demo account (passwords of accounts created in an earlier run come from the old file).
  writeCredentials(
    credFile,
    [...credentials.values()],
    [
      'KOMORIKO DEMO credentials. Treat this file as a secret (it is root-only on a server).',
      'Customers and store owners share one password; staff (admins, warehouse, riders) share another. Hand out only the first kind.',
      `Written ${new Date().toISOString()}. Every demo account uses the e-mail domain @${DEMO_DOMAIN}.`,
      'totp_key = the key to add to an authenticator app (Google Authenticator, 1Password...): "Enter a setup key", time based, 6 digits.',
      'recovery_codes = one-time codes that work instead of an app code.',
      'A password shown as (unknown) belongs to an account created in an earlier run whose file was lost: re-run with DEMO_RESET_PASSWORDS=1.',
    ],
  );
  const unknown = [...credentials.values()].filter((c) => !c.password).length;
  log(
    `\n✅ Demo data ready. Credentials: ${credFile} (${credentials.size} accounts${unknown ? `, ${unknown} with an unknown password` : ''}).`,
  );
}

/**
 * Cash on delivery is off on a production server, so the cash-on-delivery orders need an explicit opt-in. This is the ONLY
 * setting the demo ever changes, and only when asked (`seed-demo.sh --with-cod`, or DEMO_WITH_COD=1). The removal leaves it as
 * it is (it cannot know whether someone else relies on it) and tells how to switch it off. Returns whether COD is on.
 */
async function settleCod(ds: DataSource, withCod: boolean): Promise<boolean> {
  const repo = ds.getRepository(Setting);
  const row = await repo.findOne({ where: { key: 'codEnabled' } });
  if (withCod && row?.value !== 'true') {
    if (row) await repo.update({ key: 'codEnabled' }, { value: 'true' });
    else await repo.save(repo.create({ key: 'codEnabled', value: 'true' }));
    log('');
    log(
      '!!! CASH ON DELIVERY WAS SWITCHED ON (setting codEnabled = true), because you asked for --with-cod.',
    );
    log(
      '!!! Real customers can now choose cash on delivery too. The demo removal does NOT switch it back off:',
    );
    log(
      '!!! turn it off in Admin > Settings > Checkout and delivery > Cash on delivery when you are done testing.',
    );
    log('');
    return true;
  }
  if (row?.value === 'true') {
    log(
      '• cash on delivery is on: the cash-on-delivery orders are made (the seed did not change that setting).',
    );
    return true;
  }
  log(
    '• cash on delivery is off, so the cash-on-delivery orders are skipped. To get them: bash /opt/somba/deploy/seed-demo.sh --with-cod (this switches the setting on; see deploy/DEMO-SEED.md).',
  );
  return false;
}

/**
 * Express delivery is off until the rider app that knows the express job is installed, so the express orders need an explicit
 * opt-in too (`--with-express`, or DEMO_WITH_EXPRESS=1). It sets ONLY `expressDeliveryEnabled`, says so, and the removal leaves
 * it as it is. Returns whether express is on.
 */
async function settleExpress(ds: DataSource, want: boolean): Promise<boolean> {
  const repo = ds.getRepository(Setting);
  const row = await repo.findOne({ where: { key: 'expressDeliveryEnabled' } });
  if (want && row?.value !== 'true') {
    if (row)
      await repo.update({ key: 'expressDeliveryEnabled' }, { value: 'true' });
    else
      await repo.save(
        repo.create({ key: 'expressDeliveryEnabled', value: 'true' }),
      );
    log('');
    log(
      '!!! EXPRESS DELIVERY WAS SWITCHED ON (setting expressDeliveryEnabled = true), because you asked for --with-express.',
    );
    log(
      '!!! Any real order from a store that offers express, in its own commune, now gets an express rider. Only do this once the',
    );
    log(
      '!!! current rider app build (it knows the express job) is installed. The demo removal does NOT switch it back off:',
    );
    log(
      '!!! turn it off in Admin > Settings > Checkout and delivery > Express delivery when you are done testing.',
    );
    log('');
    return true;
  }
  if (row?.value === 'true') {
    log(
      '• express delivery is on: the express orders are made (the seed did not change that setting).',
    );
    return true;
  }
  log(
    '• express delivery is off, so the express orders are skipped. To get them: bash /opt/somba/deploy/seed-demo.sh --with-express (this switches the setting on; see deploy/DEMO-SEED.md).',
  );
  return false;
}

function roleLabelOf(a: DemoAccount): string {
  const map: Record<string, string> = {
    customer: 'customer',
    admin: 'super admin',
    admin_moderation: 'admin (moderation)',
    admin_operations: 'admin (operations)',
    admin_finance: 'admin (finance)',
    admin_marketing: 'admin (marketing)',
    admin_support: 'admin (support)',
    warehouse_staff: `warehouse ${a.tier}`,
    rider: 'rider',
  };
  return map[a.role] ?? a.role;
}

// ─────────────────────────────────────────────────────────────────────────────────
// Stores
// ─────────────────────────────────────────────────────────────────────────────────

const KYC_DOCS = [
  'sample-id-card.jpg',
  'sample-rccm.jpg',
  'sample-tax-certificate.jpg',
];

async function kycDocuments(ctx: DemoCtx, owner: User): Promise<string[]> {
  const files = ctx.app.get(PrivateFilesService);
  const rows = await ctx.ds
    .getRepository(PrivateFile)
    .find({ where: { ownerUserId: owner.id } });
  const urls: string[] = [];
  if (rows.length) return rows.map((r) => files.urlFor(r.id, ctx.images.base));
  const dir = join(__dirname, '..', '..', '..', 'deploy', 'demo', 'kyc');
  for (const f of KYC_DOCS.slice(0, 2))
    urls.push(
      (await files.save(owner.id, readFileSync(join(dir, f)), ctx.images.base))
        .url,
    );
  return urls;
}

async function seedStores(ctx: DemoCtx): Promise<void> {
  const { ds } = ctx;
  const sellers = ctx.app.get(SellersService);
  const sellerRepo = ds.getRepository(Seller);
  const wallet = ctx.app.get(WalletService);
  const storefront = ctx.app.get(StorefrontService);
  for (const s of DEMO_STORES as DemoStore[]) {
    const owner = ctx.users.get(`seller.${s.key.toLowerCase()}`)!;
    let seller = await sellerRepo.findOne({ where: { userId: owner.id } });
    const fresh = !seller;
    if (!seller) {
      const docs = await kycDocuments(ctx, owner);
      await sellers.register({ id: owner.id, name: owner.name }, {
        name: s.storeName,
        legalName: `${s.storeName} SARL (demo)`,
        phone: s.phone,
        idNumber: `DEMO-ID-0${s.key.charCodeAt(0)}`,
        rccm: `CD/KIN/RCCM/DEMO-0${s.key.charCodeAt(0)}`,
        taxNumber: `A0000${s.key.charCodeAt(0)}D`,
        documentUrls: docs,
        acceptTerms: true,
      } as never);
      seller = (await sellerRepo.findOne({ where: { userId: owner.id } }))!;
      ctx.created.created++;
    }
    ctx.stores.set(s.key, seller);
    if (!fresh) continue; // an existing store keeps its state; later passes below only fill what is missing

    if (s.status === 'pending') continue; // D waits for an admin
    if (s.status === 'rejected') {
      await sellers.setStatus(
        seller.id,
        'rejected',
        'The ID document is unreadable and the RCCM number does not match the legal name. Please upload clear copies and submit again.',
      );
      continue;
    }
    await sellers.setStatus(seller.id, 'approved', 'Approved for the demo.');
    // Pickup location (this decides the origin warehouse), logo, banner and the description in both languages.
    if (s.pickup) {
      const area = await ctx.area(s.pickup.areaCode);
      const logo = ['A', 'B', 'C', 'F', 'G', 'H'].includes(s.key)
        ? ctx.images.url(`logo-${s.key}.jpg`)
        : undefined;
      const banner = ['A', 'B', 'C', 'F', 'G'].includes(s.key)
        ? ctx.images.url(`banner-${s.key}.jpg`)
        : undefined;
      await sellers.updateProfile(owner.id, {
        pickupAddress: s.pickup.address,
        pickupLat: s.pickup.lat,
        pickupLng: s.pickup.lng,
        pickupAreaId: area.id,
        ...(logo ? { logoUrl: logo } : {}),
        ...(banner ? { bannerUrl: banner } : {}),
        description: s.description,
        descriptionFr: s.descriptionFr,
      });
    } else if (s.key === 'H') {
      await sellers.updateProfile(owner.id, {
        logoUrl: ctx.images.url('logo-H.jpg'),
        description: s.description,
        descriptionFr: s.descriptionFr,
      });
    }
    seller = (await sellerRepo.findOne({ where: { id: seller.id } }))!;
    await sellerRepo.update(
      { id: seller.id },
      {
        badge:
          s.key === 'A' ? 'somba_assured' : s.key === 'B' ? 'silver' : 'bronze',
      },
    );
    // Plan: store A buys Pro with its wallet (a real plan payment), the others stay on Free.
    if (s.plan === 'pro') {
      await wallet.apply(
        owner.id,
        'credit',
        150,
        'Demo starter credit (not real money)',
      );
      await sellers.subscribe(owner.id, { plan: 'pro', method: 'wallet' });
    }
    ctx.stores.set(
      s.key,
      (await sellerRepo.findOne({ where: { id: seller.id } }))!,
    );
  }

  // Storefront settings that need the seller context (so they pass the same checks as the portal).
  const ctxOf = (key: string) => {
    const u = ctx.users.get(`seller.${key.toLowerCase()}`)!;
    return sellerContext(
      { id: u.id, role: 'seller', name: u.name },
      'storefront',
    );
  };
  const A = await ctxOf('A');
  if (!A.seller.returnsPolicy) {
    await storefront.update(A, {
      handlingDays: 1,
      returnsPolicy:
        'Returns are accepted within 7 days of delivery for unused items in their original packaging. Food and beauty products can only be returned unopened.',
      returnsPolicyFr:
        'Les retours sont acceptés dans les 7 jours suivant la livraison pour les articles non utilisés dans leur emballage d’origine. Les produits alimentaires et de beauté doivent être non ouverts.',
      shippingPolicy:
        'We pack every order within one working day and hand it to the KOMORIKO warehouse in Gombe.',
    } as never);
    await storefront.setGoals(A, { revenueUsd: 2000, orders: 60, rating: 4.5 });
    await storefront.setPayoutAccount(A, {
      method: 'mobile_money',
      account: '+243 900 000 301',
    });
  }
  // Handling time of the other two active stores (A and G are set above), for the delivery estimate.
  for (const [key, days] of [
    ['B', 2],
    ['C', 1],
  ] as const) {
    const c = await ctxOf(key);
    if (!c.seller.handlingDays)
      await storefront.update(c, { handlingDays: days } as never);
  }
  // Store C offers express delivery (its pickup pin is in Kasa-Vubu, where a demo customer has a pinned address). Harmless while the
  // platform setting is off; the store is a demo store, so the removal takes the toggle away with it.
  const C = await ctxOf('C');
  if (!C.seller.expressDelivery && C.seller.pickupLat != null)
    await storefront.update(C, { expressDelivery: true } as never);
  const G = await ctxOf('G');
  const wantBack = new Date(Date.now() + 45 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (
    !G.seller.vacationUntil ||
    new Date(G.seller.vacationUntil).getTime() < Date.now() + 5 * 86_400_000
  ) {
    await storefront.update(G, {
      vacationUntil: wantBack,
      handlingDays: 3,
    } as never);
  }
  // Store F is suspended after its listings and orders exist (so the suspension takes its listings off the shop); see seedProducts.

  // Team of store A: one member per role, plus an open invitation.
  const teamRepo = ds.getRepository(SellerTeamMember);
  const storeA = ctx.stores.get('A')!;
  const ownerA = ctx.users.get('seller.a')!;
  for (const t of DEMO_TEAM) {
    const member = ctx.users.get(t.key)!;
    const hash = UsersService.emailHash(member.email);
    if (
      !(await teamRepo.findOne({
        where: { sellerId: storeA.id, emailHash: hash },
      }))
    ) {
      await teamRepo.save(
        teamRepo.create({
          sellerId: storeA.id,
          userId: member.id,
          emailHash: hash,
          email: member.email,
          name: member.name,
          role: t.role,
          status: 'active',
          inviteTokenHash: null,
          inviteExpiresAt: null,
          invitedBy: ownerA.id,
          acceptedAt: new Date(Date.now() - 20 * 86_400_000),
        }),
      );
    }
  }
  const invitedEmail = demoEmail('team.invited');
  const invitedHash = UsersService.emailHash(invitedEmail);
  if (
    !(await teamRepo.findOne({
      where: { sellerId: storeA.id, emailHash: invitedHash },
    }))
  ) {
    await teamRepo.save(
      teamRepo.create({
        sellerId: storeA.id,
        userId: null,
        emailHash: invitedHash,
        email: invitedEmail,
        name: 'Invited (pending)',
        role: 'orders',
        status: 'invited',
        inviteTokenHash: UsersService.emailHash(
          `nobody-can-accept-${storeA.id}`,
        ),
        inviteExpiresAt: new Date(Date.now() + 5 * 86_400_000),
        invitedBy: ownerA.id,
      }),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────────
// Products
// ─────────────────────────────────────────────────────────────────────────────────

async function seedProducts(ctx: DemoCtx): Promise<void> {
  const products = ctx.app.get(ProductsService);
  const repo = ctx.ds.getRepository(Product);
  let created = 0;
  for (const p of DEMO_PRODUCTS) {
    const store = ctx.stores.get(p.store);
    if (!store || store.status === 'pending') continue;
    const urls = ctx.images.productUrls(p.sku, p.pictures);
    const existing = await repo.findOne({
      where: { sellerId: store.id, sku: p.sku },
    });
    if (existing) {
      // The address of the pictures depends on PUBLIC_API_URL: follow it if the server moved to a domain.
      if (JSON.stringify(existing.images ?? []) !== JSON.stringify(urls))
        await repo.update(
          { id: existing.id },
          { images: urls, image: urls[0] ?? null },
        );
      // A demo listing keeps the preparation time the demo gives it (an earlier demo run may have set another).
      if (existing.prepDays !== p.prepDays)
        await repo.update({ id: existing.id }, { prepDays: p.prepDays });
      ctx.products.set(p.sku, existing);
      continue;
    }
    const clean = cleanListing(
      {
        name: p.name,
        nameFr: p.machineFr ? undefined : p.nameFr,
        description: p.description,
        descriptionFr: p.machineFr ? undefined : p.descriptionFr,
        price: p.price,
        originalPrice: p.was ?? null,
        category: p.category,
        stock: p.stock,
        images: urls,
        sku: p.sku,
        brand: p.brand ?? null,
        weightGrams: p.weightGrams,
        prepDays: p.prepDays,
        variants: p.variants ?? undefined,
        variantStock: p.variantStock ?? undefined,
        sourceLang: 'en',
      },
      { partial: false, allowStatus: false },
    );
    const served = await products.create(clean, {
      sellerId: store.id,
      status: p.state,
      actorId: ctx.users.get(`seller.${p.store.toLowerCase()}`)?.id ?? null,
    });
    ctx.products.set(
      p.sku,
      (await repo.findOne({ where: { id: served.id } }))!,
    );
    created++;
  }
  log(
    `✓ products: ${created} created, ${DEMO_PRODUCTS.length - created} already there`,
  );
}

run().catch((err) => {
  console.error('Demo seed failed:', err.message ?? err);
  process.exit(1);
});
