import { Address, Campaign, Dispute, Exchange, FlashSale, Order, OrderItem, Promo, Replacement, Review, User } from '../entities';
import type { Seller } from '../entities';
import { OrdersService } from '../../orders/orders.service';
import { WalletService } from '../../wallet/wallet.service';
import { PromosService } from '../../content/promos.service';
import { CouponsService } from '../../content/coupons.service';
import { CampaignsService } from '../../flows/campaigns.service';
import { ReviewsService } from '../../content/reviews.service';
import { DisputesService } from '../../disputes/disputes.service';
import { ExchangesService } from '../../flows/exchanges.service';
import { ReplacementsService } from '../../flows/replacements.service';
import { PayoutsService } from '../../payouts/payouts.service';
import { PINS } from './demo-catalog';
import { log } from './demo-common';
import type { DemoCtx } from './demo-ctx';
import { Driver, backdateOrder, placeCases } from './demo-flow';
import type { Stage } from './demo-flow';

const H = 3_600_000;
const D = 86_400_000;

/** Delivery addresses of the demo customers: real communes and pins, made-up streets. */
export const ADDRESSES = {
  gombe: { label: 'Home', line1: '12 Avenue du Commerce', commune: 'Gombe', code: 'CD-KN-GOM', ...PINS.gombeCustomer },
  gombe2: { label: 'Office', line1: '5 Avenue des Aviateurs', commune: 'Gombe', code: 'CD-KN-GOM', lat: -4.3109, lng: 15.3142 },
  masina: { label: 'Family (Masina)', line1: '7 Avenue de la Paix', commune: 'Masina', code: 'CD-KN-MSN', ...PINS.masinaCustomer },
  maluku: { label: 'Family (Maluku)', line1: '3 Route de Maluku, quartier Centre', commune: 'Maluku', code: 'CD-KN-MLK', ...PINS.malukuCustomer },
  ngaliema: { label: 'Home', line1: '21 Avenue de la Libération', commune: 'Ngaliema', code: 'CD-KN-NGL', ...PINS.ngaliemaCustomer },
  limete: { label: 'Home', line1: '9 Avenue Kasa-Vubu', commune: 'Limete', code: 'CD-KN-LMT', lat: -4.3532, lng: 15.3441 },
  kalamu: { label: 'Home', line1: '31 Avenue Kalemie', commune: 'Kalamu', code: 'CD-KN-KLM', lat: -4.3489, lng: 15.3205 },
  bandalungwa: { label: 'Home', line1: '14 Avenue Kasa-Vubu', commune: 'Bandalungwa', code: 'CD-KN-BDL', lat: -4.3417, lng: 15.2849 },
  kintambo: { label: 'Home', line1: '6 Avenue de l’Université', commune: 'Kintambo', code: 'CD-KN-KTB', lat: -4.3419, lng: 15.2701 },
} as const;
type AddrKey = keyof typeof ADDRESSES;

/** Which addresses each customer has in their address book (the first one is the default). */
const BOOK: Record<string, AddrKey[]> = {
  'customer.full': ['gombe', 'maluku'],
  'customer.fr': ['ngaliema'],
  'customer.fraud': ['gombe2'],
  'reviewer.1': ['limete'],
  'reviewer.2': ['kalamu'],
  'reviewer.3': ['bandalungwa'],
  'reviewer.4': ['kintambo'],
};

/** Wallet money each customer starts with (two top-ups, dated well before the first order). */
const WALLET: Record<string, number> = { 'customer.full': 1400, 'customer.fr': 400, 'customer.fraud': 400, 'reviewer.1': 300, 'reviewer.2': 400, 'reviewer.3': 300, 'reviewer.4': 250 };

interface Line {
  sku: string;
  qty?: number;
  variant?: string;
}
export interface OrderSpec {
  key: string;
  customer: string;
  lines: Line[];
  address: AddrKey;
  promo?: string;
  stage: Stage | 'cancelled';
  placedAgoH: number;
  /** Hours ago the parcel reached the customer (delivered orders). */
  deliveredAgoH?: number;
  /** Hours ago the after-sale case (return, dispute, exchange, replacement) was opened. */
  caseAgoH?: number;
  /** Extra steps (returns, reviews...) run after the order is in its state; each one checks what exists first. */
  after?: (c: Scenario) => Promise<void>;
}

