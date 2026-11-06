import { mkdtempSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import {
  ENTITIES,
  Notification,
  Order,
  OrderItem,
  Product,
  Review,
  Seller,
  User,
  WalletTransaction,
  Hub,
  DeliveryTask,
  Category,
} from '../entities';
import { removeDemo, planRemoval } from './demo-remove-core';
import { DEMO_HUB_NAME } from './demo-common';

/** The removal finds the demo through the demo e-mail domain and deletes only what belongs to those users. */
describe('demo removal', () => {
  let ds: DataSource;
  const dirs = { up: '', priv: '' };

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: ENTITIES,
      synchronize: true,
    });
    await ds.initialize();
    dirs.up = mkdtempSync(join(tmpdir(), 'demo-up-'));
    dirs.priv = mkdtempSync(join(tmpdir(), 'demo-priv-'));
  });
  afterEach(async () => ds.destroy());

  const user = (email: string, role: User['role'], name: string) =>
    ds
      .getRepository(User)
      .save(
        ds
          .getRepository(User)
          .create({
            email,
            emailHash: `h-${email}`,
            passwordHash: 'x',
            name,
            role,
          }),
      );

  async function world() {
    const cat = await ds
      .getRepository(Category)
      .save(ds.getRepository(Category).create({ name: 'Grocery' }));
    const realAdmin = await user('boss@company.com', 'admin', 'Boss');
    const realCustomer = await user(
      'buyer@gmail.com',
      'customer',
      'Real Buyer',
    );
    const realOwner = await user('shop@gmail.com', 'seller', 'Real Owner');
    const realSeller = await ds
      .getRepository(Seller)
      .save(
        ds
          .getRepository(Seller)
          .create({
            name: 'Real Store',
            userId: realOwner.id,
            status: 'approved',
          }),
      );
    const realProduct = await ds
      .getRepository(Product)
      .save(
        ds
          .getRepository(Product)
          .create({
            name: 'Real thing',
            price: 5,
            categoryId: cat.id,
            sellerId: realSeller.id,
            rating: 5,
            reviewsCount: 1,
          }),
      );
    const mkOrder = async (
      customerId: string,
      ref: string,
      productId: string,
      sellerId: string,
    ) =>
      ds
        .getRepository(Order)
        .save(
          ds
            .getRepository(Order)
            .create({
              reference: ref,
              customerId,
              customerName: 'x',
              status: 'confirmed',
              paymentMethod: 'wallet',
              totalUsd: 5,
              items: [
                Object.assign(new OrderItem(), {
                  productId,
                  productName: 'p',
                  variant: 'Default',
                  qty: 1,
                  priceUsd: 5,
                  sellerId,
                  sellerName: 's',
                  fulfilment: 'open',
                }),
              ],
            }),
        );
    const realOrder = await mkOrder(
      realCustomer.id,
      'SOM-REAL',
      realProduct.id,
      realSeller.id,
    );
    await ds
      .getRepository(Notification)
      .save(
        ds
          .getRepository(Notification)
          .create({
            role: 'admin',
            title: 'New order',
            body: 'real',
            entityId: realOrder.id,
          }),
      );
    await ds
      .getRepository(WalletTransaction)
      .save(
        ds
          .getRepository(WalletTransaction)
          .create({
            userId: realCustomer.id,
            type: 'topup',
            amount: 5,
            balance: 5,
            description: 'real',
          }),
      );

    const dCust = await user(
      'customer.full@demo.sombateka.test',
      'customer',
      'Demo Customer',
    );
    const dOwner = await user(
      'seller.a@demo.sombateka.test',
      'seller',
      'Demo Owner',
    );
    const dSeller = await ds
      .getRepository(Seller)
      .save(
        ds
          .getRepository(Seller)
          .create({
            name: 'Demo Store',
            userId: dOwner.id,
            status: 'approved',
          }),
      );
    const dProduct = await ds
      .getRepository(Product)
      .save(
        ds
          .getRepository(Product)
          .create({
            name: 'Demo thing',
            price: 5,
            categoryId: cat.id,
            sellerId: dSeller.id,
          }),
      );
    const dOrder = await mkOrder(dCust.id, 'SOM-DEMO', dProduct.id, dSeller.id);
    const demoOnReal = await mkOrder(
      dCust.id,
      'SOM-DEMO2',
      realProduct.id,
      realSeller.id,
    );
    await ds
      .getRepository(Notification)
      .save(
        ds
          .getRepository(Notification)
          .create({
            role: 'admin',
            title: 'New order',
            body: 'demo',
            entityId: dOrder.id,
          }),
      );
    await ds
      .getRepository(Review)
      .save(
        ds
          .getRepository(Review)
          .create({
            productId: realProduct.id,
            userId: dCust.id,
            author: 'd',
            rating: 1,
            text: 'demo review on a real product',
          }),
      );
    await ds
      .getRepository(Hub)
      .save(
        ds.getRepository(Hub).create({ name: DEMO_HUB_NAME, city: 'Kinshasa' }),
      );
    writeFileSync(join(dirs.up, 'keep.jpg'), 'x');
    return {
      realProduct,
      realOrder,
      dOrder,
      demoOnReal,
      dProduct,
      realCustomer,
      dCust,
    };
  }

  it('lists the demo rows and deletes nothing without --yes', async () => {
    await world();
    const res = await removeDemo(ds, {
      yes: false,
      uploadDir: dirs.up,
      privateDir: dirs.priv,
    });
    expect(res.deleted).toEqual([]);
    expect(res.counts.find(([t]) => t === 'users')?.[1]).toBe(3 - 1); // two demo accounts (customer, owner)
    expect(await ds.getRepository(User).count()).toBe(5);
  });

  it('removes only the demo, keeps every real row, and recomputes a real product that had a demo review', async () => {
    const w = await world();
    const before = {
      realOrders: await ds
        .getRepository(Order)
        .count({ where: { customerId: w.realCustomer.id } }),
    };
    const res = await removeDemo(ds, {
      yes: true,
      uploadDir: dirs.up,
      privateDir: dirs.priv,
    });
    expect(res.blockers).toEqual([]);
    expect(await ds.getRepository(User).count()).toBe(3); // admin, real customer, real owner
    expect(
      await ds
        .getRepository(Order)
        .count({ where: { customerId: w.realCustomer.id } }),
    ).toBe(before.realOrders);
    expect(await ds.getRepository(Order).count()).toBe(1);
    expect(await ds.getRepository(Product).count()).toBe(1);
    expect(await ds.getRepository(Seller).count()).toBe(1);
    expect(await ds.getRepository(Hub).count()).toBe(0);
    expect(await ds.getRepository(Review).count()).toBe(0);
    expect(await ds.getRepository(WalletTransaction).count()).toBe(1);
    const notices = await ds.getRepository(Notification).find();
    expect(notices.map((n) => n.body)).toEqual(['real']);
    const p = await ds
      .getRepository(Product)
      .findOneOrFail({ where: { id: w.realProduct.id } });
    expect([p.rating, p.reviewsCount]).toEqual([0, 0]);
    expect(existsSync(join(dirs.up, 'keep.jpg'))).toBe(true); // not a demo file
  });

  it('refuses while a real order contains a demo product, and deletes nothing', async () => {
    const w = await world();
    const d = await ds
      .getRepository(User)
      .findOneOrFail({ where: { name: 'Real Buyer' } });
    const sellerA = await ds
      .getRepository(Seller)
      .findOneOrFail({ where: { name: 'Demo Store' } });
    await ds
      .getRepository(Order)
      .save(
        ds
          .getRepository(Order)
          .create({
            reference: 'SOM-REAL2',
            customerId: d.id,
            customerName: 'x',
            status: 'confirmed',
            paymentMethod: 'wallet',
            totalUsd: 5,
            items: [
              Object.assign(new OrderItem(), {
                productId: w.dProduct.id,
                productName: 'p',
                variant: 'Default',
                qty: 1,
                priceUsd: 5,
                sellerId: sellerA.id,
                sellerName: 's',
                fulfilment: 'open',
              }),
            ],
          }),
      );
    const res = await removeDemo(ds, {
      yes: true,
      uploadDir: dirs.up,
      privateDir: dirs.priv,
    });
    expect(res.blockers[0]).toMatch(/SOM-REAL2/);
    expect(res.deleted).toEqual([]);
    expect(await ds.getRepository(User).count()).toBe(5);
  });

  it('refuses while a real delivery uses the demo warehouse', async () => {
    await world();
    const hub = await ds
      .getRepository(Hub)
      .findOneOrFail({ where: { name: DEMO_HUB_NAME } });
    await ds
      .getRepository(DeliveryTask)
      .save(
        ds
          .getRepository(DeliveryTask)
          .create({
            orderId: 'real-order',
            orderReference: 'SOM-REAL',
            kind: 'delivery',
            status: 'unassigned',
            hubId: hub.id,
          }),
      );
    const plan = await planRemoval(ds);
    expect(plan.blockers.join(' ')).toMatch(/demo warehouse/);
  });

  it('says there is nothing to do on a database without demo data', async () => {
    await user('boss@company.com', 'admin', 'Boss');
    const res = await removeDemo(ds, {
      yes: true,
      uploadDir: dirs.up,
      privateDir: dirs.priv,
    });
    expect(res.counts).toEqual([]);
    expect(await ds.getRepository(User).count()).toBe(1);
  });
});
