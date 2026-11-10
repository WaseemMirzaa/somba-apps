/* eslint-disable no-console */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { AppModule } from '../../app.module';
import { Seller, User } from '../entities';
import { UsersService } from '../../users/users.service';
import { SellersService } from '../../ops/sellers.service';
import { ProductsService, cleanListing } from '../../products/products.service';
import { OrdersService } from '../../orders/orders.service';
import { WalletService } from '../../wallet/wallet.service';
import { GeoService } from '../../geo/geo.service';
import { PrivateFilesService } from '../../sellers/private-files.service';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * DEV TOOL, not part of the demo: makes a REAL-looking customer, store, product and paid order (none on the demo
 * domain), so a test can show that `seed-demo-remove` leaves real rows alone. Run it on a scratch database only:
 *   node dist/database/demo/dev-real-fixture.js
 */
async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const ds = app.get(DataSource);
  const users = ds.getRepository(User);
  const hash = await bcrypt.hash(randomBytes(18).toString('hex'), 10);
  const mk = (email: string, name: string, role: User['role']) =>
    users.save(
      users.create({
        email,
        emailHash: UsersService.emailHash(email),
        passwordHash: hash,
        name,
        role,
        emailVerified: true,
      }),
    );
  const customer = await mk(
    'real.customer@example.org',
    'Real Customer',
    'customer',
  );
  const owner = await mk('real.seller@example.org', 'Real Seller', 'seller');
  const geo = app.get(GeoService);
  const gombe = (await geo.getByCode('CD-KN-GOM'))!;
  const sellers = app.get(SellersService);
  const doc = await app
    .get(PrivateFilesService)
    .save(
      owner.id,
      readFileSync(
        join(
          __dirname,
          '..',
          '..',
          '..',
          '..',
          'deploy',
          'demo',
          'kyc',
          'sample-id-card.jpg',
        ),
      ),
      'http://localhost:3063',
    );
  await sellers.register({ id: owner.id, name: owner.name }, {
    name: 'Real Store',
    legalName: 'Real Store SARL',
    phone: '+243 811 111 111',
    idNumber: 'REAL-ID-1',
    documentUrls: [doc.url],
    acceptTerms: true,
  } as never);
  const seller = (await ds
    .getRepository(Seller)
    .findOne({ where: { userId: owner.id } }))!;
  await sellers.setStatus(seller.id, 'approved', 'real');
  await sellers.updateProfile(owner.id, {
    pickupAddress: '1 Real Street, Gombe',
    pickupLat: -4.3152,
    pickupLng: 15.3098,
    pickupAreaId: gombe.id,
  });
  const clean = cleanListing(
    {
      name: 'Real Product',
      description: 'A real listing',
      price: 10,
      category: 'Grocery',
      stock: 50,
      prepDays: 1,
      sku: 'REAL-1',
    },
    { partial: false, allowStatus: false },
  );
  const product = await app
    .get(ProductsService)
    .create(clean, { sellerId: seller.id, status: 'live' });
  await app.get(WalletService).apply(customer.id, 'credit', 100, 'Real top-up');
  const order = await app
    .get(OrdersService)
    .create({ id: customer.id, name: customer.name }, {
      items: [{ productId: product.id, qty: 2 }],
      paymentMethod: 'wallet',
      shippingAddress: JSON.stringify({
        line1: '5 Real Avenue',
        city: 'Kinshasa',
        commune: 'Gombe',
        areaId: gombe.id,
        geo: { lat: -4.3086, lng: 15.3171 },
      }),
    } as never);
  console.log(
    `real fixture: customer, store, product and order ${order.reference}`,
  );
  await app.close();
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