/** What a scenario step gets to work with. */
export interface Scenario {
  ctx: DemoCtx;
  order: Order;
  spec: OrderSpec;
  driver: Driver;
  user: User;
  line: (sku: string) => OrderItem;
}

const shipping = (key: AddrKey, areaId: string) => {
  const a = ADDRESSES[key];
  return JSON.stringify({ label: a.label, line1: a.line1, city: 'Kinshasa', commune: a.commune, region: 'Kinshasa', areaId, geo: { lat: a.lat, lng: a.lng, formatted: `${a.line1}, ${a.commune}, Kinshasa` } });
};

const signature = (items: { productId: string; variant: string; qty: number }[]) => items.map((i) => `${i.productId}|${i.variant}|${i.qty}`).sort().join(';');

export async function seedCommerce(ctx: DemoCtx): Promise<void> {
  const { ds, app } = ctx;
  const wallet = app.get(WalletService);
  const orders = app.get(OrdersService);

  // ── address books ───────────────────────────────────────────────────────────
  const addrRepo = ds.getRepository(Address);
  const areaIds = new Map<string, string>();
  for (const ak of Object.keys(ADDRESSES) as AddrKey[]) areaIds.set(ak, (await ctx.area(ADDRESSES[ak].code)).id);
  for (const [key, list] of Object.entries(BOOK)) {
    const user = ctx.users.get(key)!;
    const existing = await addrRepo.find({ where: { userId: user.id } });
    for (const [i, ak] of list.entries()) {
      const a = ADDRESSES[ak];
      if (existing.some((e) => e.line1 === a.line1)) continue;
      await addrRepo.save(
        addrRepo.create({
          userId: user.id,
          label: a.label,
          line1: a.line1,
          city: 'Kinshasa',
          commune: a.commune,
          region: 'Kinshasa',
          country: 'République démocratique du Congo',
          areaId: areaIds.get(ak)!,
          phone: user.phone,
          geo: { lat: a.lat, lng: a.lng, formatted: `${a.line1}, ${a.commune}, Kinshasa` },
          isDefault: i === 0,
        }),
      );
    }
  }

  // ── wallets: two top-ups per customer, dated long before the first order ────────
  for (const [key, amount] of Object.entries(WALLET)) {
    const user = ctx.users.get(key)!;
    const has = await ds.query('SELECT COUNT(*) AS n FROM wallet_transactions WHERE userId = ?', [user.id]);
    if (Number(has[0].n) > 0) continue;
    const t1 = await wallet.topUp(user.id, Math.round(amount * 0.7), 'airtel_money');
    const t2 = await wallet.apply(user.id, 'cashback', Math.round(amount * 0.3), 'Welcome credit from Somba&Teka (demo)');
    await ds.query('UPDATE wallet_transactions SET createdAt = ? WHERE id = ?', [new Date(Date.now() - 80 * D), t1.id]);
    await ds.query('UPDATE wallet_transactions SET createdAt = ? WHERE id = ?', [new Date(Date.now() - 79 * D), t2.id]);
  }

  // ── promos, coupons, a campaign and a flash sale (before the orders that use them) ──
  await seedMarketing(ctx);

  // ── orders, oldest first so the wallet history reads in order ──────────────────
  const driver = new Driver(ctx);
  const specs = [...orderSpecs()].sort((a, b) => b.placedAgoH - a.placedAgoH);
  let made = 0;
  for (const spec of specs) {
    const user = ctx.users.get(spec.customer)!;
    const lines = spec.lines.map((l) => {
      const p = ctx.products.get(l.sku);
      if (!p) throw new Error(`Order ${spec.key}: product ${l.sku} is not in the catalogue.`);
      return { productId: p.id, variant: l.variant ?? 'Default', qty: l.qty ?? 1 };
    });
    const sig = signature(lines);
    const mine = await ds.getRepository(Order).find({ where: { customerId: user.id } });
    let order = mine.find((o) => signature(o.items ?? []) === sig) ?? null;
    const isNew = !order;
    if (!order) {
      order = await orders.create(
        { id: user.id, name: user.name },
        {
          items: lines.map((l) => ({ productId: l.productId, qty: l.qty, ...(l.variant !== 'Default' ? { variant: l.variant } : {}) })),
          paymentMethod: 'wallet',
          shippingAddress: shipping(spec.address, areaIds.get(spec.address)!),
          ...(spec.promo ? { promoCode: spec.promo } : {}),
        } as never,
      );
      made++;
    }
    if (isNew) {
      if (spec.stage === 'cancelled') await orders.cancel({ id: user.id, role: 'customer' }, order.id);
      else await driver.drive(order.id, spec.stage);
      order = (await ds.getRepository(Order).findOne({ where: { id: order.id } }))!;
    }
    const current = order;
    const scenario: Scenario = {
      ctx,
      order: current,
      spec,
      driver,
      user,
      line: (sku: string) => {
        const pid = ctx.products.get(sku)!.id;
        return current.items.find((i) => i.productId === pid)!;
      },
    };
    if (spec.after) await spec.after(scenario);
    if (isNew) {
      // Dated at the end: the after-sale steps above happen "a bit later", so they are shifted with the order.
      await backdateOrder(ds, current.id, { placedAgoMs: spec.placedAgoH * H, deliveredAgoMs: spec.deliveredAgoH !== undefined ? spec.deliveredAgoH * H : undefined });
      if (spec.caseAgoH !== undefined) await placeCases(ds, current.id, spec.caseAgoH * H);
    }
  }
  log(`✓ orders: ${made} created, ${specs.length - made} already there`);
  await payoutsAndFinance(ctx);
}

