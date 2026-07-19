/* eslint-disable no-console */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../app.module';
import {
  Category,
  DeliveryTask,
  Notification,
  Order,
  OrderItem,
  Product,
  Seller,
  User,
  WalletTransaction,
} from './entities';
import { UsersService } from '../users/users.service';
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
  await wipe(Order);
  await wipe(Notification);
  await wipe(WalletTransaction);
  await wipe(Product);
  await wipe(Seller);
  await wipe(User);
  await wipe(Category);

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
  for (const p of CATALOG) {
    await productRepo.save(
      productRepo.create({
        ...p,
        status: 'live',
        sellerId: seller.id,
        sellerName: seller.name,
      }),
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
