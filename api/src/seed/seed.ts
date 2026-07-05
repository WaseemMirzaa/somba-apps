/* Standalone seeder: `npm run seed`. Populates a full admin + seller dataset. */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../app.module';
import {
  User,
  Seller,
  Category,
  Product,
  ProductImage,
  Order,
  OrderItem,
  Payout,
  Promotion,
  Dispute,
} from '../entities';
import {
  DisputeStatus,
  OrderStatus,
  PaymentMethod,
  PayoutStatus,
  ProductStatus,
  PromotionStatus,
  PromotionType,
  SellerBadge,
  SellerStatus,
  UserRole,
} from '../common/enums';
import { refCode, round2, slugify } from '../common/util';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const ds = app.get(DataSource);
  const pw = process.env.SEED_PASSWORD || 'password123';
  const hash = await bcrypt.hash(pw, 10);

  // Wipe (respecting FK order) so the seed is repeatable.
  await ds.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of [
    'order_items', 'orders', 'product_images', 'products', 'payouts',
    'promotions', 'disputes', 'categories', 'sellers', 'users', 'audit_logs', 'uploads',
  ]) {
    await ds.query(`TRUNCATE TABLE \`${t}\``).catch(() => undefined);
  }
  await ds.query('SET FOREIGN_KEY_CHECKS = 1');

  const users = ds.getRepository(User);
  const sellers = ds.getRepository(Seller);
  const cats = ds.getRepository(Category);
  const products = ds.getRepository(Product);
  const images = ds.getRepository(ProductImage);
  const orders = ds.getRepository(Order);
  const items = ds.getRepository(OrderItem);
  const payouts = ds.getRepository(Payout);
  const promos = ds.getRepository(Promotion);
  const disputes = ds.getRepository(Dispute);

  // ---- Admins ----
  const mkUser = (email: string, name: string, role: UserRole, phone?: string) =>
    users.create({ email, name, role, phone, passwordHash: hash });
  await users.save([
    mkUser('admin@somba.com', 'Super Admin', UserRole.ADMIN),
    mkUser('ops@somba.com', 'Ops Manager', UserRole.ADMIN_OPERATIONS),
    mkUser('finance@somba.com', 'Finance Manager', UserRole.ADMIN_FINANCE),
    mkUser('mod@somba.com', 'Moderator', UserRole.ADMIN_MODERATION),
  ]);

  // ---- Categories (commission 8–15%) ----
  const catData = [
    ['Electronics', 'Électronique', 12],
    ['Fashion', 'Mode', 15],
    ['Jewelery', 'Bijoux', 10],
    ['Home', 'Maison', 9],
    ['Beauty', 'Beauté', 14],
  ] as const;
  const categories = await cats.save(
    catData.map(([name, nameFr, rate]) =>
      cats.create({ name, nameFr, slug: slugify(name), commissionRate: rate, active: true }),
    ),
  );
  const catBy = (n: string) => categories.find((c) => c.name === n)!;

  // ---- Sellers ----
  const sellerDefs = [
    { email: 'gombe@somba.com', name: 'Marie Dubois', store: 'Gombe Fashion House', badge: SellerBadge.GOLD, city: 'Kinshasa', rating: 4.6, health: 92, balance: 1840 },
    { email: 'tech@somba.com', name: 'Jean Kabeya', store: 'Kinshasa Tech Hub', badge: SellerBadge.SILVER, city: 'Kinshasa', rating: 4.8, health: 88, balance: 3120 },
    { email: 'bijoux@somba.com', name: 'Sophie Laurent', store: 'Élégance Bijoux', badge: SellerBadge.SOMBA_ASSURED, city: 'Lubumbashi', rating: 4.4, health: 79, balance: 640 },
    { email: 'pending@somba.com', name: 'Paul Mbala', store: 'Nouveau Vendeur', badge: SellerBadge.BRONZE, city: 'Goma', rating: 0, health: 100, balance: 0, pending: true },
  ];
  const sellerRows: Seller[] = [];
  for (const s of sellerDefs) {
    const u = await users.save(mkUser(s.email, s.name, UserRole.SELLER, '+243 970 000 000'));
    const row = await sellers.save(
      sellers.create({
        user: u,
        storeName: s.store,
        slug: slugify(s.store),
        badge: s.badge,
        status: s.pending ? SellerStatus.PENDING : SellerStatus.ACTIVE,
        commissionRate: 12,
        rating: s.rating,
        healthScore: s.health,
        city: s.city,
        phone: '+243 970 000 000',
        balanceUsd: s.balance,
        description: `${s.store} — trusted Somba&Teka marketplace seller.`,
      }),
    );
    sellerRows.push(row);
  }
  const [gombe, tech, bijoux] = sellerRows;

  // ---- Products ----
  const prodDefs: Array<[Seller, Category, string, number, number, number, ProductStatus]> = [
    [gombe, catBy('Fashion'), 'Mens Cotton Jacket', 56, 70, 40, ProductStatus.LIVE],
    [gombe, catBy('Fashion'), 'Slim Fit T-Shirt', 22, 30, 120, ProductStatus.LIVE],
    [gombe, catBy('Fashion'), 'Fjällräven Foldsack No.1 Backpack', 110, 140, 24, ProductStatus.LIVE],
    [tech, catBy('Electronics'), 'Wireless Earbuds Pro', 89, 120, 60, ProductStatus.LIVE],
    [tech, catBy('Electronics'), 'Smart Watch Series 6', 199, 249, 18, ProductStatus.LIVE],
    [tech, catBy('Electronics'), 'USB-C Fast Charger 65W', 29, 39, 0, ProductStatus.PENDING],
    [bijoux, catBy('Jewelery'), 'Gold Plated Necklace', 45, 60, 30, ProductStatus.LIVE],
    [bijoux, catBy('Jewelery'), 'Silver Hoop Earrings', 25, 35, 50, ProductStatus.PENDING],
  ];
  const productRows: Product[] = [];
  for (const [seller, category, name, price, mrp, stock, status] of prodDefs) {
    const p = await products.save(
      products.create({
        seller,
        category,
        name,
        sku: refCode('SKU'),
        price,
        mrp,
        discountPrice: round2(price * 0.9),
        stock,
        status,
        rating: round2(3.8 + Math.random()),
        sold: Math.floor(Math.random() * 200),
      }),
    );
    await images.save(images.create({ product: p, url: `/uploads/products/sample-${slugify(name)}.png`, position: 0 }));
    productRows.push(p);
  }

  // ---- Orders (with per-item commission/net) ----
  const custNames = ['Alice Nkomo', 'David Ilunga', 'Grace Mubiala', 'Patrick Ndaya', 'Nadia Tshimanga'];
  const statuses = [OrderStatus.DELIVERED, OrderStatus.DELIVERED, OrderStatus.PROCESSING, OrderStatus.CONFIRMED, OrderStatus.SHIPPED];
  for (let i = 0; i < 12; i++) {
    const picks = [productRows[i % productRows.length], productRows[(i + 3) % productRows.length]].filter(
      (p) => p.status === ProductStatus.LIVE,
    );
    if (!picks.length) continue;
    const status = statuses[i % statuses.length];
    const orderItems: OrderItem[] = [];
    let subtotal = 0;
    for (const p of picks) {
      const qty = 1 + (i % 3);
      const unit = p.discountPrice ?? p.price;
      const lineTotal = round2(unit * qty);
      const rate = p.category?.commissionRate ?? 12;
      const commissionAmount = round2((lineTotal * rate) / 100);
      subtotal += lineTotal;
      orderItems.push(
        items.create({
          product: p,
          seller: p.seller,
          nameSnapshot: p.name,
          unitPrice: unit,
          qty,
          lineTotal,
          commissionRate: rate,
          commissionAmount,
          netToSeller: round2(lineTotal - commissionAmount),
          fulfillmentStatus: status,
        }),
      );
    }
    const deliveryFee = 3;
    await orders.save(
      orders.create({
        code: refCode('SMB'),
        customerName: custNames[i % custNames.length],
        customerEmail: `customer${i}@mail.com`,
        customerPhone: '+243 971 000 000',
        addressLine: `${10 + i} Avenue du Commerce`,
        city: 'Kinshasa',
        zone: ['Gombe', 'Limete', 'Ngaliema'][i % 3],
        paymentMethod: [PaymentMethod.STRIPE_CARD, PaymentMethod.COD, PaymentMethod.AIRTEL_MONEY][i % 3],
        status,
        subtotalUsd: round2(subtotal),
        deliveryFeeUsd: deliveryFee,
        totalUsd: round2(subtotal + deliveryFee),
        items: orderItems,
      }),
    );
  }

  // ---- Payouts ----
  await payouts.save([
    payouts.create({ reference: refCode('PO'), seller: tech, amountUsd: 800, status: PayoutStatus.REQUESTED, method: 'bank_transfer' }),
    payouts.create({ reference: refCode('PO'), seller: gombe, amountUsd: 500, status: PayoutStatus.PAID, method: 'airtel_money', processedBy: 'finance@somba.com', processedAt: new Date() }),
    payouts.create({ reference: refCode('PO'), seller: bijoux, amountUsd: 250, status: PayoutStatus.APPROVED, method: 'bank_transfer', processedBy: 'finance@somba.com' }),
  ]);

  // ---- Promotions ----
  const now = Date.now();
  const day = 86400000;
  await promos.save([
    promos.create({
      seller: null as unknown as Seller,
      title: 'Somba&Teka Flash Sale',
      type: PromotionType.FLASH_SALE,
      value: 20,
      status: PromotionStatus.ACTIVE,
      startsAt: new Date(now - day),
      endsAt: new Date(now + 2 * day),
    }),
    promos.create({
      seller: gombe,
      title: 'Gombe Weekend -15%',
      type: PromotionType.PERCENT,
      value: 15,
      status: PromotionStatus.SCHEDULED,
      productIds: [productRows[0].id, productRows[1].id],
      startsAt: new Date(now + 2 * day),
      endsAt: new Date(now + 5 * day),
    }),
  ]);

  // ---- Disputes ----
  const someOrder = await orders.findOne({ where: {}, order: { createdAt: 'DESC' } });
  await disputes.save([
    disputes.create({
      code: refCode('DSP'),
      order: someOrder ?? undefined,
      seller: gombe,
      customerName: 'Alice Nkomo',
      reason: 'Item not as described',
      detail: 'Colour differs from the listing photos.',
      status: DisputeStatus.OPEN,
      amountUsd: 56,
    }),
    disputes.create({
      code: refCode('DSP'),
      seller: tech,
      customerName: 'David Ilunga',
      reason: 'Damaged on arrival',
      status: DisputeStatus.IN_REVIEW,
      amountUsd: 89,
    }),
  ]);

  // eslint-disable-next-line no-console
  console.log('Seed complete.');
  console.log(`  Admin login : admin@somba.com / ${pw}`);
  console.log(`  Seller login: gombe@somba.com / ${pw}`);
  await app.close();
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
