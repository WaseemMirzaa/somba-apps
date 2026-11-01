/* eslint-disable no-console */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../app.module';
import {
  Address,
  Campaign,
  Category,
  CmsBlock,
  DeliveryTask,
  Exchange,
  Order,
  Product,
  Promo,
  Replacement,
  Review,
  Seller,
  Hub,
  Setting,
  Translation,
  User,
  WalletTransaction,
  WarehouseException,
} from './entities';
import type { TranslationEntityType } from './entities';
import { UsersService } from '../users/users.service';
import { OrdersService } from '../orders/orders.service';
import { LogisticsService } from '../logistics/logistics.service';
import { DeliveryService } from '../delivery/delivery.service';
import type { UserRole } from './entities';
import { seedCategories, seedProducts } from './seed-catalog';
import { DEFAULT_SELLER_PLANS } from '../content/plans';
import { GeoService } from '../geo/geo.service';
import { CoverageService } from '../geo/coverage.service';
import { sourceHash } from '../translation/translatable';
import { wipeSeededData } from './seed-wipe';

/** Every demo account shares one password so the prototype is easy to drive. */
const DEMO_PASSWORD = 'Somba@2026';

const DEMO_USERS: {
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
}[] = [
  { email: 'customer@somba.app', name: 'Marie Dubois', role: 'customer', phone: '+243 900 000 001' },
  { email: 'seller@somba.app', name: 'Kinshasa Traders', role: 'seller', phone: '+243 900 000 002' },
  { email: 'admin@somba.app', name: 'Admin Root', role: 'admin', phone: '+243 900 000 003' },
  { email: 'ops@somba.app', name: 'Ops Manager', role: 'admin_operations' },
  { email: 'finance@somba.app', name: 'Finance Manager', role: 'admin_finance' },
  { email: 'warehouse@somba.app', name: 'Hub Kinshasa', role: 'warehouse_staff' },
  { email: 'rider@somba.app', name: 'Jean Rider', role: 'rider', phone: '+243 900 000 009' },
  { email: 'seller2@somba.app', name: 'Limete Wholesale', role: 'seller', phone: '+243 900 000 004' },
  { email: 'warehouse.limete@somba.app', name: 'Hub Limete', role: 'warehouse_staff' },
  { email: 'operator@somba.app', name: 'Hub Kinshasa Operator', role: 'warehouse_staff' },
  { email: 'rider.limete@somba.app', name: 'Marc Rider (Limete)', role: 'rider', phone: '+243 900 000 010' },
];

/** Where the demo warehouses stand (WGS84). Each sits in a commune and covers areas (see the coverage block below). */
const HUB_POSITIONS = {
  kinshasa: { lat: -4.3105, lng: 15.3136 }, // Gombe
  limete: { lat: -4.354, lng: 15.347 },
};
/** Pickup pins of the demo sellers and the pinned demo addresses. */
const PINS = {
  sellerGombe: { lat: -4.3152, lng: 15.3098 },
  sellerLimete: { lat: -4.3561, lng: 15.3492 },
  customerGombe: { lat: -4.3086, lng: 15.3171 },
  customerMasina: { lat: -4.37, lng: 15.395 },
};

/**
 * Map the storefront catalog (web/src/lib/mock-data) onto Product entities. The French name is not a column: it is
 * written as a `translations` author row (a person typed it), and the category is linked by id once it exists.
 */
