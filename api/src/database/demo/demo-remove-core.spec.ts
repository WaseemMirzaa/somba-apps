import { AuditLog, Conversation, ConversationMessage, Parcel, ParcelScan, Translation, WarehouseBatch } from '../entities';
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
  Payment,
  RefreshToken,
  Setting,
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
    ds.getRepository(User).save(
      ds.getRepository(User).create({
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
    const realSeller = await ds.getRepository(Seller).save(
      ds.getRepository(Seller).create({
        name: 'Real Store',
        userId: realOwner.id,
        status: 'approved',
      }),
    );
    const realProduct = await ds.getRepository(Product).save(
      ds.getRepository(Product).create({
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
      ds.getRepository(Order).save(
        ds.getRepository(Order).create({
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
    await ds.getRepository(Notification).save(
      ds.getRepository(Notification).create({
        role: 'admin',
        title: 'New order',
        body: 'real',
        entityId: realOrder.id,
      }),
    );
    await ds.getRepository(WalletTransaction).save(
      ds.getRepository(WalletTransaction).create({
        userId: realCustomer.id,
        type: 'topup',
        amount: 5,
        balance: 5,
        description: 'real',
      }),
    );

    const dCust = await user(
      'customer.full@demo.komoriko.test',
      'customer',
      'Demo Customer',
    );
    const dOwner = await user(
      'seller.a@demo.komoriko.test',
      'seller',
      'Demo Owner',
    );
    const dSeller = await ds.getRepository(Seller).save(
      ds.getRepository(Seller).create({
        name: 'Demo Store',
        userId: dOwner.id,
        status: 'approved',
      }),
    );
    const dProduct = await ds.getRepository(Product).save(
      ds.getRepository(Product).create({
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
    await ds.getRepository(Notification).save(
      ds.getRepository(Notification).create({
        role: 'admin',
        title: 'New order',
        body: 'demo',
        entityId: dOrder.id,
      }),
    );
    await ds.getRepository(Review).save(
      ds.getRepository(Review).create({
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

  it('removes the other-language rows of demo chat messages and reviews (keyed by message and review id), and keeps a real chat\'s', async () => {
    const w = await world();
    const dSeller = await ds.getRepository(Seller).findOneOrFail({ where: { name: 'Demo Store' } });
    const realSeller = await ds.getRepository(Seller).findOneOrFail({ where: { name: 'Real Store' } });
    const chat = async (buyer: { id: string; name: string }, sellerId: string, text: string) => {
      const conv = await ds.getRepository(Conversation).save(
        ds.getRepository(Conversation).create({ buyerId: buyer.id, buyerName: buyer.name, sellerId, contextKey: `k-${text}`, lastMessagePreview: text }),
      );
      return ds.getRepository(ConversationMessage).save(
        ds.getRepository(ConversationMessage).create({ conversationId: conv.id, senderId: buyer.id, senderSide: 'buyer', senderName: buyer.name, text }),
      );
    };
    const demoMsg = await chat(w.dCust, dSeller.id, 'Hello');
    const realMsg = await chat(w.realCustomer, realSeller.id, 'Hi');
    const rows = ds.getRepository(Translation);
    const author = (type: Translation['entityType'], id: string) =>
      rows.save(rows.create({ entityType: type, entityId: id, field: 'text', locale: 'fr', value: 'Bonjour', origin: 'author', sourceLang: 'en', sourceHash: 'h' }));
    await author('chat_message', demoMsg.id);
    await author('chat_message', realMsg.id);
    const res = await removeDemo(ds, { yes: true, uploadDir: dirs.up, privateDir: dirs.priv });
    expect(res.blockers).toEqual([]);
    expect((await rows.find()).map((r) => r.entityId)).toEqual([realMsg.id]);
  });

  it('refuses while a real order contains a demo product, and deletes nothing', async () => {
    const w = await world();
    const d = await ds
      .getRepository(User)
      .findOneOrFail({ where: { name: 'Real Buyer' } });
    const sellerA = await ds
      .getRepository(Seller)
      .findOneOrFail({ where: { name: 'Demo Store' } });
    await ds.getRepository(Order).save(
      ds.getRepository(Order).create({
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
    await ds.getRepository(DeliveryTask).save(
      ds.getRepository(DeliveryTask).create({
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

  describe('split orders', () => {
    /** A demo customer's two-seller order, delivered on two legs (each leg with its sellers), and its payment. */
    async function splitWorld() {
      const w = await world();
      const order = await ds.getRepository(Order).findOneOrFail({
        where: { id: w.dOrder.id },
      });
      const at = new Date();
      await ds
        .getRepository(OrderItem)
        .update({ orderId: order.id }, { deliveredAt: at });
      for (const [i, sellerIds] of [
        [1, ['s-a']],
        [2, ['s-b']],
      ] as const)
        await ds.getRepository(DeliveryTask).save(
          ds.getRepository(DeliveryTask).create({
            orderId: order.id,
            orderReference: order.reference,
            kind: 'delivery',
            status: 'delivered',
            sellerIds: [...sellerIds],
            deliveredAt: at,
          }),
        );
      await ds.getRepository(Payment).save(
        ds.getRepository(Payment).create({
          reference: 'PAY-SPLIT-1',
          orderId: order.id,
          orderReference: order.reference,
          userId: order.customerId,
          method: 'wallet',
          amountUsd: 7.5,
          status: 'succeeded',
        }),
      );
      // A sign-in of a demo account (a tester used the demo) leaves a session behind.
      await ds.getRepository(RefreshToken).save(
        ds.getRepository(RefreshToken).create({
          id: 'rt-demo-1',
          userId: w.dCust.id,
          familyId: 'f1',
          expiresAt: new Date(Date.now() + 86_400_000),
        } as never),
      );
      return w;
    }

    it('removes the parcel labels and their scans of the demo orders and returns, and keeps a real order\'s', async () => {
      const w = await splitWorld();
      const tasks = await ds.getRepository(DeliveryTask).find();
      const demoParcel = await ds.getRepository(Parcel).save(ds.getRepository(Parcel).create({ code: 'PKG-DEMOAAAA', orderId: w.dOrder.id, sellerId: 's-a', boxNo: 1, boxCount: 2 }));
      const demoReturn = await ds.getRepository(Parcel).save(ds.getRepository(Parcel).create({ code: 'PKG-DEMOBBBB', orderId: w.dOrder.id, sellerId: null, returnId: 'dispute-none', boxNo: 1, boxCount: 1 }));
      const realParcel = await ds.getRepository(Parcel).save(ds.getRepository(Parcel).create({ code: 'PKG-REALAAAA', orderId: 'real-order', sellerId: 's-z', boxNo: 1, boxCount: 1 }));
      for (const stage of ['pickup', 'dropoff'] as const)
        await ds.getRepository(ParcelScan).save(ds.getRepository(ParcelScan).create({ parcelId: demoParcel.id, taskId: tasks[0].id, stage, actorId: null, actorRole: 'rider', at: new Date(), manual: false }));
      await ds.getRepository(ParcelScan).save(ds.getRepository(ParcelScan).create({ parcelId: realParcel.id, taskId: 'real-task', stage: 'pickup', actorId: null, actorRole: 'rider', at: new Date(), manual: false }));
      const plan = await planRemoval(ds);
      expect(plan.counts.find(([t]) => t === 'parcels')?.[1]).toBe(2);
      expect(plan.counts.find(([t]) => t === 'parcel_scans')?.[1]).toBe(2);
      const res = await removeDemo(ds, { yes: true, uploadDir: dirs.up, privateDir: dirs.priv });
      expect(res.blockers).toEqual([]);
      expect((await ds.getRepository(Parcel).find()).map((p) => p.code)).toEqual(['PKG-REALAAAA']);
      expect(await ds.getRepository(ParcelScan).count()).toBe(1);
      expect(demoReturn.returnId).toBe('dispute-none');
    });

    it('removes the legs, the lines and the payment', async () => {
      await splitWorld();
      const plan = await planRemoval(ds);
      expect(plan.counts.find(([t]) => t === 'delivery_tasks')?.[1]).toBe(2);
      expect(plan.counts.find(([t]) => t === 'payments')?.[1]).toBe(1);
      const res = await removeDemo(ds, {
        yes: true,
        uploadDir: dirs.up,
        privateDir: dirs.priv,
      });
      expect(res.blockers).toEqual([]);
      expect(await ds.getRepository(DeliveryTask).count()).toBe(0);
      expect(await ds.getRepository(Payment).count()).toBe(0);
      expect(await ds.getRepository(RefreshToken).count()).toBe(0);
      expect(await ds.getRepository(Order).count()).toBe(1); // the real one
      // Nothing left to remove: a second run finds no demo data and prints no note.
      expect((await planRemoval(ds)).notes).toEqual([]);
    });
  });

  it('also removes an account still on the legacy demo domain (seeded before the rename to KOMORIKO)', async () => {
    await user('boss@company.com', 'admin', 'Boss');
    const old = await user(
      'customer.full@demo.sombateka.test',
      'customer',
      'Old Demo Customer',
    );
    await ds.getRepository(WalletTransaction).save(
      ds.getRepository(WalletTransaction).create({
        userId: old.id,
        type: 'topup',
        amount: 5,
        balance: 5,
        description: 'demo',
      }),
    );
    const plan = await planRemoval(ds);
    expect(plan.userIds).toEqual([old.id]);
    const res = await removeDemo(ds, {
      yes: true,
      uploadDir: dirs.up,
      privateDir: dirs.priv,
    });
    expect(res.blockers).toEqual([]);
    expect(await ds.getRepository(User).count()).toBe(1); // only the real admin is left
    expect(await ds.getRepository(WalletTransaction).count()).toBe(0);
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

  describe('real data that points at the demo', () => {
    it('refuses, and deletes nothing, when a real order has a delivery assigned to a demo rider', async () => {
      const w = await world();
      const rider = await user(
        'rider@demo.komoriko.test',
        'rider',
        'Demo Rider',
      );
      const task = await ds.getRepository(DeliveryTask).save(
        ds.getRepository(DeliveryTask).create({
          orderId: w.realOrder.id,
          orderReference: 'SOM-REAL',
          kind: 'delivery',
          status: 'assigned',
          riderId: rider.id,
        }),
      );
      const res = await removeDemo(ds, {
        yes: true,
        uploadDir: dirs.up,
        privateDir: dirs.priv,
      });
      expect(res.blockers.join(' ')).toMatch(/SOM-REAL/);
      expect(res.deleted).toEqual([]);
      expect(
        await ds.getRepository(DeliveryTask).count({ where: { id: task.id } }),
      ).toBe(1);
    });

    it('refuses when a batch of a demo rider holds a parcel of a real order', async () => {
      const w = await world();
      const rider = await user(
        'rider@demo.komoriko.test',
        'rider',
        'Demo Rider',
      );
      const realTask = await ds.getRepository(DeliveryTask).save(
        ds.getRepository(DeliveryTask).create({
          orderId: w.realOrder.id,
          orderReference: 'SOM-REAL',
          kind: 'delivery',
          status: 'unassigned',
        }),
      );
      await ds.getRepository(WarehouseBatch).save(
        ds.getRepository(WarehouseBatch).create({
          reference: 'B-1',
          riderId: rider.id,
          taskIds: JSON.stringify([realTask.id]),
        }),
      );
      const res = await removeDemo(ds, {
        yes: true,
        uploadDir: dirs.up,
        privateDir: dirs.priv,
      });
      expect(res.blockers.join(' ')).toMatch(/batch/);
      expect(await ds.getRepository(WarehouseBatch).count()).toBe(1);
    });

    it('removes a batch of a demo rider that holds only demo parcels', async () => {
      const w = await world();
      const rider = await user(
        'rider@demo.komoriko.test',
        'rider',
        'Demo Rider',
      );
      const demoTask = await ds.getRepository(DeliveryTask).save(
        ds.getRepository(DeliveryTask).create({
          orderId: w.dOrder.id,
          orderReference: 'SOM-DEMO',
          kind: 'delivery',
          status: 'unassigned',
        }),
      );
      await ds.getRepository(WarehouseBatch).save(
        ds.getRepository(WarehouseBatch).create({
          reference: 'B-2',
          riderId: rider.id,
          taskIds: JSON.stringify([demoTask.id]),
        }),
      );
      const res = await removeDemo(ds, {
        yes: true,
        uploadDir: dirs.up,
        privateDir: dirs.priv,
      });
      expect(res.blockers).toEqual([]);
      expect(await ds.getRepository(WarehouseBatch).count()).toBe(0);
    });

    it('refuses while a real staff member belongs to the demo warehouse, and while a real order is routed to it', async () => {
      const w = await world();
      const hub = await ds
        .getRepository(Hub)
        .findOneOrFail({ where: { name: DEMO_HUB_NAME } });
      await ds.getRepository(User).save(
        ds.getRepository(User).create({
          email: 'ops@company.com',
          emailHash: 'h-ops',
          passwordHash: 'x',
          name: 'Real Rider',
          role: 'rider',
          hubId: hub.id,
        }),
      );
      await ds
        .getRepository(Order)
        .update({ id: w.realOrder.id }, { destinationHubId: hub.id });
      const res = await removeDemo(ds, {
        yes: true,
        uploadDir: dirs.up,
        privateDir: dirs.priv,
      });
      expect(res.blockers.join(' ')).toMatch(/real staff member/);
      expect(res.blockers.join(' ')).toMatch(/routed to the demo warehouse/);
      expect(res.deleted).toEqual([]);
    });

    it('clears the origin warehouse of a real store that pointed at the demo warehouse', async () => {
      await world();
      const hub = await ds
        .getRepository(Hub)
        .findOneOrFail({ where: { name: DEMO_HUB_NAME } });
      await ds
        .getRepository(Seller)
        .update({ name: 'Real Store' }, { originHubId: hub.id });
      const res = await removeDemo(ds, {
        yes: true,
        uploadDir: dirs.up,
        privateDir: dirs.priv,
      });
      expect(res.sellersReset).toBe(1);
      expect(
        (
          await ds
            .getRepository(Seller)
            .findOneOrFail({ where: { name: 'Real Store' } })
        ).originHubId,
      ).toBeNull();
    });
  });

  describe('lines matched by name', () => {
    const audit = (actor: string) =>
      ds.getRepository(AuditLog).save(
        ds.getRepository(AuditLog).create({
          actor,
          role: 'admin',
          action: 'x',
          entity: 'e',
          entityId: null,
          detail: null,
        }),
      );

    it('removes audit lines written under a demo name', async () => {
      await world();
      await audit('Demo Customer');
      await removeDemo(ds, {
        yes: true,
        uploadDir: dirs.up,
        privateDir: dirs.priv,
      });
      expect(await ds.getRepository(AuditLog).count()).toBe(0);
    });

    it('keeps the audit lines of a real person who has the same name as a demo account', async () => {
      await world();
      await user('namesake@gmail.com', 'admin', 'Demo Customer');
      await audit('Demo Customer');
      await audit('Demo seed');
      await removeDemo(ds, {
        yes: true,
        uploadDir: dirs.up,
        privateDir: dirs.priv,
      });
      const left = await ds.getRepository(AuditLog).find();
      expect(left.map((l) => l.actor)).toEqual(['Demo Customer']);
    });
  });
});

/** Demo phone numbers cannot be told apart from real ones by the SMS provider: seeding must never send a message. */
describe('demo seed sends no message', () => {
  it('does not use the messaging or verification services', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readdirSync, readFileSync } = require('fs') as typeof import('fs');
    const dir = __dirname;
    const files = [
      ...readdirSync(dir)
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
        .map((f) => join(dir, f)),
      join(dir, '..', 'seed-demo.ts'),
      join(dir, '..', 'seed-demo-remove.ts'),
    ];
    for (const f of files)
      expect(readFileSync(f, 'utf8')).not.toMatch(
        /messaging\.service|VerificationService|sendSms|sendEmail|MessagingService/,
      );
  });
});