// ─────────────────────────────────────────────────────────────────────────────────
// Marketing: platform promo, store coupon, campaign, flash sale
// ─────────────────────────────────────────────────────────────────────────────────
async function seedMarketing(ctx: DemoCtx): Promise<void> {
  const { ds, app } = ctx;
  const promos = app.get(PromosService);
  const coupons = app.get(CouponsService);
  const campaigns = app.get(CampaignsService);
  const promoRepo = ds.getRepository(Promo);
  const ownerA = ctx.users.get('seller.a')!;
  const storeA = ctx.stores.get('A')!;

  if (!(await promoRepo.findOne({ where: { code: 'DEMO10' } }))) {
    await promos.create({ code: 'DEMO10', type: 'percent', value: 10, minOrder: 20, description: 'Demo: 10% off orders over $20' });
  }
  if (!(await promoRepo.findOne({ where: { code: 'MAISON5' } }))) {
    await coupons.create(ownerA.id, { code: 'MAISON5', type: 'fixed', value: 5, minOrder: 30, description: 'Maison Kinshasa: $5 off orders over $30', perUserLimit: 3 });
  }
  const campRepo = ds.getRepository(Campaign);
  const prod = (sku: string) => ctx.products.get(sku)!.id;
  if (!(await campRepo.findOne({ where: { sellerId: storeA.id, reference: 'DEMO-CMP-1' } })) && !(await ds.query('SELECT id FROM campaigns WHERE sellerId = ? AND name = ?', [storeA.id, 'Home & Power Week'])).length) {
    const start = new Date(Date.now() - 10 * D).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 25 * D).toISOString().slice(0, 10);
    const c = await campaigns.create({ id: ownerA.id, name: ownerA.name, role: 'seller' }, { name: 'Home & Power Week', nameFr: 'Semaine maison et énergie', discount: 20, budgetUsd: 300, startDate: start, endDate: end, productIds: [prod('MK-LMP'), prod('MK-PWR'), prod('MK-BAG')], productCount: 3 });
    await campaigns.setStatus(c.id, 'active');
  }
  // A flash sale on the shea butter: proposed by the store, approved by marketing, running now.
  const flashRepo = ds.getRepository(FlashSale);
  const shea = ctx.products.get('MK-SHB')!;
  if (!(await flashRepo.findOne({ where: { productId: shea.id } }))) {
    const sale = await promos.nominate(storeA as Seller, { productId: shea.id, flashPrice: 6.5, startsAt: new Date(Date.now() - 1 * D).toISOString(), endsAt: new Date(Date.now() + 6 * D).toISOString(), title: 'Shea butter flash sale', titleFr: 'Vente flash beurre de karité' });
    await promos.decide(sale.id, true);
  }
}