const CATALOG: (Partial<Product> & { nameFr: string | null; categoryName: string })[] = seedProducts.map((p) => ({
  name: p.name,
  nameFr: p.nameFr ?? null,
  price: p.price,
  originalPrice: p.originalPrice ?? null,
  discount: p.discount ?? 0,
  rating: p.rating ?? 0,
  reviewsCount: p.reviews ?? 0,
  image: p.image ?? null,
  categoryName: p.category,
  stock: p.stock ?? 0,
  deliveryDays: p.deliveryDays ?? 3,
}));

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const ds = app.get(DataSource);

  console.log('Clearing existing data…');
  // Foreign keys decide the order (see seed-wipe.ts); lanes, transfer runs and batches go with the hubs and tasks they refer to.
  await wipeSeededData(ds);

  // The DRC geography (26 provinces, 38 cities, Kinshasa's districts and communes) is reference data: added when missing, never wiped.
  const geo = app.get(GeoService);
  const seededAreas = await geo.ensureSeeded();
  if (seededAreas) console.log(`Seeded ${seededAreas} delivery areas…`);
  const area = async (code: string) => {
    const a = await geo.getByCode(code);
    if (!a) throw new Error(`Area ${code} is missing from the geography.`);
    return a;
  };
  const [gombeArea, limeteArea, masinaArea, kinshasaProvince, montAmbaDistrict, tshanguDistrict] = await Promise.all(
    ['CD-KN-GOM', 'CD-KN-LMT', 'CD-KN-MSN', 'CD-KN', 'CD-KN-D-MAM', 'CD-KN-D-TSH'].map(area),
  );

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const userRepo = ds.getRepository(User);
  console.log('Seeding users…');
  const sellerUser = await userRepo.save(
    userRepo.create({
      email: 'seller@somba.app',
      emailHash: UsersService.emailHash('seller@somba.app'),
      passwordHash,
      name: 'Kinshasa Traders',
      role: 'seller',
      phone: '+243 900 000 002',
    }),
  );
  for (const u of DEMO_USERS) {
    if (u.email === 'seller@somba.app') continue;
    const created = await userRepo.save(
      userRepo.create({
        email: u.email,
        emailHash: UsersService.emailHash(u.email),
        passwordHash,
        name: u.name,
        role: u.role,
        phone: u.phone ?? null,
        // Give the demo customer some store credit to exercise the wallet.
        walletBalance: u.role === 'customer' ? 250 : 0,
        // The demo customer's number is a verified sign-in number (phone-code login works on a fresh seed).
        phoneVerified: u.role === 'customer' && !!u.phone,
      }),
    );
    if (u.role === 'customer') {
      await ds.getRepository(WalletTransaction).save(
        ds.getRepository(WalletTransaction).create({
          userId: created.id,
          type: 'topup',
          amount: 250,
          balance: 250,
          description: 'Welcome store credit',
        }),
      );
    }
  }

  console.log('Seeding seller + products…');
  const sellerRepo = ds.getRepository(Seller);
  const seller = await sellerRepo.save(
    sellerRepo.create({
      name: 'Kinshasa Traders',
      userId: sellerUser.id,
      status: 'approved',
      badge: 'somba_assured',
      rating: 4.6,
      pickupAddress: '14 Avenue du Commerce, Gombe, Kinshasa',
      pickupLat: PINS.sellerGombe.lat,
      pickupLng: PINS.sellerGombe.lng,
      pickupAreaId: gombeArea.id,
    }),
  );
  const seller2User = await userRepo.findOne({ where: { emailHash: UsersService.emailHash('seller2@somba.app') } });
  const seller2 = await sellerRepo.save(
    sellerRepo.create({
      name: 'Limete Wholesale',
      userId: seller2User!.id,
      status: 'approved',
      badge: 'silver',
      rating: 4.2,
      pickupAddress: '8 Boulevard Lumumba, Limete, Kinshasa',
      pickupLat: PINS.sellerLimete.lat,
      pickupLng: PINS.sellerLimete.lng,
      pickupAreaId: limeteArea.id,
    }),
  );

  // A French text a person typed is an author row; the English text stays in the record's own column.
  const trRepo = ds.getRepository(Translation);
  const authorFr = async (entityType: TranslationEntityType, entityId: string, field: string, source: string, fr: string | null | undefined) => {
    if (!fr?.trim()) return;
    await trRepo.save(
      trRepo.create({ entityType, entityId, field, locale: 'fr', value: fr.trim(), origin: 'author', sourceLang: 'en', sourceHash: sourceHash('en', source) }),
    );
  };

  console.log('Seeding categories…');
  const catRepo = ds.getRepository(Category);
  const categoryIds = new Map<string, string>();
  for (const [i, c] of seedCategories.entries()) {
    const cat = await catRepo.save(
      catRepo.create({
        name: c.name,
        icon: c.icon ?? null,
        image: c.image ?? null,
        sortOrder: i,
      }),
    );
    categoryIds.set(c.name, cat.id);
    await authorFr('category', cat.id, 'name', cat.name, c.nameFr);
  }

  const productRepo = ds.getRepository(Product);
  const createdProducts: Product[] = [];
  for (const { nameFr, categoryName, ...p } of CATALOG) {
    const product = await productRepo.save(
      productRepo.create({
        ...p,
        categoryId: categoryIds.get(categoryName) ?? null,
        status: 'live',
        sellerId: seller.id,
      }),
    );
    createdProducts.push(product);
    // Every fifth listing belongs to the Limete wholesaler (so a basket can mix two sellers and two warehouses).
    if (createdProducts.length % 5 === 0) await productRepo.update({ id: product.id }, { sellerId: seller2.id });
    await authorFr('product', product.id, 'name', product.name, nameFr);
  }

  console.log('Seeding promos, CMS, settings…');
  const promoRepo = ds.getRepository(Promo);
  await promoRepo.save([
    promoRepo.create({ code: 'SOMBA10', type: 'percent', value: 10, minOrder: 50, description: '10% off orders over $50', active: true }),
    promoRepo.create({ code: 'SAVE20', type: 'fixed', value: 20, minOrder: 100, description: '$20 off orders over $100', active: true }),
  ]);
  const cmsRepo = ds.getRepository(CmsBlock);
  const blocks = await cmsRepo.save([
    cmsRepo.create({ key: 'home-hero', title: 'Somba&Teka — shop everything', body: 'Fast delivery across Kinshasa.', type: 'banner', active: true }),
    cmsRepo.create({ key: 'promo-strip', title: 'Free delivery over $50', body: 'Use SOMBA10 for 10% off.', type: 'strip', active: true }),
  ]);
  await authorFr('cms_block', blocks[0].id, 'title', blocks[0].title, 'Somba&Teka — achetez tout');
  await authorFr('cms_block', blocks[0].id, 'body', blocks[0].body, 'Livraison rapide à Kinshasa.');
  await authorFr('cms_block', blocks[1].id, 'title', blocks[1].title, 'Livraison gratuite dès 50\u00A0$');
  await authorFr('cms_block', blocks[1].id, 'body', blocks[1].body, 'Utilisez SOMBA10 pour 10 % de réduction.');
  const hubRepo = ds.getRepository(Hub);
  const [kinshasaHub, limeteHub] = await hubRepo.save([
    hubRepo.create({ name: 'Entrepôt Kinshasa', city: 'Kinshasa', country: 'DRC', capacity: 800, address: 'Avenue du Commerce, Gombe', areaId: gombeArea.id, ...HUB_POSITIONS.kinshasa }),
    hubRepo.create({ name: 'Entrepôt Limete', city: 'Kinshasa', country: 'DRC', capacity: 500, address: 'Boulevard Lumumba, Limete', areaId: limeteArea.id, ...HUB_POSITIONS.limete }),
  ]);
  // Coverage: Entrepôt Kinshasa covers the whole province; Entrepôt Limete covers two districts (the most specific wins).
  const coverage = app.get(CoverageService);
  await coverage.assign({ hubId: kinshasaHub.id, areaIds: [kinshasaProvince.id] });
  await coverage.assign({ hubId: limeteHub.id, areaIds: [montAmbaDistrict.id, tshanguDistrict.id] });
  // The demo sellers' origin warehouse is the one covering their pickup area (Gombe -> Kinshasa, Limete -> Limete).
  await coverage.recomputeSellerOrigins();
  const setRepo = ds.getRepository(Setting);
  await setRepo.save([
    setRepo.create({ key: 'fxRate', value: '2850' }),
    setRepo.create({ key: 'codCapUsd', value: '500' }),
    // Demo cash orders below need COD on; it is switched back to the client scope (off) right after.
    setRepo.create({ key: 'codEnabled', value: 'true' }),
    // Delivery fee = base + per km (destination warehouse -> customer pin), capped, + a transfer fee between warehouses.
    setRepo.create({ key: 'deliveryBaseUsd', value: '2' }),
    setRepo.create({ key: 'deliveryPerKmUsd', value: '0.5' }),
    setRepo.create({ key: 'deliveryMaxUsd', value: '15' }),
    setRepo.create({ key: 'deliveryTransferUsd', value: '1.5' }),
    // A parcel may travel between cities (e.g. Kinshasa -> Lubumbashi); the estimate grows by these days.
    setRepo.create({ key: 'allowInterCityDelivery', value: 'true' }),
    setRepo.create({ key: 'interCityTransferDays', value: '3' }),
    setRepo.create({ key: 'requirePinnedAddress', value: 'false' }),
    setRepo.create({ key: 'requireSellerPickupPin', value: 'false' }),
    setRepo.create({ key: 'commissionPct', value: '12' }),
    // Dev/demo data goes live without a moderator; production bootstrap turns moderation on.
    setRepo.create({ key: 'productModeration', value: 'false' }),
    setRepo.create({ key: 'requireDeliveryCode', value: 'false' }),
    // Dev/demo accounts are not verified, so the policy is off here; bootstrap-prod turns it on.
    setRepo.create({ key: 'requireVerifiedForCheckout', value: 'false' }),
    // After-sale: returns are accepted for 7 days after delivery; a seller has 48 hours to answer.
    setRepo.create({ key: 'returnWindowDays', value: '7' }),
    setRepo.create({ key: 'sellerResponseHours', value: '48' }),
    setRepo.create({ key: 'sellerPlans', value: JSON.stringify(DEFAULT_SELLER_PLANS) }),
    setRepo.create({ key: 'hubAddress', value: 'Somba&Teka hub, Gombe, Kinshasa' }),
  ]);
  // Every rider and staff member belongs to one warehouse; staff have a tier (operator < supervisor < manager).
  for (const [email, hubId, tier] of [
    ['rider@somba.app', kinshasaHub.id, null],
    ['warehouse@somba.app', kinshasaHub.id, 'manager'],
    ['operator@somba.app', kinshasaHub.id, 'operator'],
    ['rider.limete@somba.app', limeteHub.id, null],
    ['warehouse.limete@somba.app', limeteHub.id, 'supervisor'],
  ] as const) {
    await userRepo.update({ emailHash: UsersService.emailHash(email) }, { hubId, ...(tier ? { warehouseTier: tier } : {}) });
  }

  // A couple of seed reviews on the first product.
  const firstProduct = await productRepo.findOne({ where: {} });
  if (firstProduct) {
    const reviewRepo = ds.getRepository(Review);
    await reviewRepo.save([
      reviewRepo.create({ productId: firstProduct.id, userId: 'seed', author: 'Marie D.', rating: 5, text: 'Excellent product, fast delivery!' }),
      reviewRepo.create({ productId: firstProduct.id, userId: 'seed', author: 'Jean K.', rating: 4, text: 'Good value for money.' }),
    ]);
  }

  // ── Order pipeline ──────────────────────────────────────────────────────────
  // Seed a handful of real orders through OrdersService so the whole live
  // pipeline lights up: the customer sees orders, the seller sees incoming
  // sales, admin sees GMV, the warehouse sees parcels (delivery tasks), and the
  // rider gets deliveries + earnings. Statuses are then advanced to cover the
  // pending → processing → out-for-delivery → delivered lifecycle.
  console.log('Seeding orders + delivery pipeline…');
  const ordersSvc = app.get(OrdersService);
  const customer = await userRepo.findOne({
    where: { emailHash: UsersService.emailHash('customer@somba.app') },
  });
  const riderUser = await userRepo.findOne({
    where: { emailHash: UsersService.emailHash('rider@somba.app') },
  });
  const orderRepo = ds.getRepository(Order);
  const taskRepo = ds.getRepository(DeliveryTask);
  const pick = (i: number) => createdProducts[i % createdProducts.length];

  if (customer && createdProducts.length) {
    const specs: {
      items: { productId: string; qty: number }[];
      paymentMethod: 'cod' | 'stripe_card' | 'wallet';
      advanceTo?: 'processing' | 'out_for_delivery' | 'delivered';
    }[] = [
      { items: [{ productId: pick(0).id, qty: 1 }], paymentMethod: 'cod' },
      { items: [{ productId: pick(1).id, qty: 1 }, { productId: pick(2).id, qty: 2 }], paymentMethod: 'stripe_card', advanceTo: 'processing' },
      { items: [{ productId: pick(3).id, qty: 1 }], paymentMethod: 'cod', advanceTo: 'out_for_delivery' },
      { items: [{ productId: pick(4).id, qty: 1 }], paymentMethod: 'cod', advanceTo: 'delivered' },
      { items: [{ productId: pick(2).id, qty: 3 }], paymentMethod: 'cod', advanceTo: 'delivered' },
    ];

    // Saved, pinned addresses for the demo customer (the customer picks one at checkout).
    const addressRepo = ds.getRepository(Address);
    const home = await addressRepo.save(
      addressRepo.create({
        userId: customer.id,
        label: 'Home',
        line1: '12 Ave. du Commerce',
        city: 'Kinshasa',
        commune: 'Gombe',
        region: 'Kinshasa',
        country: 'République démocratique du Congo',
        areaId: gombeArea.id,
        phone: '+243 900 000 001',
        geo: { lat: PINS.customerGombe.lat, lng: PINS.customerGombe.lng, formatted: '12 Ave. du Commerce, Gombe, Kinshasa' },
        isDefault: true,
      }),
    );
    await addressRepo.save(
      addressRepo.create({
        userId: customer.id,
        label: 'Family (Masina)',
        line1: '7 Avenue de la Paix',
        city: 'Kinshasa',
        commune: 'Masina',
        region: 'Kinshasa',
        country: 'République démocratique du Congo',
        areaId: masinaArea.id,
        phone: '+243 900 000 001',
        geo: { lat: PINS.customerMasina.lat, lng: PINS.customerMasina.lng, formatted: '7 Avenue de la Paix, Masina, Kinshasa' },
      }),
    );
    const shippingAddress = JSON.stringify({
      line1: home.line1,
      city: 'Kinshasa',
      commune: 'Gombe',
      areaId: gombeArea.id,
      geo: { lat: PINS.customerGombe.lat, lng: PINS.customerGombe.lng },
    });

    const logistics = app.get(LogisticsService);
    const delivery = app.get(DeliveryService);
    const adminActor = { id: 'seed', role: 'admin', name: 'Seed', hubId: null, tier: null };
    /** The open tasks of an order, oldest first. */
    const openTasks = async (orderId: string) =>
      (await taskRepo.find({ where: { orderId }, order: { createdAt: 'ASC' } })).filter((t) => ['unassigned', 'assigned', 'picked_up', 'in_transit'].includes(t.status));
    /** Walk a task along its leg with the real services: assign a rider of its warehouse, then let them (or the staff) finish it. */
    const run = async (orderId: string, upTo: 'assigned' | 'delivered' | 'on_the_road') => {
      for (let guard = 0; guard < 8; guard++) {
        const [task] = await openTasks(orderId);
        if (!task) return;
        const rider = (await userRepo.find({ where: { role: 'rider', hubId: task.hubId ?? undefined } }))[0] ?? riderUser;
        if (!rider) return;
        if (task.status === 'unassigned') await logistics.assign(task.id, rider.id, adminActor);
        if (upTo === 'assigned') return;
        const fresh = (await taskRepo.findOne({ where: { id: task.id } }))!;
        if (['pickup', 'transfer', 'return_pickup', 'return_transfer'].includes(fresh.kind)) {
          await delivery.updateStatus(fresh.id, 'picked_up', rider.id);
          await delivery.updateStatus(fresh.id, 'in_transit', rider.id);
          await logistics.onScanIn(fresh.id, fresh.toHubId as string, adminActor);
          continue;
        }
        await delivery.updateStatus(fresh.id, 'picked_up', rider.id);
        await delivery.updateStatus(fresh.id, 'in_transit', rider.id);
        if (upTo === 'on_the_road') return;
        await delivery.updateStatus(fresh.id, 'delivered', rider.id);
      }
    };

    for (const spec of specs) {
      const order = await ordersSvc.create(
        { id: customer.id, name: customer.name },
        { items: spec.items, paymentMethod: spec.paymentMethod, shippingAddress },
      );
      if (spec.advanceTo === 'processing') await run(order.id, 'assigned');
      if (spec.advanceTo === 'out_for_delivery') await run(order.id, 'on_the_road');
      if (spec.advanceTo === 'delivered') await run(order.id, 'delivered');
    }
  }

  // Client scope: cash on delivery is disabled by default (admins can enable it in Settings).
  await setRepo.update({ key: 'codEnabled' }, { value: 'false' });

  // ── Marketing campaigns, replacements, exchanges, exceptions ────────────────
  console.log('Seeding campaigns / replacements / exchanges / exceptions…');
  const campaignRepo = ds.getRepository(Campaign);
  const campaigns = await campaignRepo.save([
    campaignRepo.create({
      reference: 'CMP-0001',
      sellerId: seller.id,
      name: 'Kinshasa Electronics Week',
      discount: 20,
      productCount: Math.min(4, CATALOG.length),
      budgetUsd: 500,
      startDate: '2026-07-15',
      endDate: '2026-07-30',
      status: 'active',
      views: 1240,
      clicks: 210,
      orders: 18,
      revenueUsd: 4210,
    }),
    campaignRepo.create({
      reference: 'CMP-0002',
      sellerId: seller.id,
      name: 'Weekend Flash',
      discount: 30,
      productCount: 2,
      budgetUsd: 200,
      startDate: '2026-08-01',
      endDate: '2026-08-03',
      status: 'pending',
    }),
  ]);

  await authorFr('campaign', campaigns[0].id, 'name', campaigns[0].name, 'Semaine électronique Kinshasa');
  await authorFr('campaign', campaigns[1].id, 'name', campaigns[1].name, 'Flash du week-end');

  const allOrders = await orderRepo.find({ order: { createdAt: 'DESC' } });
  const firstOrder = allOrders[0];
  const deliveredOrder = allOrders.find((o) => o.status === 'delivered');
  if (deliveredOrder) {
    const repRepo = ds.getRepository(Replacement);
    const item = deliveredOrder.items?.[0];
    await repRepo.save(
      repRepo.create({
        reference: 'REP-0001',
        orderId: deliveredOrder.id,
        orderReference: deliveredOrder.reference,
        customerId: deliveredOrder.customerId,
        customerName: deliveredOrder.customerName,
        sellerId: item?.sellerId ?? seller.id,
        sku: item ? `SKU-${item.productId.slice(0, 6)}` : 'SKU-000000',
        productName: item?.productName ?? 'Product',
        reason: 'Defective on arrival',
        condition: 'Damaged',
        status: 'approved',
        dispatchStatus: 'pending',
      }),
    );
    const exRepo = ds.getRepository(Exchange);
    await exRepo.save(
      exRepo.create({
        reference: 'EXC-0001',
        orderId: deliveredOrder.id,
        orderReference: deliveredOrder.reference,
        customerId: deliveredOrder.customerId,
        customerName: deliveredOrder.customerName,
        // The store that sold the line: it is who approves the exchange.
        sellerId: item?.sellerId ?? seller.id,
        fromSku: item ? `SKU-${item.productId.slice(0, 6)}` : 'SKU-000000',
        fromName: item?.productName ?? 'Product',
        toSku: 'SKU-VARIANT',
        toName: `${item?.productName ?? 'Product'} (alt variant)`,
        priceDiffUsd: 15,
        reason: 'Wrong size',
        status: 'requested',
      }),
    );
  }

  const excRepo = ds.getRepository(WarehouseException);
  const anyTask = await taskRepo.findOne({ where: {} });
  await excRepo.save([
    excRepo.create({
      reference: 'INC-0001',
      taskId: anyTask?.id ?? null,
      orderReference: firstOrder?.reference ?? null,
      type: 'missing_item',
      severity: 'high',
      status: 'open',
      hub: 'Entrepôt Kinshasa',
      hubId: kinshasaHub.id,
      notes: 'Parcel arrived with one item missing — awaiting seller response.',
      raisedBy: 'Hub Kinshasa',
    }),
    excRepo.create({
      reference: 'INC-0002',
      orderReference: firstOrder?.reference ?? null,
      type: 'damaged',
      severity: 'medium',
      status: 'investigating',
      hub: 'Entrepôt Kinshasa',
      hubId: kinshasaHub.id,
      notes: 'Outer box crushed in transit; inspecting contents.',
      raisedBy: 'Hub Kinshasa',
    }),
  ]);

  console.log('\n✅ Seed complete.');
  console.log(`   Users: ${DEMO_USERS.length}  ·  Products: ${CATALOG.length}`);
  console.log(`   Login with any email below / password: ${DEMO_PASSWORD}`);
  for (const u of DEMO_USERS) console.log(`     - ${u.role.padEnd(18)} ${u.email}`);

  await app.close();
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
