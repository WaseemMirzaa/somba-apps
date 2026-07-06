/* Standalone seeder: `npm run seed`. Populates a full admin + seller + customer dataset. */
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
  Address,
  Review,
  Favorite,
  Coupon,
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

/** Bilingual spec sheet by category (replaces the app's hardcoded specsFor()). */
function specsFor(category: string) {
  switch (category) {
    case 'Electronics':
      return [
        { label: 'Warranty', labelFr: 'Garantie', value: '12 months', valueFr: '12 mois' },
        { label: 'Condition', labelFr: 'État', value: 'Brand new · sealed', valueFr: 'Neuf · scellé' },
        { label: 'In the box', labelFr: 'Dans la boîte', value: 'Device, cable, manual', valueFr: 'Appareil, câble, manuel' },
        { label: 'Ships from', labelFr: 'Expédié de', value: 'Kinshasa warehouse', valueFr: 'Entrepôt de Kinshasa' },
      ];
    case 'Fashion':
      return [
        { label: 'Material', labelFr: 'Matière', value: 'Premium cotton blend', valueFr: 'Coton mélangé premium' },
        { label: 'Care', labelFr: 'Entretien', value: 'Machine wash cold', valueFr: 'Lavage machine à froid' },
        { label: 'Fit', labelFr: 'Coupe', value: 'True to size', valueFr: 'Taille normale' },
        { label: 'Origin', labelFr: 'Origine', value: 'Ethically sourced', valueFr: 'Sourcé éthiquement' },
      ];
    default:
      return [
        { label: 'Material', labelFr: 'Matière', value: '18k gold / sterling silver', valueFr: 'Or 18 carats / argent sterling' },
        { label: 'Certificate', labelFr: 'Certificat', value: 'Authenticity included', valueFr: "Certificat d'authenticité inclus" },
        { label: 'Warranty', labelFr: 'Garantie', value: '24 months', valueFr: '24 mois' },
        { label: 'Packaging', labelFr: 'Emballage', value: 'Gift box included', valueFr: 'Coffret cadeau inclus' },
      ];
  }
}