// ─────────────────────────────────────────────────────────────────────────────────
// The order scenarios
// ─────────────────────────────────────────────────────────────────────────────────

async function review(c: Scenario, sku: string, rating: number, text: string, opts: { photo?: string; agoH: number }) {
  const reviews = c.ctx.app.get(ReviewsService);
  const product = c.ctx.products.get(sku)!;
  const have = await c.ctx.ds.getRepository(Review).findOne({ where: { productId: product.id, userId: c.user.id } });
  if (have) return have;
  const r = await reviews.create({ id: c.user.id, name: c.user.name }, { productId: product.id, rating, text, ...(opts.photo ? { photos: [c.ctx.images.url(opts.photo)] } : {}) });
  await c.ctx.ds.query('UPDATE reviews SET createdAt = ? WHERE id = ?', [new Date(Date.now() - opts.agoH * H), r.id]);
  return r;
}

async function openReturn(c: Scenario, sku: string, reason: string, category: string, photo?: string): Promise<Dispute> {
  const disputes = c.ctx.app.get(DisputesService);
  const repo = c.ctx.ds.getRepository(Dispute);
  const have = await repo.findOne({ where: { orderId: c.order.id, type: 'return' } });
  if (have) return have;
  const item = c.line(sku);
  const view = await disputes.open({ id: c.user.id, name: c.user.name }, { orderId: c.order.id, type: 'return', reason, category, items: [{ itemId: item.id, qty: item.qty }], ...(photo ? { attachments: [c.ctx.images.url(photo)] } : {}) });
  return (await repo.findOne({ where: { id: view.id } }))!;
}

const viewerOf = (c: Scenario, key: string) => {
  const u = c.ctx.users.get(key)!;
  return { id: u.id, role: u.role as string, name: u.name, hubId: (u.hubId ?? null) as string | null };
};
const sellerViewer = (c: Scenario, store: string) => viewerOf(c, `seller.${store.toLowerCase()}`);

