/* eslint-disable no-console */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../app.module';
import {
  Campaign,
  Category,
  CmsBlock,
  DeliveryTask,
  Exchange,
  Notification,
  Order,
  OrderItem,
  Payment,
  Product,
  Promo,
  Replacement,
  Review,
  Seller,
  Hub,
  Setting,
  Translation,
  TranslationJob,
  User,
  WalletTransaction,
  WarehouseException,
} from './entities';
import type { TranslationEntityType } from './entities';
import { UsersService } from '../users/users.service';
import { OrdersService } from '../orders/orders.service';
import type { UserRole } from './entities';
import { seedCategories, seedProducts } from './seed-catalog';
import { DEFAULT_SELLER_PLANS } from '../content/plans';
import { sourceHash } from '../translation/translatable';

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
];

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
  // Order matters because of FKs. Query-builder delete avoids the
  // "empty criteria" guard that repo.delete({}) trips on.
  const wipe = (entity: Parameters<DataSource['getRepository']>[0]) =>
    ds.getRepository(entity).createQueryBuilder().delete().execute();
  await wipe(OrderItem);
  await wipe(DeliveryTask);
  await wipe(Payment);
  await wipe(Order);
  await wipe(Notification);
  await wipe(WalletTransaction);
  await wipe(Product);
  await wipe(Seller);
  await wipe(User);
  await wipe(Category);
  await wipe(Hub);
  await wipe(Promo);
  await wipe(CmsBlock);
  await wipe(Setting);
  await wipe(Review);
  await wipe(Translation);
  await wipe(TranslationJob);
  await wipe(Campaign);
  await wipe(Replacement);
  await wipe(Exchange);
  await wipe(WarehouseException);

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
    cmsRepo.create({ key: 'home-hero', title: 'Somba&Teka — shop everything', body: 'Fast delivery across Kinshasa & Paris.', type: 'banner', active: true }),
    cmsRepo.create({ key: 'promo-strip', title: 'Free delivery over $50', body: 'Use SOMBA10 for 10% off.', type: 'strip', active: true }),
  ]);
  await authorFr('cms_block', blocks[0].id, 'title', blocks[0].title, 'Somba&Teka — achetez tout');
  await authorFr('cms_block', blocks[0].id, 'body', blocks[0].body, 'Livraison rapide à Kinshasa et à Paris.');
  await authorFr('cms_block', blocks[1].id, 'title', blocks[1].title, 'Livraison gratuite dès 50\u00A0$');
  await authorFr('cms_block', blocks[1].id, 'body', blocks[1].body, 'Utilisez SOMBA10 pour 10 % de réduction.');
  const hubRepo = ds.getRepository(Hub);
  const [kinshasaHub, , parisHub] = await hubRepo.save([
    hubRepo.create({ name: 'Kinshasa Hub', city: 'Kinshasa', country: 'DRC', capacity: 800 }),
    hubRepo.create({ name: 'Lubumbashi Hub', city: 'Lubumbashi', country: 'DRC', capacity: 400 }),
    hubRepo.create({ name: 'Paris Hub', city: 'Paris', country: 'France', capacity: 600 }),
  ]);
  const setRepo = ds.getRepository(Setting);
  await setRepo.save([
    setRepo.create({ key: 'fxRate', value: '2850' }),
    setRepo.create({ key: 'codCapUsd', value: '500' }),
    // Demo cash orders below need COD on; it is switched back to the client scope (off) right after.
    setRepo.create({ key: 'codEnabled', value: 'true' }),
    // Each zone (commune) is delivered by one warehouse.
    setRepo.create({ key: 'deliveryZones', value: JSON.stringify([{ id: 'gombe', name: 'Gombe', nameFr: 'Gombe', city: 'Kinshasa', feeUsd: 3, hubId: kinshasaHub.id }, { id: 'limete', name: 'Limete', nameFr: 'Limete', city: 'Kinshasa', feeUsd: 5, hubId: kinshasaHub.id }, { id: 'zone-a', name: 'Zone A — Centre', nameFr: 'Zone A — Centre', city: 'Paris', feeUsd: 0, hubId: parisHub.id }, { id: 'zone-b', name: 'Zone B — Nord', nameFr: 'Zone B — Nord', city: 'Paris', feeUsd: 5, hubId: parisHub.id }]) }),
    setRepo.create({ key: 'commissionPct', value: '12' }),
    // Dev/demo data goes live without a moderator; production bootstrap turns moderation on.
    setRepo.create({ key: 'productModeration', value: 'false' }),
    setRepo.create({ key: 'requireDeliveryCode', value: 'false' }),
    // Dev/demo accounts are not verified, so the policy is off here; bootstrap-prod turns it on.
    setRepo.create({ key: 'requireVerifiedForCheckout', value: 'false' }),
    setRepo.create({ key: 'sellerPlans', value: JSON.stringify(DEFAULT_SELLER_PLANS) }),
    setRepo.create({ key: 'hubAddress', value: 'Somba&Teka hub, Gombe, Kinshasa' }),
  ]);
  // The demo rider and warehouse staff work at the Kinshasa warehouse; the rider prefers Gombe.
  for (const [email, extra] of [
    ['rider@somba.app', { preferredZones: JSON.stringify(['gombe']) }],
    ['warehouse@somba.app', {}],
  ] as const) {
    await userRepo.update({ emailHash: UsersService.emailHash(email) }, { hubId: kinshasaHub.id, ...extra });
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

    for (const spec of specs) {
      const order = await ordersSvc.create(
        { id: customer.id, name: customer.name },
        {
          items: spec.items,
          paymentMethod: spec.paymentMethod,
          deliveryFeeUsd: 3,
          zoneId: 'gombe',
          shippingAddress: JSON.stringify({ line1: '12 Ave. du Commerce', city: 'Kinshasa', commune: 'Gombe' }),
        },
      );
      if (spec.advanceTo) {
        order.status = spec.advanceTo;
        await orderRepo.save(order);
        // Assign + advance the delivery task so warehouse/rider surfaces fill.
        const task = await taskRepo.findOne({ where: { orderId: order.id } });
        if (task) {
          if (spec.advanceTo === 'processing') {
            task.status = 'assigned';
            task.riderId = riderUser?.id ?? null;
          } else if (spec.advanceTo === 'out_for_delivery') {
            task.status = 'in_transit';
            task.riderId = riderUser?.id ?? null;
          } else if (spec.advanceTo === 'delivered') {
            task.status = 'delivered';
            task.riderId = riderUser?.id ?? null;
          }
          await taskRepo.save(task);
        }
      }
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
        sellerId: seller.id,
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
      hub: 'Kinshasa Hub',
      notes: 'Parcel arrived with one item missing — awaiting seller response.',
      raisedBy: 'Hub Kinshasa',
    }),
    excRepo.create({
      reference: 'INC-0002',
      orderReference: firstOrder?.reference ?? null,
      type: 'damaged',
      severity: 'medium',
      status: 'investigating',
      hub: 'Kinshasa Hub',
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
