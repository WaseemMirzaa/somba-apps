/* eslint-disable no-console */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../app.module';
import {
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

const CATALOG: Partial<Product>[] = [
  { name: 'Fjällräven Foldsack No.1 Backpack', nameFr: 'Sac à dos Fjällräven Foldsack N°1', price: 110, category: 'Fashion', rating: 3.9, stock: 40 },
  { name: 'Mens Casual Premium Slim Fit T-Shirt', nameFr: 'T-shirt slim premium homme', price: 22, category: 'Fashion', rating: 4.1, stock: 120 },
  { name: 'Mens Cotton Jacket', nameFr: 'Veste en coton homme', price: 56, category: 'Fashion', rating: 4.7, stock: 60 },
  { name: 'Mens Casual Slim Fit Shirt', nameFr: 'Chemise slim casual homme', price: 16, category: 'Fashion', rating: 4.0, stock: 90 },
  { name: 'John Hardy Gold & Silver Dragon Bracelet', nameFr: 'Bracelet Dragon or & argent', price: 695, category: 'Jewelery', rating: 4.6, stock: 8 },
  { name: 'Solid Gold Petite Micropavé Ring', nameFr: 'Bague micropavé en or', price: 168, category: 'Jewelery', rating: 3.9, stock: 25 },
  { name: 'White Gold Plated Princess Earrings', nameFr: "Boucles d'oreilles plaqué or blanc", price: 10, category: 'Jewelery', rating: 3.5, stock: 200 },
  { name: 'Pierced Owl Rose Gold Earrings', nameFr: "Boucles d'oreilles hibou or rose", price: 11, category: 'Jewelery', rating: 4.2, stock: 150 },
  { name: 'WD 2TB Elements Portable Hard Drive', nameFr: 'Disque dur portable WD 2 To', price: 64, category: 'Electronics', rating: 3.3, stock: 70 },
  { name: 'SanDisk SSD PLUS 1TB Internal SSD', nameFr: 'SSD interne SanDisk PLUS 1 To', price: 109, category: 'Electronics', rating: 4.5, stock: 55 },
  { name: 'Silicon Power 256GB SSD 3D NAND', nameFr: 'SSD Silicon Power 256 Go', price: 109, category: 'Electronics', rating: 4.8, stock: 65 },
  { name: 'Acer 21.5" Full HD IPS Monitor', nameFr: 'Écran Acer 21,5" Full HD IPS', price: 599, category: 'Electronics', rating: 4.3, stock: 30 },
];

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
    await userRepo.save(
      userRepo.create({
        email: u.email,
        emailHash: UsersService.emailHash(u.email),
        passwordHash,
        name: u.name,
        role: u.role,
        phone: u.phone ?? null,
      }),
    );
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