export function orderSpecs(): OrderSpec[] {
  return [
    // ── Grace: the full customer ──
    {
      key: 'G1', customer: 'customer.full', lines: [{ sku: 'MK-DRS', variant: 'Size: L · Colour: Red' }, { sku: 'MK-PLM' }], address: 'gombe', stage: 'delivered', placedAgoH: 38 * 24, deliveredAgoH: 35 * 24,
      after: async (c) => {
        await review(c, 'MK-DRS', 5, 'Beautiful dress, the fabric is thick and the colours did not fade after washing. It fits as described. Delivered on time.', { photo: 'review-1.jpg', agoH: 33 * 24 });
        await review(c, 'MK-PLM', 4, 'Good oil, strong colour and smell. The bottle leaked a little at the cap but nothing was lost.', { agoH: 33 * 24 });
      },
    },
    { key: 'G3', customer: 'customer.full', lines: [{ sku: 'MB-FLR', qty: 2 }], address: 'gombe', stage: 'cancelled', placedAgoH: 12 * 24 },
    {
      key: 'G4', customer: 'customer.full', lines: [{ sku: 'MK-PHN', variant: 'Colour: Black' }], address: 'gombe', stage: 'delivered', placedAgoH: 7 * 24, deliveredAgoH: 5 * 24, caseAgoH: 108,
      after: async (c) => {
        const disputes = c.ctx.app.get(DisputesService);
        const d = await openReturn(c, 'MK-PHN', 'The screen was cracked when I opened the box.', 'damaged', 'issue-1.jpg');
        if (d.stage === 'awaiting_seller') await disputes.sellerRespond(sellerViewer(c, 'A'), d.id, true, '');
        const fresh = (await c.ctx.ds.getRepository(Dispute).findOne({ where: { id: d.id } }))!;
        if (fresh.status === 'open' && fresh.stage === 'pickup') {
          await c.driver.driveSideLegs({ disputeId: d.id }, 'done');
          const again = (await c.ctx.ds.getRepository(Dispute).findOne({ where: { id: d.id } }))!;
          if (again.receivedAt && !again.gradedAt) {
            const items: { id: string }[] = await c.ctx.ds.query('SELECT id FROM dispute_items WHERE disputeId = ?', [d.id]);
            await disputes.grade(viewerOf(c, 'warehouse.supervisor'), d.id, items.map((i) => ({ itemId: i.id, condition: 'damaged' })), 'Screen cracked, not resellable.');
          }
        }
      },
    },
    {
      key: 'G5', customer: 'customer.full', lines: [{ sku: 'MK-SNK', variant: 'Size: 41' }], address: 'gombe', stage: 'delivered', placedAgoH: 6 * 24, deliveredAgoH: 3 * 24, caseAgoH: 48,
      after: async (c) => {
        if (await c.ctx.ds.getRepository(Exchange).count({ where: { orderId: c.order.id } })) return;
        const item = c.line('MK-SNK');
        await c.ctx.app.get(ExchangesService).create({ id: c.user.id, name: c.user.name, role: 'customer' }, { orderId: c.order.id, itemId: item.id, toSku: item.productId, toName: item.productName, toVariant: 'Size: 42', reason: 'The size is too small, I need a 42.' });
      },
    },
    {
      key: 'G6', customer: 'customer.full', lines: [{ sku: 'MK-LMP' }], address: 'gombe', stage: 'delivered', placedAgoH: 6 * 24, deliveredAgoH: 4 * 24, caseAgoH: 72,
      after: async (c) => {
        const repo = c.ctx.ds.getRepository(Replacement);
        let rep = await repo.findOne({ where: { orderId: c.order.id } });
        if (!rep) {
          const item = c.line('MK-LMP');
          const view = await c.ctx.app.get(ReplacementsService).create({ id: c.user.id, name: c.user.name, role: 'customer' }, { orderId: c.order.id, itemId: item.id, reason: 'The lantern does not charge from the solar panel.', condition: 'Defective' });
          rep = (await repo.findOne({ where: { id: view.id } }))!;
        }
        if (rep.status === 'requested') {
          await c.ctx.app.get(ReplacementsService).respond({ id: sellerViewer(c, 'A').id, role: 'seller' }, rep.id, true, '');
          await c.driver.driveSideLegs({ replacementId: rep.id }, 'assigned');
        }
      },
    },
    {
      key: 'G9', customer: 'customer.full', lines: [{ sku: 'MK-CSH' }, { sku: 'MK-TOY' }], address: 'gombe', stage: 'delivered', placedAgoH: 6 * 24, deliveredAgoH: 4 * 24, caseAgoH: 60,
      after: async (c) => {
        const disputes = c.ctx.app.get(DisputesService);
        const repo = c.ctx.ds.getRepository(Dispute);
        let d = await repo.findOne({ where: { orderId: c.order.id, type: 'dispute' } });
        if (!d) {
          const view = await disputes.open({ id: c.user.id, name: c.user.name }, { orderId: c.order.id, type: 'dispute', reason: 'The box arrived crushed and two cushion covers were missing from the set.', category: 'damaged', attachments: [c.ctx.images.url('issue-3.jpg')] });
          d = (await repo.findOne({ where: { id: view.id } }))!;
        }
        if (d.stage === 'awaiting_seller') await disputes.reply({ ...sellerViewer(c, 'A'), name: 'Maison Kinshasa' }, d.id, 'We are sorry about this. We packed four covers and the box looked fine in our photo. Could you send a picture of the covers you received?');
      },
    },
    {
      key: 'G7', customer: 'customer.full', lines: [{ sku: 'MK-SHR', variant: 'Size: L' }, { sku: 'MK-YOG' }], address: 'gombe', stage: 'delivered', placedAgoH: 4 * 24, deliveredAgoH: 3 * 24, caseAgoH: 20,
      after: async (c) => {
        // The request is 20 hours old (caseAgoH): the seller still has 28 hours to answer, so the timer is running.
        await openReturn(c, 'MK-SHR', 'The shirt is too large and I would like my money back.', 'changed_mind');
      },
    },
    { key: 'G8', customer: 'customer.full', lines: [{ sku: 'MK-BAG' }, { sku: 'MK-EAR' }], address: 'gombe', stage: 'delivered', placedAgoH: 3 * 24, deliveredAgoH: 2 * 24, promo: 'DEMO10' },
    { key: 'G16', customer: 'customer.full', lines: [{ sku: 'MK-BLL' }], address: 'maluku', stage: 'transfer_road', placedAgoH: 2 * 24 },
    {
      key: 'G10', customer: 'customer.full', lines: [{ sku: 'MK-PLM', qty: 2 }, { sku: 'MB-PNT' }, { sku: 'MB-BTL' }], address: 'gombe', stage: 'placed', placedAgoH: 26,
      after: async (c) => {
        // A multi-seller basket: store A's package is already at the warehouse, store B's is packed but not collected.
        const a = c.ctx.stores.get('A')!.id;
        const b = c.ctx.stores.get('B')!.id;
        const t = await c.driver.tasks(c.order.id);
        if (t.some((x) => x.kind === 'pickup' && x.sellerId === a && x.status === 'unassigned')) {
          await c.driver.drive(c.order.id, 'at_hub', (x) => x.sellerId === a);
          await c.driver.drive(c.order.id, 'ready', (x) => x.sellerId === b && x.kind === 'pickup');
        }
      },
    },
    { key: 'G11', customer: 'customer.full', lines: [{ sku: 'MK-PWR' }, { sku: 'MK-COF' }], address: 'gombe', stage: 'out', placedAgoH: 24 },
    { key: 'G12', customer: 'customer.full', lines: [{ sku: 'MK-SNK', variant: 'Size: 42' }], address: 'gombe', stage: 'at_hub', placedAgoH: 20 },
    { key: 'G13', customer: 'customer.full', lines: [{ sku: 'MK-DRS', variant: 'Size: M · Colour: Blue' }], address: 'gombe', stage: 'ready', placedAgoH: 6, promo: 'MAISON5' },
    { key: 'G14', customer: 'customer.full', lines: [{ sku: 'MK-HNY' }, { sku: 'MK-OIL' }], address: 'gombe', stage: 'assigned', placedAgoH: 3 },
    { key: 'G15', customer: 'customer.full', lines: [{ sku: 'MK-SOP', qty: 2 }, { sku: 'MK-SHB' }], address: 'gombe', stage: 'placed', placedAgoH: 0.4 },

    // ── Jean-Baptiste: French customer ──
    {
      key: 'F1', customer: 'customer.fr', lines: [{ sku: 'MK-SHB' }, { sku: 'MK-SOP' }], address: 'ngaliema', stage: 'delivered', placedAgoH: 12 * 24, deliveredAgoH: 10 * 24,
      after: async (c) => {
        await review(c, 'MK-SHB', 5, 'Un beurre de karité pur, très hydratant. Livraison rapide, je recommande ce vendeur.', { agoH: 8 * 24 });
      },
    },
    {
      key: 'F3', customer: 'customer.fr', lines: [{ sku: 'MK-SHR', variant: 'Size: M' }], address: 'ngaliema', stage: 'delivered', placedAgoH: 5 * 24, deliveredAgoH: 3 * 24, caseAgoH: 48,
      after: async (c) => {
        const d = await openReturn(c, 'MK-SHR', 'La chemise a une tache près du col.', 'damaged', 'issue-2.jpg');
        const disputes = c.ctx.app.get(DisputesService);
        if (d.stage === 'awaiting_seller') await disputes.sellerRespond(sellerViewer(c, 'A'), d.id, false, 'The shirt left our warehouse clean. The stain is not from us, so we cannot accept this return.');
        const fresh = (await c.ctx.ds.getRepository(Dispute).findOne({ where: { id: d.id } }))!;
        if (fresh.stage === 'seller_rejected') await disputes.escalate({ id: c.user.id, role: 'customer', name: c.user.name, hubId: null }, d.id, 'Je ne suis pas d’accord : la tache était déjà là à l’ouverture du colis. Voir la photo.');
      },
    },
    {
      key: 'F4', customer: 'customer.fr', lines: [{ sku: 'MK-SNK', variant: 'Size: 40' }], address: 'ngaliema', stage: 'delivered', placedAgoH: 4 * 24, deliveredAgoH: 2 * 24, caseAgoH: 30,
      after: async (c) => {
        const repo = c.ctx.ds.getRepository(Exchange);
        let ex = await repo.findOne({ where: { orderId: c.order.id } });
        if (!ex) {
          const item = c.line('MK-SNK');
          const view = await c.ctx.app.get(ExchangesService).create({ id: c.user.id, name: c.user.name, role: 'customer' }, { orderId: c.order.id, itemId: item.id, toSku: item.productId, toName: item.productName, toVariant: 'Size: 41', reason: 'Trop petites, je voudrais la pointure 41.' });
          ex = (await repo.findOne({ where: { id: view.id } }))!;
        }
        if (ex.status === 'requested') {
          await c.ctx.app.get(ExchangesService).respond({ id: sellerViewer(c, 'A').id, role: 'seller' }, ex.id, true, '');
          await c.driver.driveSideLegs({ exchangeId: ex.id }, 'assigned');
        }
      },
    },
    { key: 'F2', customer: 'customer.fr', lines: [{ sku: 'MK-DRS', variant: 'Size: S · Colour: Blue' }], address: 'ngaliema', stage: 'out', placedAgoH: 28 },

    // ── Rita: the customer with fraud alerts ──
    { key: 'R1', customer: 'customer.fraud', lines: [{ sku: 'MK-EAR' }], address: 'gombe2', stage: 'delivered', placedAgoH: 8 * 24, deliveredAgoH: 6 * 24 },
    { key: 'R2', customer: 'customer.fraud', lines: [{ sku: 'MK-PWR' }, { sku: 'MK-PHN', variant: 'Colour: Blue' }], address: 'gombe2', stage: 'placed', placedAgoH: 2 },

    // ── Past buyers: their delivered orders and reviews fill the product pages ──
    {
      key: 'P1', customer: 'reviewer.1', lines: [{ sku: 'MK-DRS', variant: 'Size: M · Colour: Red' }, { sku: 'MK-SNK', variant: 'Size: 43' }, { sku: 'MK-SHB' }], address: 'limete', stage: 'delivered', placedAgoH: 44 * 24, deliveredAgoH: 42 * 24,
      after: async (c) => {
        await review(c, 'MK-DRS', 5, 'Gorgeous print and a perfect fit. I got compliments all day at the wedding.', { agoH: 40 * 24 });
        await review(c, 'MK-SNK', 4, 'Comfortable and light. A bit tight at the start but they loosen after two days.', { photo: 'review-2.jpg', agoH: 40 * 24 });
        await review(c, 'MK-SHB', 5, 'Pure shea butter, no smell of chemicals. My skin is much softer.', { agoH: 39 * 24 });
      },
    },
    {
      key: 'P2', customer: 'reviewer.2', lines: [{ sku: 'MK-PHN', variant: 'Colour: Blue' }, { sku: 'MK-EAR' }, { sku: 'MK-PWR' }], address: 'kalamu', stage: 'delivered', placedAgoH: 40 * 24, deliveredAgoH: 38 * 24,
      after: async (c) => {
        await review(c, 'MK-PHN', 4, 'Good battery, the camera is fine in daylight. Two SIM slots are very useful.', { photo: 'review-3.jpg', agoH: 36 * 24 });
        await review(c, 'MK-EAR', 3, 'Sound is okay for the price but the case is loose and the left bud disconnects sometimes.', { photo: 'review-8.jpg', agoH: 36 * 24 });
        await review(c, 'MK-PWR', 5, 'Charged my phone four times in one day. Works with all my cables.', { agoH: 35 * 24 });
      },
    },
    {
      key: 'P3', customer: 'reviewer.3', lines: [{ sku: 'MK-HNY' }, { sku: 'MK-PLM' }, { sku: 'MK-COF' }, { sku: 'MB-PNT' }], address: 'bandalungwa', stage: 'delivered', placedAgoH: 30 * 24, deliveredAgoH: 28 * 24,
      after: async (c) => {
        await review(c, 'MK-HNY', 5, 'Real honey, thick and fragrant. Better than the supermarket one.', { photo: 'review-4.jpg', agoH: 26 * 24 });
        await review(c, 'MK-PLM', 4, 'Très bonne huile de palme, couleur et goût authentiques. Emballage à améliorer.', { photo: 'review-7.jpg', agoH: 26 * 24 });
        await review(c, 'MK-COF', 5, 'Rich coffee, smells wonderful when you open the bag.', { agoH: 25 * 24 });
        await review(c, 'MB-PNT', 4, 'Fresh and crunchy, well salted.', { agoH: 25 * 24 });
      },
    },
    { key: 'P5', customer: 'reviewer.2', lines: [{ sku: 'MF-WCH' }, { sku: 'MF-RNG' }], address: 'kalamu', stage: 'delivered', placedAgoH: 18 * 24, deliveredAgoH: 16 * 24 },
    {
      key: 'P4', customer: 'reviewer.4', lines: [{ sku: 'MK-BAG' }, { sku: 'MK-LMP' }, { sku: 'MB-TOW' }], address: 'kintambo', stage: 'delivered', placedAgoH: 26 * 24, deliveredAgoH: 24 * 24,
      after: async (c) => {
        await review(c, 'MK-BAG', 5, 'Looks much more expensive than it is. The strap is comfortable and the zip is solid.', { photo: 'review-5.jpg', agoH: 22 * 24 });
        await review(c, 'MK-LMP', 4, 'Bright enough for the whole room during power cuts. Solar charging is slow on cloudy days.', { photo: 'review-6.jpg', agoH: 22 * 24 });
        await review(c, 'MB-TOW', 1, 'SCAM!!! Do not buy from this seller, they are thieves and liars!!! I want everything back!!!', { agoH: 21 * 24 });
      },
    },
  ];
}

/** Store A asks for two payouts: one is paid (a statement exists, no money really moves), one stays requested. */
async function payoutsAndFinance(ctx: DemoCtx): Promise<void> {
  const payouts = ctx.app.get(PayoutsService);
  const owner = ctx.users.get('seller.a')!;
  const store = ctx.stores.get('A')!;
  const have = await ctx.ds.query('SELECT COUNT(*) AS n FROM payouts WHERE sellerId = ?', [owner.id]);
  if (Number(have[0].n) > 0) return;
  const bal = await payouts.available(owner.id).catch(() => null);
  if (!bal || bal.available < 20) {
    log('! store A has no cleared earnings yet: no payout was requested');
    return;
  }
  const first = await payouts.request({ id: owner.id, name: store.name }, Math.min(40, Math.floor(bal.available / 2)), 'mobile_money', '+243 900 000 301');
  await payouts.approve(first.id, 'DEMO-NO-REAL-TRANSFER');
  const left = await payouts.available(owner.id);
  if (left.available >= 10) await payouts.request({ id: owner.id, name: store.name }, Math.floor(left.available), 'mobile_money', '+243 900 000 301');
}