const IMG = 'https://raw.githubusercontent.com/keikaavousi/fake-store-api/master/public/img';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const ds = app.get(DataSource);
  const pw = process.env.SEED_PASSWORD || 'password123';
  const hash = await bcrypt.hash(pw, 10);

  // Wipe (respecting FK order) so the seed is repeatable.
  await ds.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of [
    'reviews', 'favorites', 'addresses', 'coupons',
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
  const addresses = ds.getRepository(Address);
  const reviews = ds.getRepository(Review);
  const favorites = ds.getRepository(Favorite);
  const coupons = ds.getRepository(Coupon);

  // ---- Admins ----
  const mkUser = (email: string, name: string, role: UserRole, phone?: string) =>
    users.create({ email, name, role, phone, passwordHash: hash });
  await users.save([
    mkUser('admin@somba.com', 'Super Admin', UserRole.ADMIN),
    mkUser('ops@somba.com', 'Ops Manager', UserRole.ADMIN_OPERATIONS),
    mkUser('finance@somba.com', 'Finance Manager', UserRole.ADMIN_FINANCE),
    mkUser('mod@somba.com', 'Moderator', UserRole.ADMIN_MODERATION),
  ]);

  // ---- Customers (shoppers) ----
  const customerDefs = [
    { email: 'marie@mail.com', name: 'Marie Dubois' },
    { email: 'alice@mail.com', name: 'Alice Nkomo' },
    { email: 'david@mail.com', name: 'David Ilunga' },
  ];
  const customerRows: User[] = [];
  for (const c of customerDefs) {
    customerRows.push(await users.save(mkUser(c.email, c.name, UserRole.CUSTOMER, '+243 970 000 000')));
  }
  const [marie] = customerRows;

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

  // ---- Sellers (6 active stores mirroring the app directory) ----
  const sellerDefs = [
    { email: 'gombe@somba.com', name: 'Marie Dubois', store: 'Gombe Fashion House', badge: SellerBadge.GOLD, city: 'Kinshasa', rating: 4.6, health: 92, balance: 1840 },
    { email: 'tech@somba.com', name: 'Jean Kabeya', store: 'Kinshasa Tech Hub', badge: SellerBadge.SOMBA_ASSURED, city: 'Kinshasa', rating: 4.8, health: 97, balance: 3120 },
    { email: 'bijoux@somba.com', name: 'Sophie Laurent', store: 'Élégance Bijoux', badge: SellerBadge.SILVER, city: 'Lubumbashi', rating: 4.4, health: 88, balance: 640 },
    { email: 'kivu@somba.com', name: 'Emmanuel Kasongo', store: 'Kivu Electronics', badge: SellerBadge.GOLD, city: 'Goma', rating: 4.7, health: 95, balance: 2200 },
    { email: 'matonge@somba.com', name: 'Chantal Mputu', store: 'Matonge Style', badge: SellerBadge.BRONZE, city: 'Kinshasa', rating: 4.2, health: 84, balance: 410 },
    { email: 'congo-gadget@somba.com', name: 'Olivier Tshibangu', store: 'Congo Gadget Store', badge: SellerBadge.SILVER, city: 'Kinshasa', rating: 4.5, health: 90, balance: 980 },
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
  const [gombe, tech, bijoux, kivu, matonge, congoGadget] = sellerRows;

  // ---- Products (rich, bilingual, real photos) ----
  type PD = {
    seller: Seller; cat: string; name: string; nameFr: string;
    desc: string; descFr: string; price: number; mrp: number;
    img: string; stock: number; status: ProductStatus;
  };
  const prodDefs: PD[] = [
    { seller: gombe, cat: 'Fashion', name: 'Fjällräven Foldsack No.1 Backpack', nameFr: 'Sac à dos Fjällräven Foldsack N°1', desc: 'Durable everyday backpack with laptop sleeve, water-resistant fabric.', descFr: 'Sac à dos robuste au quotidien avec compartiment ordinateur, tissu déperlant.', price: 110, mrp: 140, img: `${IMG}/81fPKd-2AYL._AC_SL1500_.jpg`, stock: 24, status: ProductStatus.LIVE },
    { seller: gombe, cat: 'Fashion', name: 'Mens Casual Premium Slim Fit T-Shirt', nameFr: 'T-shirt slim premium homme', desc: 'Soft cotton blend, slim cut, breathable and comfortable all day.', descFr: 'Coton mélangé doux, coupe slim, respirant et confortable toute la journée.', price: 22, mrp: 30, img: `${IMG}/71-3HjGNDUL._AC_SY879._SX._UX._SY._UY_.jpg`, stock: 120, status: ProductStatus.LIVE },
    { seller: gombe, cat: 'Fashion', name: 'Mens Cotton Jacket', nameFr: 'Veste en coton homme', desc: 'Great outerwear for spring, autumn and winter. Suitable for many occasions.', descFr: "Excellent vêtement d'extérieur pour le printemps, l'automne et l'hiver.", price: 56, mrp: 70, img: `${IMG}/71li-ujtlUL._AC_UX679_.jpg`, stock: 40, status: ProductStatus.LIVE },
    { seller: matonge, cat: 'Fashion', name: 'Mens Casual Slim Fit Shirt', nameFr: 'Chemise slim casual homme', desc: 'Slim-fit casual shirt, easy to pair with jeans or chinos.', descFr: 'Chemise casual coupe slim, facile à assortir avec un jean ou un chino.', price: 16, mrp: 25, img: `${IMG}/71YXzeOuslL._AC_UY879_.jpg`, stock: 60, status: ProductStatus.LIVE },
    { seller: bijoux, cat: 'Jewelery', name: 'John Hardy Gold & Silver Dragon Bracelet', nameFr: 'Bracelet Dragon or & argent John Hardy', desc: 'Hand-crafted dragon station chain bracelet in gold and silver.', descFr: 'Bracelet chaîne dragon fait main en or et argent.', price: 695, mrp: 780, img: `${IMG}/71pWzhdJNwL._AC_UL640_QL65_ML3_.jpg`, stock: 8, status: ProductStatus.LIVE },
    { seller: bijoux, cat: 'Jewelery', name: 'Solid Gold Petite Micropavé Ring', nameFr: 'Bague micropavé en or', desc: 'Classic created-white-diamond ring in solid gold, elegant everyday piece.', descFr: 'Bague classique en or massif avec diamants, élégante au quotidien.', price: 168, mrp: 199, img: `${IMG}/61sbMiUnoGL._AC_UL640_QL65_ML3_.jpg`, stock: 15, status: ProductStatus.LIVE },
    { seller: bijoux, cat: 'Jewelery', name: 'White Gold Plated Princess Earrings', nameFr: "Boucles d'oreilles plaqué or blanc", desc: 'Classic princess-cut studs, rhodium plated for lasting shine.', descFr: 'Puces classiques taille princesse, plaqué rhodium pour un éclat durable.', price: 10, mrp: 15, img: `${IMG}/71YAIFU48IL._AC_UL640_QL65_ML3_.jpg`, stock: 200, status: ProductStatus.LIVE },
    { seller: bijoux, cat: 'Jewelery', name: 'Pierced Owl Rose Gold Earrings', nameFr: "Boucles d'oreilles hibou or rose", desc: 'Rose-gold-plated stainless steel owl earrings, hypoallergenic.', descFr: 'Boucles hibou en acier plaqué or rose, hypoallergéniques.', price: 11, mrp: 18, img: `${IMG}/51UDEzMJVpL._AC_UL640_QL65_ML3_.jpg`, stock: 100, status: ProductStatus.LIVE },
    { seller: kivu, cat: 'Electronics', name: 'WD 2TB Elements Portable Hard Drive', nameFr: 'Disque dur portable WD 2 To', desc: 'USB 3.0 portable storage, plug-and-play, high capacity backup.', descFr: 'Stockage portable USB 3.0, prêt à l\'emploi, grande capacité de sauvegarde.', price: 64, mrp: 79, img: `${IMG}/61IBBVJvSDL._AC_SY879_.jpg`, stock: 50, status: ProductStatus.LIVE },
    { seller: tech, cat: 'Electronics', name: 'SanDisk SSD PLUS 1TB Internal SSD', nameFr: 'SSD interne SanDisk PLUS 1 To', desc: 'Fast SATA III SSD, boosts boot and load times, easy upgrade.', descFr: 'SSD SATA III rapide, accélère le démarrage et les chargements.', price: 109, mrp: 139, img: `${IMG}/61U7T1koQqL._AC_SX679_.jpg`, stock: 35, status: ProductStatus.LIVE },
    { seller: tech, cat: 'Electronics', name: 'Silicon Power 256GB SSD 3D NAND', nameFr: 'SSD Silicon Power 256 Go', desc: '3D NAND flash SSD with SLC cache for great everyday performance.', descFr: 'SSD 3D NAND avec cache SLC pour de bonnes performances au quotidien.', price: 109, mrp: 129, img: `${IMG}/71kWymZ+c+L._AC_SX679_.jpg`, stock: 40, status: ProductStatus.LIVE },
    { seller: congoGadget, cat: 'Electronics', name: 'Acer 21.5" Full HD IPS Monitor', nameFr: 'Écran Acer 21,5" Full HD IPS', desc: '21.5" Full HD IPS display, ultra-thin, HDMI & VGA ports.', descFr: 'Écran IPS Full HD 21,5", ultra-fin, ports HDMI et VGA.', price: 599, mrp: 699, img: `${IMG}/81QpkIctqPL._AC_SX679_.jpg`, stock: 12, status: ProductStatus.LIVE },
    // A couple of not-yet-live products for the seller/admin moderation flow.
    { seller: tech, cat: 'Electronics', name: 'USB-C Fast Charger 65W', nameFr: 'Chargeur rapide USB-C 65W', desc: 'GaN 65W charger, charges laptops and phones fast.', descFr: 'Chargeur GaN 65W, recharge rapidement ordinateurs et téléphones.', price: 29, mrp: 39, img: `${IMG}/61U7T1koQqL._AC_SX679_.jpg`, stock: 0, status: ProductStatus.PENDING },
    { seller: bijoux, cat: 'Jewelery', name: 'Silver Hoop Earrings', nameFr: "Créoles en argent", desc: 'Sterling silver hoops, timeless everyday elegance.', descFr: 'Créoles en argent sterling, élégance intemporelle au quotidien.', price: 25, mrp: 35, img: `${IMG}/71YAIFU48IL._AC_UL640_QL65_ML3_.jpg`, stock: 50, status: ProductStatus.PENDING },
  ];

  const reviewNames = ['Aline K.', 'Patrick M.', 'Sarah L.', 'Jean B.', 'Grace M.', 'David I.'];
  const reviewTexts = [
    { en: 'Exactly as described, fast delivery. Very happy!', fr: 'Exactement comme décrit, livraison rapide. Très content !' },
    { en: 'Good quality for the price. Packaging could be better.', fr: 'Bonne qualité pour le prix. L\'emballage pourrait être mieux.' },
    { en: 'Second time ordering — always reliable.', fr: 'Deuxième commande — toujours fiable.' },
    { en: 'It works but arrived a day late.', fr: 'Ça fonctionne mais arrivé un jour en retard.' },
    { en: 'Excellent! Highly recommend this seller.', fr: 'Excellent ! Je recommande vivement ce vendeur.' },
  ];

  const productRows: Product[] = [];
  let pi = 0;
  for (const d of prodDefs) {
    // MRP is the strikethrough list price; every product is already below it.
    // Give ~1 in 3 products an extra promo price (discountPrice) below `price`.
    const discountPrice = pi % 3 === 0 ? round2(d.price * 0.9) : undefined;
    const p = await products.save(
      products.create({
        seller: d.seller,
        category: catBy(d.cat),
        name: d.name,
        nameFr: d.nameFr,
        description: d.desc,
        descriptionFr: d.descFr,
        sku: refCode('SKU'),
        price: d.price,
        mrp: d.mrp,
        discountPrice,
        stock: d.stock,
        status: d.status,
        rating: 0,
        reviewCount: 0,
        sold: 40 + ((pi * 37) % 160),
        specs: specsFor(d.cat),
      }),
    );
    await images.save(images.create({ product: p, url: d.img, position: 0 }));

    // 2–3 reviews per live product; compute rating from them.
    if (d.status === ProductStatus.LIVE) {
      const n = 2 + (pi % 2);
      let sum = 0;
      for (let r = 0; r < n; r++) {
        const stars = 3 + ((pi + r) % 3); // 3..5
        sum += stars;
        const t = reviewTexts[(pi + r) % reviewTexts.length];
        await reviews.save(
          reviews.create({
            product: p,
            authorName: reviewNames[(pi + r) % reviewNames.length],
            stars,
            text: t.en,
            photos: (pi + r) % 3,
          }),
        );
      }
      p.reviewCount = n;
      p.rating = round2(sum / n);
      await products.save(p);
    }
    productRows.push(p);
    pi++;
  }
  const liveProducts = productRows.filter((p) => p.status === ProductStatus.LIVE);

  // ---- Marie's saved addresses + wishlist ----
  await addresses.save([
    addresses.create({ user: marie, label: 'Home', name: 'Marie Dubois', phone: '+243 970 000 000', line: '12 Commerce Ave, Gombe', city: 'Kinshasa', zone: 'Gombe', isDefault: true, lat: -4.325, lng: 15.322 }),
    addresses.create({ user: marie, label: 'Work', name: 'Marie Dubois', phone: '+243 971 111 222', line: 'Tower B, Limete Industrial', city: 'Kinshasa', zone: 'Limete', isDefault: false, lat: -4.34, lng: 15.35 }),
  ]);
  await favorites.save([
    favorites.create({ user: marie, product: liveProducts[0] }),
    favorites.create({ user: marie, product: liveProducts[2] }),
    favorites.create({ user: marie, product: liveProducts[4] }),
  ]);

  // ---- Coupons (mirror the app promo codes) ----
  await coupons.save([
    coupons.create({ code: 'SOMBA10', description: '10% off orders over $50', descriptionFr: '10 % de réduction dès 50 $', minOrderUsd: 50, percentOff: 10, active: true }),
    coupons.create({ code: 'SAVE20', description: '$20 off orders over $100', descriptionFr: '20 $ de réduction dès 100 $', minOrderUsd: 100, amountOffUsd: 20, active: true }),
    coupons.create({ code: 'WELCOME5', description: '$5 off your first order', descriptionFr: '5 $ de réduction sur votre première commande', minOrderUsd: 0, amountOffUsd: 5, active: true }),
  ]);

  // ---- Orders (with per-item commission/net) ----
  const custNames = ['Alice Nkomo', 'David Ilunga', 'Grace Mubiala', 'Patrick Ndaya', 'Nadia Tshimanga'];
  const custEmails = ['marie@mail.com', 'alice@mail.com', 'david@mail.com'];
  const statuses = [OrderStatus.DELIVERED, OrderStatus.DELIVERED, OrderStatus.PROCESSING, OrderStatus.CONFIRMED, OrderStatus.SHIPPED];
  for (let i = 0; i < 12; i++) {
    const picks = [liveProducts[i % liveProducts.length], liveProducts[(i + 3) % liveProducts.length]];
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
        // First few orders belong to Marie so her app "My Orders" is populated.
        customerEmail: i < 4 ? 'marie@mail.com' : custEmails[i % custEmails.length],
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
      customerName: 'Marie Dubois',
      customerEmail: 'marie@mail.com',
      reason: 'Item not as described',
      detail: 'Colour differs from the listing photos.',
      status: DisputeStatus.OPEN,
      amountUsd: 56,
    }),
    disputes.create({
      code: refCode('DSP'),
      seller: tech,
      customerName: 'Marie Dubois',
      customerEmail: 'marie@mail.com',
      reason: 'Damaged on arrival',
      detail: 'The screen arrived cracked.',
      status: DisputeStatus.RESOLVED,
      resolution: 'Full refund issued.',
      amountUsd: 89,
    }),
    disputes.create({
      code: refCode('DSP'),
      seller: tech,
      customerName: 'David Ilunga',
      customerEmail: 'david@mail.com',
      reason: 'Wrong item shipped',
      status: DisputeStatus.IN_REVIEW,
      amountUsd: 64,
    }),
  ]);

  // eslint-disable-next-line no-console
  console.log('Seed complete.');
  console.log(`  Admin login   : admin@somba.com / ${pw}`);
  console.log(`  Seller login  : gombe@somba.com / ${pw}`);
  console.log(`  Customer login: marie@mail.com / ${pw}`);
  await app.close();
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
