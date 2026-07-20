/* eslint-disable no-console */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../app.module';
import {
  Category,
  CmsBlock,
  DeliveryTask,
  Notification,
  Order,
  OrderItem,
  Payment,
  Product,
  Promo,
  Review,
  Seller,
  Hub,
  Setting,
  User,
  WalletTransaction,
} from './entities';
import { UsersService } from '../users/users.service';
import { OrdersService } from '../orders/orders.service';
import type { UserRole } from './entities';
import { seedCategories, seedProducts } from './seed-catalog';

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

/** Map the storefront catalog (web/src/lib/mock-data) onto Product entities. */
const CATALOG: Partial<Product>[] = seedProducts.map((p) => ({
  name: p.name,
  nameFr: p.nameFr ?? null,
  price: p.price,
  originalPrice: p.originalPrice ?? null,
  discount: p.discount ?? 0,
  rating: p.rating ?? 0,
  reviewsCount: p.reviews ?? 0,
  image: p.image ?? null,
  category: p.category,
  categoryFr: p.categoryFr ?? null,
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
      productCount: CATALOG.length,
    }),
  );

  const productRepo = ds.getRepository(Product);
  const createdProducts: Product[] = [];
  for (const p of CATALOG) {
    createdProducts.push(
      await productRepo.save(
        productRepo.create({
          ...p,
          status: 'live',
          sellerId: seller.id,
          sellerName: seller.name,
        }),
      ),
    );
  }

  console.log('Seeding categories…');
  const catRepo = ds.getRepository(Category);
  for (const [i, c] of seedCategories.entries()) {
    await catRepo.save(
      catRepo.create({
        name: c.name,
        nameFr: c.nameFr ?? null,
        icon: c.icon ?? null,
        image: c.image ?? null,
        sortOrder: i,
      }),
    );
  }

  console.log('Seeding promos, CMS, settings…');
  const promoRepo = ds.getRepository(Promo);
  await promoRepo.save([
    promoRepo.create({ code: 'SOMBA10', type: 'percent', value: 10, minOrder: 50, description: '10% off orders over $50', active: true }),
    promoRepo.create({ code: 'SAVE20', type: 'fixed', value: 20, minOrder: 100, description: '$20 off orders over $100', active: true }),
  ]);
  const cmsRepo = ds.getRepository(CmsBlock);
  await cmsRepo.save([
    cmsRepo.create({ key: 'home-hero', title: 'Somba&Teka — shop everything', body: 'Fast delivery across Kinshasa & Paris.', type: 'banner', active: true }),
    cmsRepo.create({ key: 'promo-strip', title: 'Free delivery over $50', body: 'Use SOMBA10 for 10% off.', type: 'strip', active: true }),
  ]);
  const hubRepo = ds.getRepository(Hub);
  await hubRepo.save([
    hubRepo.create({ name: 'Kinshasa Hub', city: 'Kinshasa', country: 'DRC', capacity: 800 }),
    hubRepo.create({ name: 'Lubumbashi Hub', city: 'Lubumbashi', country: 'DRC', capacity: 400 }),
    hubRepo.create({ name: 'Paris Hub', city: 'Paris', country: 'France', capacity: 600 }),
  ]);
  const setRepo = ds.getRepository(Setting);
  await setRepo.save([
    setRepo.create({ key: 'fxRate', value: '2850' }),
    setRepo.create({ key: 'codCapUsd', value: '500' }),
    setRepo.create({ key: 'commissionPct', value: '12' }),
  ]);

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
          deliveryFeeUsd: 5,
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
