import { DeliveryTask, Dispute, Exchange, Order, Replacement, SupportTicket, WalletTransaction } from '../entities';
import type { User } from '../entities';
import { CartService } from '../../cart/cart.service';
import { DisputesService } from '../../disputes/disputes.service';
import { ExchangesService } from '../../flows/exchanges.service';
import { ReplacementsService } from '../../flows/replacements.service';
import { FollowsService } from '../../follows/follows.service';
import { PaymentsService } from '../../payments/payments.service';
import { OrdersService } from '../../orders/orders.service';
import { SupportService } from '../../content/support.service';
import { WalletService } from '../../wallet/wallet.service';
import { WishlistService } from '../../content/wishlist.service';
import { log } from './demo-common';
import { CANCEL, CASE, REVIEW, TICKET } from './demo-customers-texts';
import type { DemoCtx } from './demo-ctx';
import { stampLines, stampTask } from './demo-flow';
import { openReturn, review, viewerOf } from './demo-commerce';
import type { OrderSpec, Scenario } from './demo-commerce';

/**
 * The customer demo: eight more customers that look like real people (names, Kinshasa addresses with a landmark and a pin, a drawn
 * avatar, a language), and the orders that fill their screens, so that the customer app shows every status and every state a
 * customer can reach. Each order is placed through `OrdersService.create`, paid from the wallet (or with mobile money where the
 * server has the sandbox or the manual provider), moved by the same services the people use (`Driver`, the after-sale desk, the
 * stores' "Cancel items"), and only then dated into the past, with a timeline that reads placed, confirmed, packed, collected,
 * at the warehouse, out for delivery, delivered. The table of what each customer shows is in `deploy/DEMO-SEED.md`.
 *
 * Every basket of a customer differs from every other basket of that customer (the seed finds an order again by its lines), and
 * everything belongs to a demo account, so `seed:demo:remove` takes it all out with the rest.
 */

const H = 3_600_000;
const MIN = 60_000;
const day = (n: number) => n * 24;

type Pair = readonly [en: string, fr: string];
/** The text as the customer (or the agent) of the scenario writes it: the French of a French-language person, else the English. */
const say = (p: Pair, lang: 'en' | 'fr') => (lang === 'fr' ? p[1] : p[0]);

// ─────────────────────────────────────────────────────────────────────────────────
// Which mobile-money provider is on this server
// ─────────────────────────────────────────────────────────────────────────────────

/**
 * Mobile-money orders (awaiting payment, declined, expired, paid with Airtel or Orange) are made only while the server's provider is
 * the sandbox or the manual one: the demo settles them the way finance does (`decideManually`) and must never send a charge to a real
 * aggregator. The provider is read from the payment service itself (it is what the API will use), not guessed from the environment.
 */
export function mobileMoneyUsable(ctx: DemoCtx): boolean {
  const provider = (ctx.app.get(PaymentsService) as unknown as { mobileMoney?: { name?: string } | null }).mobileMoney;
  return provider?.name === 'sandbox' || provider?.name === 'manual';
}

// ─────────────────────────────────────────────────────────────────────────────────
// Wallet history, dated
// ─────────────────────────────────────────────────────────────────────────────────

type Via = 'airtel_money' | 'orange_money' | 'vodacom_mpesa' | 'welcome' | 'starter';
interface Credit {
  amount: number;
  via: Via;
  /** Hours ago. */
  agoH: number;
}

/** Credit a wallet and date the line (the services stamp "now"). A top-up reads "Wallet top-up via Airtel Money"; a gift reads as the demo's welcome credit. */
async function credit(ctx: DemoCtx, user: User, c: Credit): Promise<void> {
  const wallet = ctx.app.get(WalletService);
  const tx =
    c.via === 'welcome'
      ? await wallet.apply(user.id, 'cashback', c.amount, 'Welcome credit from KOMORIKO (demo)')
      : c.via === 'starter'
        ? await wallet.apply(user.id, 'cashback', c.amount, 'Demo starter credit (not real money)')
        : await wallet.topUp(user.id, c.amount, c.via);
  await ctx.ds.query('UPDATE wallet_transactions SET createdAt = ? WHERE id = ?', [new Date(Date.now() - c.agoH * H), tx.id]);
}

/** The credits that go in just before an order (hook `before` of the order spec). */
const funded =
  (...credits: Credit[]) =>
  async (c: { ctx: DemoCtx; user: User }) => {
    for (const x of credits) await credit(c.ctx, c.user, x);
  };

// ─────────────────────────────────────────────────────────────────────────────────
// Plausible timelines
// ─────────────────────────────────────────────────────────────────────────────────

const CUSTOMER_LEGS = ['delivery', 'express'];
/** The platform's own failure text of a payment nobody approved in time (the same words `PaymentsService.expireStale` writes). */
const TIMED_OUT = 'Timed out waiting for approval.';

/**
 * The services stamp every step "now", and the commerce seed then moves the whole order into the past by one offset, so a delivered
 * order would read placed, packed, collected and delivered within the same few seconds. This spreads the order's own moments over its
 * life: packed after about a tenth of it, collected, scanned in at the warehouse, the delivery leg opened, the rider out, and (for a
 * delivered order) delivered at `deliveredAgoH`. An order still on its way is spread over the time it has had. The notices of the
 * order are spread the same way, in the order they were written, so the customer's notice list reads like a real week.
 */
async function timeline(c: Scenario): Promise<void> {
  const { ds } = c.ctx;
  const order = await ds.getRepository(Order).findOne({ where: { id: c.order.id } });
  if (!order) return;
  const placed = order.createdAt.getTime();
  const delivered = c.spec.deliveredAgoH !== undefined ? Date.now() - c.spec.deliveredAgoH * H : null;
  const end = delivered ?? Date.now() - 15 * MIN;
  const span = end - placed;
  if (span < 45 * MIN) return; // placed a moment ago: nothing to spread
  const at = (f: number, extra = 0) => new Date(placed + Math.round(span * f) + extra);

  const tasks = (await ds.getRepository(DeliveryTask).find({ where: { orderId: order.id }, order: { createdAt: 'ASC' } })).filter(
    (t) => !t.disputeId && !t.replacementId && !t.exchangeId,
  );
  let pickup = 0;
  let leg = 0;
  const legs = tasks.filter((t) => t.kind === 'delivery').length;
  for (const t of tasks) {
    const m: Parameters<typeof stampTask>[2] = {};
    if (t.kind === 'pickup') {
      const j = pickup++ * 4 * MIN;
      if (t.readyAt) m.readyAt = at(0.1, j);
      if (t.pickedUpAt) m.pickedUpAt = at(0.22, j);
      if (t.receivedAt) m.receivedAt = at(0.38, j);
      if (t.deliveredAt) m.deliveredAt = at(0.38, j);
    } else if (t.kind === 'transfer') {
      if (t.pickedUpAt) m.pickedUpAt = at(0.5);
      if (t.receivedAt) m.receivedAt = at(0.66);
      if (t.deliveredAt) m.deliveredAt = at(0.66);
    } else if (CUSTOMER_LEGS.includes(t.kind)) {
      // A delivery that failed and was re-opened has two legs: the first one went out earlier, the retry later.
      const k = t.kind === 'delivery' ? leg++ : 0;
      if (t.kind === 'delivery') m.createdAt = at(legs > 1 ? 0.42 + 0.24 * k : 0.42);
      if (t.readyAt) m.readyAt = at(0.1);
      if (t.pickedUpAt) m.pickedUpAt = at(t.kind === 'express' ? 0.5 : legs > 1 ? 0.58 + 0.24 * k : 0.82);
      if (t.deliveredAt && delivered) m.deliveredAt = new Date(delivered);
    }
    if (Object.keys(m).length) await stampTask(ds, t.id, m);
  }
  for (const sellerId of new Set((order.items ?? []).map((i) => i.sellerId).filter((x): x is string => !!x)))
    await stampLines(ds, order.id, sellerId, {
      readyAt: at(0.1),
      receivedAt: at(0.38),
      ...(delivered ? { deliveredAt: new Date(delivered) } : {}),
    });
  await ds.query('UPDATE orders SET updatedAt = ? WHERE id = ?', [new Date(end), order.id]);

  const ids = [order.id, ...tasks.map((t) => t.id)];
  const notices: { id: string }[] = await ds.query(
    `SELECT id FROM notifications WHERE userId = ? AND entityId IN (${ids.map(() => '?').join(',')}) ORDER BY createdAt ASC, id ASC`,
    [order.customerId, ...ids],
  );
  const step = notices.length > 1 ? (span - 2 * MIN) / (notices.length - 1) : 0;
  for (const [i, n] of notices.entries())
    await ds.query('UPDATE notifications SET createdAt = ? WHERE id = ?', [new Date(placed + 2 * MIN + Math.round(step * i)), n.id]);
}

/** A cancelled order: the cancellation, its notice and its refund happened `hours` after the order was placed (not in the same second). */
async function cancelledAfter(c: Scenario, hours: number): Promise<void> {
  const { ds } = c.ctx;
  const order = await ds.getRepository(Order).findOne({ where: { id: c.order.id } });
  if (!order) return;
  const placed = order.createdAt.getTime();
  const when = new Date(placed + hours * H);
  await ds.query('UPDATE orders SET updatedAt = ? WHERE id = ?', [when, order.id]);
  await ds.query(
    "UPDATE notifications SET createdAt = ? WHERE userId = ? AND entityId = ? AND (title LIKE 'Order cancelled%' OR title LIKE 'Item cancelled%' OR title LIKE 'Items could not%' OR title LIKE 'Payment failed%')",
    [when, order.customerId, order.id],
  );
  await ds.query(
    "UPDATE wallet_transactions SET createdAt = ? WHERE userId = ? AND type = 'refund' AND createdAt >= ? AND createdAt <= ?",
    [when, order.customerId, new Date(placed - 5000), new Date(placed + 10 * MIN)],
  );
  await ds.query('UPDATE payment_refunds SET createdAt = ?, updatedAt = ? WHERE orderId = ?', [when, when, order.id]);
  await ds.query('UPDATE payments SET updatedAt = ? WHERE orderId = ?', [when, order.id]);
  // The delivery attempts of an order nobody could deliver are spread over its life, the cancellation closing it.
  const legs = await ds.getRepository(DeliveryTask).find({ where: { orderId: order.id }, order: { createdAt: 'ASC' } });
  const spread = (i: number) => new Date(placed + Math.round(((hours * H) * (i + 1)) / (legs.length + 2)));
  for (const [i, t] of legs.entries()) if (t.kind === 'delivery') await stampTask(ds, t.id, { createdAt: spread(i) });
}

const withTimeline = (o: OrderSpec): OrderSpec => ({
  ...o,
  afterBackdate: async (c) => {
    await timeline(c);
    await o.afterBackdate?.(c);
  },
});
const withCancelled = (hours: number, o: OrderSpec): OrderSpec => ({
  ...o,
  afterBackdate: async (c) => {
    await cancelledAfter(c, hours);
    await o.afterBackdate?.(c);
  },
});

// ─────────────────────────────────────────────────────────────────────────────────
// Small steps the scenarios share
// ─────────────────────────────────────────────────────────────────────────────────

const customerOf = (c: Scenario) => ({ id: c.user.id, name: c.user.name, role: 'customer' });

/** The customer rates a line of the order (the review is dated after the delivery). */
const rated = (c: Scenario, sku: string, rating: number, p: Pair, lang: 'en' | 'fr', agoH: number, photo?: string) =>
  review(c, sku, rating, say(p, lang), { agoH, ...(photo ? { photo } : {}) });

/** Support settles the mobile-money payment of a new order the way finance does. */
async function settlePayment(c: Scenario): Promise<void> {
  const pay = c.spec.pay!;
  if (pay.outcome === 'pending') return;
  const payments = c.ctx.app.get(PaymentsService);
  const row = await payments.forOrder(c.order.id);
  if (!row || row.status !== 'pending') return;
  if (pay.outcome === 'paid') await payments.decideManually(row.reference, 'succeeded');
  else await payments.decideManually(row.reference, 'failed', pay.outcome === 'expired' ? TIMED_OUT : 'Declined by subscriber.');
}

/** A return the customer asks for, with what support (and the warehouse) did with it. */
async function returnTo(c: Scenario, sku: string, reason: Pair, lang: 'en' | 'fr', how: 'waiting' | 'refused' | 'withdrawn' | 'approved' | 'refunded') {
  const disputes = c.ctx.app.get(DisputesService);
  const repo = c.ctx.ds.getRepository(Dispute);
  const d = await openReturn(c, sku, say(reason, lang), 'changed_mind');
  if (how === 'waiting') return;
  if (d.status === 'open' && d.stage === 'awaiting_support') {
    if (how === 'refused') await disputes.adminDecideReturn(viewerOf(c, 'admin.support'), d.id, false, CASE.J5NO[0]);
    else if (how === 'withdrawn') await disputes.cancel(customerOf(c), d.id);
    else await disputes.adminDecideReturn(viewerOf(c, 'admin.support'), d.id, true, '');
  }
  if (how !== 'refunded') return;
  // The rider brings the goods to the warehouse, the warehouse grades them, the refund follows.
  let fresh = (await repo.findOne({ where: { id: d.id } }))!;
  if (fresh.status === 'open' && fresh.stage === 'pickup') {
    await c.driver.driveSideLegs({ disputeId: d.id }, 'done', 1);
    fresh = (await repo.findOne({ where: { id: d.id } }))!;
  }
  if (fresh.status === 'open' && fresh.receivedAt && !fresh.gradedAt) {
    const lines: { id: string }[] = await c.ctx.ds.query('SELECT id FROM dispute_items WHERE disputeId = ?', [d.id]);
    await disputes.grade(viewerOf(c, 'warehouse.supervisor'), d.id, lines.map((l) => ({ itemId: l.id, condition: 'resellable' })), '');
  }
}

/** An exchange of one line for another size (or product), and how far it got. */
async function exchangeOf(c: Scenario, sku: string, toVariant: string, reason: Pair, lang: 'en' | 'fr', how: 'delivered' | 'refused') {
  const repo = c.ctx.ds.getRepository(Exchange);
  let ex = await repo.findOne({ where: { orderId: c.order.id } });
  if (!ex) {
    const item = c.line(sku);
    const view = await c.ctx.app
      .get(ExchangesService)
      .create(customerOf(c), { orderId: c.order.id, itemId: item.id, toSku: item.productId, toName: item.productName, toVariant, reason: say(reason, lang) });
    ex = (await repo.findOne({ where: { id: view.id } }))!;
  }
  if (ex.status !== 'requested') return;
  if (how === 'refused') {
    await c.ctx.app.get(ExchangesService).respond(viewerOf(c, 'admin.support'), ex.id, false, CASE.J11NO[0]);
    return;
  }
  await c.ctx.app.get(ExchangesService).respond(viewerOf(c, 'admin.support'), ex.id, true, '');
  await c.driver.driveSideLegs({ exchangeId: ex.id }, 'done');
}

/** A replacement of a defective line, and how far it got. */
async function replacementOf(c: Scenario, sku: string, reason: Pair, lang: 'en' | 'fr', how: 'delivered' | 'refused') {
  const repo = c.ctx.ds.getRepository(Replacement);
  let rep = await repo.findOne({ where: { orderId: c.order.id } });
  if (!rep) {
    const item = c.line(sku);
    const view = await c.ctx.app
      .get(ReplacementsService)
      .create(customerOf(c), { orderId: c.order.id, itemId: item.id, reason: say(reason, lang), condition: 'Defective' });
    rep = (await repo.findOne({ where: { id: view.id } }))!;
  }
  if (rep.status !== 'requested') return;
  const svc = c.ctx.app.get(ReplacementsService);
  if (how === 'refused') await svc.respond(viewerOf(c, 'admin.support'), rep.id, false, CASE.E7NO[0]);
  else {
    await svc.respond(viewerOf(c, 'admin.support'), rep.id, true, '');
    await c.driver.driveSideLegs({ replacementId: rep.id }, 'done');
  }
}

/** A dispute about the whole order, settled by support with a partial refund to the wallet, or refused with the reason. */
async function disputeSettled(c: Scenario, reason: Pair, how: 'partial' | 'refused' = 'partial') {
  const disputes = c.ctx.app.get(DisputesService);
  const repo = c.ctx.ds.getRepository(Dispute);
  let d = await repo.findOne({ where: { orderId: c.order.id, type: 'dispute' } });
  if (!d) {
    const view = await disputes.open(customerOf(c), { orderId: c.order.id, type: 'dispute', reason: reason[0], category: 'damaged' });
    d = (await repo.findOne({ where: { id: view.id } }))!;
  }
  if (d.status !== 'open') return;
  const input = how === 'partial' ? { outcome: 'refund_partial', amountUsd: 5, reason: CASE.E4OK[0] } : { outcome: 'reject', reason: CASE.T0NO[0] };
  await disputes.decide({ ...viewerOf(c, 'admin.support') }, d.id, input, true);
}

// ─────────────────────────────────────────────────────────────────────────────────
// The orders
// ─────────────────────────────────────────────────────────────────────────────────

interface Dated {
  key: string;
  customer: string;
  lines: OrderSpec['lines'];
  address: OrderSpec['address'];
  promo?: string;
  /** Days ago the order was placed and delivered. */
  placedDays: number;
  deliveredDays: number;
  before?: OrderSpec['before'];
  after?: OrderSpec['after'];
  afterBackdate?: OrderSpec['afterBackdate'];
}
/** A delivered order, dated in days. */
const delivered = (o: Dated): OrderSpec =>
  withTimeline({
    key: o.key,
    customer: o.customer,
    lines: o.lines,
    address: o.address,
    ...(o.promo ? { promo: o.promo } : {}),
    stage: 'delivered',
    placedAgoH: day(o.placedDays),
    deliveredAgoH: day(o.deliveredDays),
    ...(o.before ? { before: o.before } : {}),
    ...(o.after ? { after: o.after } : {}),
    ...(o.afterBackdate ? { afterBackdate: o.afterBackdate } : {}),
    // The after-sale step of a delivered order is dated a day or so after the delivery (the commerce seed moves the case there).
    ...(o.after ? { caseAgoH: Math.max(2, day(o.deliveredDays) - 20) } : {}),
  });
/** An order still on its way (or waiting), dated in hours. */
const open = (o: Omit<OrderSpec, 'afterBackdate'> & { afterBackdate?: OrderSpec['afterBackdate'] }): OrderSpec => withTimeline(o);

const V = 'customer.vip';
const J = 'customer.regular.fr';
const E = 'customer.regular.en';
const K = 'customer.business';
const N = 'customer.cancelled';
const T = 'customer.expat';

export function customerSpecs(): OrderSpec[] {
  return [
    // ── Marie-Claire Tshimanga (VIP, French): 14 orders over 90 days, a large wallet ──────────────────────────────────────
    delivered({
      key: 'V1',
      customer: V,
      lines: [{ sku: 'MK-DRS', variant: 'Size: M · Colour: Blue' }, { sku: 'MK-BAG' }],
      address: 'vipHome',
      placedDays: 88,
      deliveredDays: 85,
      before: funded({ amount: 50, via: 'welcome', agoH: day(91) }, { amount: 800, via: 'orange_money', agoH: day(90) }),
      after: async (c) => {
        await rated(c, 'MK-DRS', 5, REVIEW.V1, 'fr', day(83), 'review-1.jpg');
      },
    }),
    delivered({
      key: 'V2',
      customer: V,
      lines: [{ sku: 'MK-COF', qty: 2 }, { sku: 'MB-TEA', qty: 2 }, { sku: 'MB-TOW' }],
      address: 'vipHome',
      placedDays: 80,
      deliveredDays: 77,
      after: async (c) => {
        await rated(c, 'MB-TEA', 4, REVIEW.V2, 'fr', day(75));
      },
    }),
    delivered({
      key: 'V3',
      customer: V,
      lines: [{ sku: 'MK-PWR' }, { sku: 'MK-EAR' }],
      address: 'vipOffice',
      promo: 'DEMO10',
      placedDays: 71,
      deliveredDays: 69,
      after: async (c) => {
        await rated(c, 'MK-PWR', 5, REVIEW.V3, 'fr', day(67));
      },
    }),
    delivered({
      key: 'V4',
      customer: V,
      lines: [{ sku: 'MK-SNK', qty: 2, variant: 'Size: 42' }, { sku: 'MK-SHR', variant: 'Size: L' }],
      address: 'vipHome',
      placedDays: 63,
      deliveredDays: 60,
      before: funded({ amount: 800, via: 'airtel_money', agoH: day(64) }),
    }),
    delivered({
      key: 'V5',
      customer: V,
      lines: [{ sku: 'MK-HNY', qty: 3 }, { sku: 'MK-OIL', qty: 2 }, { sku: 'MK-SHB', qty: 2 }],
      address: 'vipHome',
      promo: 'MAISON5',
      placedDays: 55,
      deliveredDays: 53,
      after: async (c) => {
        await rated(c, 'MK-HNY', 5, REVIEW.V5, 'fr', day(51));
      },
    }),
    delivered({
      key: 'V6',
      customer: V,
      lines: [{ sku: 'MB-BTL', qty: 2 }, { sku: 'MB-NBK', qty: 3 }],
      address: 'vipOffice',
      placedDays: 47,
      deliveredDays: 44,
    }),
    delivered({
      key: 'V7',
      customer: V,
      lines: [{ sku: 'MC-FAN' }, { sku: 'MC-CHG', qty: 2 }, { sku: 'MC-KTL' }],
      address: 'vipOffice',
      placedDays: 33,
      deliveredDays: 30,
      before: funded({ amount: 700, via: 'vodacom_mpesa', agoH: day(34) }),
      after: async (c) => {
        await rated(c, 'MC-FAN', 4, REVIEW.V7, 'fr', day(28));
      },
    }),
    delivered({
      key: 'V8',
      customer: V,
      lines: [{ sku: 'MK-LMP', qty: 2 }, { sku: 'MK-CSH' }, { sku: 'MK-PLT' }],
      address: 'vipMama',
      placedDays: 21,
      deliveredDays: 18,
      after: async (c) => {
        await rated(c, 'MK-LMP', 5, REVIEW.V8, 'fr', day(16), 'review-6.jpg');
      },
    }),
    delivered({
      key: 'V9',
      customer: V,
      lines: [{ sku: 'MK-DRS', variant: 'Size: L · Colour: Red' }, { sku: 'MK-YOG' }],
      address: 'vipHome',
      placedDays: 14,
      deliveredDays: 12,
    }),
    // Delivered four days ago: the customer can still return it, and has not rated it ("rate me").
    delivered({
      key: 'V10',
      customer: V,
      lines: [{ sku: 'MC-IRN' }, { sku: 'MC-KTL' }],
      address: 'vipHome',
      placedDays: 6,
      deliveredDays: 4,
    }),
    open({ key: 'V11', customer: V, lines: [{ sku: 'MK-COF' }, { sku: 'MK-HNY', qty: 2 }], address: 'vipHome', stage: 'out', placedAgoH: 30 }),
    open({ key: 'V12', customer: V, lines: [{ sku: 'MK-PLM', qty: 2 }, { sku: 'MK-SOP', qty: 3 }], address: 'vipOffice', stage: 'at_hub', placedAgoH: 22 }),
    open({ key: 'V13', customer: V, lines: [{ sku: 'MK-NBK', qty: 2 }, { sku: 'MB-PNT', qty: 2 }], address: 'vipHome', stage: 'assigned', placedAgoH: 9 }),
    open({ key: 'V14', customer: V, lines: [{ sku: 'MB-NBK' }, { sku: 'MK-SHB' }], address: 'vipHome', stage: 'placed', placedAgoH: 0.6 }),

    // ── Joël Kabasele (regular, French): ten orders over 75 days ───────────────────────────────────────────────────────────
    delivered({
      key: 'J1',
      customer: J,
      lines: [{ sku: 'MK-SHB', qty: 2 }, { sku: 'MK-SOP', qty: 4 }, { sku: 'MK-PLM' }],
      address: 'joelHome',
      placedDays: 75,
      deliveredDays: 72,
      before: funded({ amount: 30, via: 'welcome', agoH: day(77) }, { amount: 300, via: 'airtel_money', agoH: day(76) }),
      after: async (c) => {
        await rated(c, 'MK-SOP', 5, REVIEW.J1, 'fr', day(70));
      },
    }),
    delivered({
      key: 'J2',
      customer: J,
      lines: [{ sku: 'MB-PNT', qty: 4 }, { sku: 'MB-FLR', qty: 2 }, { sku: 'MB-TEA' }],
      address: 'joelHome',
      placedDays: 58,
      deliveredDays: 55,
    }),
    delivered({
      key: 'J3',
      customer: J,
      lines: [{ sku: 'MC-KTL' }, { sku: 'MC-CHG' }],
      address: 'joelShop',
      placedDays: 41,
      deliveredDays: 38,
      after: async (c) => {
        await rated(c, 'MC-KTL', 3, REVIEW.J3, 'fr', day(36));
      },
    }),
    delivered({
      key: 'J4',
      customer: J,
      lines: [{ sku: 'MK-EAR' }, { sku: 'MK-PWR' }],
      address: 'joelHome',
      promo: 'DEMO10',
      placedDays: 30,
      deliveredDays: 28,
      before: funded({ amount: 300, via: 'orange_money', agoH: day(31) }),
      after: async (c) => {
        await rated(c, 'MK-PWR', 4, REVIEW.J4, 'fr', day(26));
      },
    }),
    // A return that support refused: the order stays delivered, the request is closed with the reason.
    delivered({
      key: 'J5',
      customer: J,
      lines: [{ sku: 'MK-SHR', variant: 'Size: XL' }, { sku: 'MK-NBK' }],
      address: 'joelHome',
      placedDays: 19,
      deliveredDays: 16,
      after: (c) => returnTo(c, 'MK-SHR', CASE.J5, 'fr', 'refused'),
    }),
    // An exchange that went all the way: the new size was delivered.
    delivered({
      key: 'J6',
      customer: J,
      lines: [{ sku: 'MK-SNK', variant: 'Size: 40' }],
      address: 'joelHome',
      placedDays: 11,
      deliveredDays: 8,
      after: (c) => exchangeOf(c, 'MK-SNK', 'Size: 41', CASE.J6, 'fr', 'delivered'),
    }),
    // An exchange that support refused (the size asked for is not available).
    delivered({
      key: 'J11',
      customer: J,
      lines: [{ sku: 'MK-SHR', variant: 'Size: M' }, { sku: 'MK-SHB' }],
      address: 'joelHome',
      placedDays: 9,
      deliveredDays: 7,
      after: (c) => exchangeOf(c, 'MK-SHR', 'Size: L', CASE.J11, 'fr', 'refused'),
    }),
    delivered({
      key: 'J7',
      customer: J,
      lines: [{ sku: 'MC-CHG', qty: 3 }, { sku: 'MC-FAN' }, { sku: 'MC-IRN' }],
      address: 'joelShop',
      placedDays: 6,
      deliveredDays: 3,
    }),
    open({ key: 'J8', customer: J, lines: [{ sku: 'MK-HNY', qty: 2 }, { sku: 'MK-COF' }], address: 'joelHome', stage: 'out', placedAgoH: 27 }),
    open({ key: 'J9', customer: J, lines: [{ sku: 'MB-BIN' }, { sku: 'MB-BTL' }], address: 'joelHome', stage: 'at_hub', placedAgoH: 14 }),
    open({ key: 'J10', customer: J, lines: [{ sku: 'MK-YOG' }, { sku: 'MK-TOY' }], address: 'joelHome', stage: 'placed', placedAgoH: 1.5 }),

    // ── Priscilla Nsimba (regular, English): eleven orders, a case at every after-sale stage ─────────────────────────────────
    delivered({
      key: 'E1',
      customer: E,
      lines: [{ sku: 'MK-DRS', variant: 'Size: S · Colour: Red' }, { sku: 'MK-HNY' }],
      address: 'priscillaHome',
      placedDays: 85,
      deliveredDays: 82,
      before: funded({ amount: 25, via: 'welcome', agoH: day(87) }, { amount: 200, via: 'orange_money', agoH: day(86) }),
      after: async (c) => {
        await rated(c, 'MK-HNY', 4, REVIEW.E1, 'en', day(80));
      },
    }),
    delivered({
      key: 'E2',
      customer: E,
      lines: [{ sku: 'MK-YOG' }, { sku: 'MK-HNY', qty: 2 }, { sku: 'MK-COF' }],
      address: 'priscillaHome',
      promo: 'MAISON5',
      placedDays: 62,
      deliveredDays: 59,
    }),
    // A replacement that was delivered (the store sent a new lid).
    delivered({
      key: 'E3',
      customer: E,
      lines: [{ sku: 'MB-BIN' }, { sku: 'MB-TOW', qty: 2 }],
      address: 'priscillaWork',
      placedDays: 45,
      deliveredDays: 42,
      after: async (c) => {
        await replacementOf(c, 'MB-BIN', CASE.E3, 'en', 'delivered');
        await rated(c, 'MB-BIN', 3, REVIEW.E3, 'en', day(38));
      },
    }),
    // A dispute about the order, settled by support with a partial refund to the wallet.
    delivered({
      key: 'E4',
      customer: E,
      lines: [{ sku: 'MC-IRN' }, { sku: 'MC-CHG' }],
      address: 'priscillaHome',
      placedDays: 33,
      deliveredDays: 30,
      before: funded({ amount: 250, via: 'airtel_money', agoH: day(34) }),
      after: (c) => disputeSettled(c, CASE.E4),
    }),
    // A return she withdrew before support looked at it.
    delivered({
      key: 'E5',
      customer: E,
      lines: [{ sku: 'MK-PLT' }, { sku: 'MK-CSH' }],
      address: 'priscillaHome',
      placedDays: 22,
      deliveredDays: 19,
      after: (c) => returnTo(c, 'MK-PLT', CASE.E5, 'en', 'withdrawn'),
    }),
    // A return support approved: the rider has not collected the goods yet.
    delivered({
      key: 'E6',
      customer: E,
      lines: [{ sku: 'MK-SNK', variant: 'Size: 43' }, { sku: 'MK-BAG' }],
      address: 'priscillaWork',
      placedDays: 14,
      deliveredDays: 11,
      before: funded({ amount: 300, via: 'vodacom_mpesa', agoH: day(15) }),
      after: (c) => returnTo(c, 'MK-BAG', CASE.E6, 'en', 'approved'),
    }),
    // A replacement support refused.
    delivered({
      key: 'E7',
      customer: E,
      lines: [{ sku: 'MK-TOY' }, { sku: 'MB-NBK', qty: 2 }],
      address: 'priscillaHome',
      placedDays: 8,
      deliveredDays: 5,
      after: (c) => replacementOf(c, 'MK-TOY', CASE.E7, 'en', 'refused'),
    }),
    // Delivered on the second try: the first attempt failed (the customer did not answer), the rider came back.
    withTimeline({
      key: 'E12',
      customer: E,
      lines: [{ sku: 'MK-COF', qty: 2 }, { sku: 'MK-SHB' }],
      address: 'priscillaHome',
      stage: 'placed',
      placedAgoH: day(26),
      deliveredAgoH: day(24),
      after: async (c) => {
        const legs = await c.driver.tasks(c.order.id);
        if (legs.some((t) => t.kind === 'delivery' && t.status === 'failed')) return;
        await c.driver.drive(c.order.id, 'at_hub');
        await c.driver.failDelivery(c.order.id, 'Customer not reachable');
        await c.driver.drive(c.order.id, 'delivered');
      },
    }),
    open({ key: 'E8', customer: E, lines: [{ sku: 'MK-OIL', qty: 2 }, { sku: 'MK-SHB' }], address: 'priscillaHome', stage: 'at_hub', placedAgoH: 30 }),
    open({ key: 'E9', customer: E, lines: [{ sku: 'MC-CHG', qty: 2 }, { sku: 'MC-KTL' }], address: 'priscillaWork', stage: 'assigned', placedAgoH: 7 }),
    // The store could not send one of the two lines: only that line is cancelled and refunded, the rest of the order goes on.
    withCancelled(
      4,
      open({
        key: 'E11',
        customer: E,
        lines: [{ sku: 'MB-TEA', qty: 2 }, { sku: 'MB-BTL' }],
        address: 'priscillaHome',
        stage: 'placed',
        placedAgoH: 18,
        after: async (c) => {
          const line = c.line('MB-BTL');
          if (line.fulfilment === 'open') await c.ctx.app.get(OrdersService).sellerCancel({ id: c.ctx.users.get('seller.b')!.id }, c.order.id, CANCEL.E11[0], [line.id]);
        },
      }),
    ),
    open({ key: 'E10', customer: E, lines: [{ sku: 'MK-LMP' }, { sku: 'MK-NBK', qty: 3 }], address: 'priscillaHome', stage: 'placed', placedAgoH: 1 }),

    // ── Olivier Kasongo (business buyer, French): bulk, two stores, a coupon ─────────────────────────────────────────────────
    delivered({
      key: 'K1',
      customer: K,
      lines: [{ sku: 'MB-NBK', qty: 40 }, { sku: 'MB-PNT', qty: 30 }],
      address: 'kasongoDepot',
      placedDays: 70,
      deliveredDays: 67,
      before: funded({ amount: 2000, via: 'airtel_money', agoH: day(72) }),
      after: async (c) => {
        await rated(c, 'MB-NBK', 4, REVIEW.K1, 'fr', day(65));
      },
    }),
    delivered({
      key: 'K2',
      customer: K,
      lines: [{ sku: 'MC-CHG', qty: 15 }, { sku: 'MC-FAN', qty: 3 }, { sku: 'MB-BTL', qty: 10 }],
      address: 'kasongoDepot',
      placedDays: 52,
      deliveredDays: 49,
    }),
    // Four kettles delivered, a return asked for and waiting for support.
    delivered({
      key: 'K3',
      customer: K,
      lines: [{ sku: 'MC-KTL', qty: 4 }, { sku: 'MC-IRN', qty: 4 }],
      address: 'kasongoDepot',
      placedDays: 36,
      deliveredDays: 33,
      before: funded({ amount: 1500, via: 'orange_money', agoH: day(37) }),
      after: (c) => returnTo(c, 'MC-KTL', CASE.K3, 'fr', 'waiting'),
    }),
    delivered({
      key: 'K4',
      customer: K,
      lines: [{ sku: 'MK-SHB', qty: 24 }, { sku: 'MK-SOP', qty: 50 }],
      address: 'kasongoHome',
      promo: 'MAISON5',
      placedDays: 20,
      deliveredDays: 17,
    }),
    delivered({
      key: 'K5',
      customer: K,
      lines: [{ sku: 'MK-NBK', qty: 30 }, { sku: 'MB-NBK', qty: 30 }],
      address: 'kasongoDepot',
      placedDays: 9,
      deliveredDays: 6,
    }),
    // Express (store C to the same commune): made only while express delivery is on, like the other express orders.
    open({ key: 'K6', customer: K, lines: [{ sku: 'MC-CHG', qty: 10 }], address: 'kasongoDepot', stage: 'out', placedAgoH: 5, express: true }),
    // Packed by the store and waiting for the rider (the package is "ready").
    open({ key: 'K8', customer: K, lines: [{ sku: 'MB-BTL', qty: 6 }, { sku: 'MB-PNT', qty: 2 }], address: 'kasongoDepot', stage: 'ready', placedAgoH: 8 }),
    open({ key: 'K7', customer: K, lines: [{ sku: 'MB-TOW', qty: 12 }, { sku: 'MB-BIN', qty: 4 }], address: 'kasongoDepot', stage: 'placed', placedAgoH: 12 }),

    // ── Fabrice Lumbu: only cancelled and returned history ─────────────────────────────────────────────────────────────────
    // Cancelled by the customer before anyone packed it: refunded to the wallet.
    withCancelled(2, {
      key: 'N1',
      customer: N,
      lines: [{ sku: 'MK-SNK', variant: 'Size: 41' }, { sku: 'MK-SHB' }],
      address: 'fabriceHome',
      stage: 'cancelled',
      placedAgoH: day(58),
      before: funded({ amount: 20, via: 'welcome', agoH: day(61) }, { amount: 200, via: 'airtel_money', agoH: day(60) }),
    }),
    // Cancelled by the store (out of stock): every line, refunded.
    withCancelled(7, {
      key: 'N2',
      customer: N,
      lines: [{ sku: 'MB-FLR', qty: 3 }, { sku: 'MB-PNT' }],
      address: 'fabriceHome',
      stage: 'placed',
      placedAgoH: day(45),
      after: async (c) => {
        if (c.order.status !== 'cancelled')
          await c.ctx.app.get(OrdersService).sellerCancel({ id: c.ctx.users.get('seller.b')!.id }, c.order.id, CANCEL.N2[0]);
      },
    }),
    // Cancelled by KOMORIKO support (the address could not be confirmed), with the reason, refunded.
    withCancelled(5, {
      key: 'N3',
      customer: N,
      lines: [{ sku: 'MC-FAN' }, { sku: 'MC-CHG' }],
      address: 'fabriceHome',
      stage: 'placed',
      placedAgoH: day(33),
      after: async (c) => {
        if (c.order.status !== 'cancelled')
          await c.ctx.app.get(OrdersService).adminCancel(viewerOf(c, 'admin.operations'), c.order.id, CANCEL.N3[0]);
      },
    }),
    // A delivered order whose only line came back: status "returned", refunded to the wallet.
    delivered({
      key: 'N4',
      customer: N,
      lines: [{ sku: 'MK-BAG' }],
      address: 'fabriceHome',
      placedDays: 24,
      deliveredDays: 21,
      after: (c) => returnTo(c, 'MK-BAG', CASE.N4, 'en', 'refunded'),
    }),
    // Nobody could deliver it (three attempts): cancelled and refunded.
    withCancelled(30, {
      key: 'N5',
      customer: N,
      lines: [{ sku: 'MK-YOG' }, { sku: 'MK-NBK', qty: 2 }],
      address: 'fabriceHome',
      stage: 'placed',
      placedAgoH: day(14),
      after: async (c) => {
        if (c.order.status === 'cancelled') return;
        await c.driver.drive(c.order.id, 'at_hub');
        for (const why of ['Customer not reachable', 'Customer not reachable', 'Wrong address']) {
          const now = await c.ctx.ds.getRepository(Order).findOne({ where: { id: c.order.id } });
          if (now?.status === 'cancelled') break;
          await c.driver.failDelivery(c.order.id, why);
        }
      },
    }),

    // ── Sarah Whitfield (international, mobile money): every state a payment can be in ───────────────────────────────────────
    // The mobile-money ones are made only on a server with the sandbox or manual provider; the wallet ones always.
    delivered({
      key: 'T0',
      customer: T,
      lines: [{ sku: 'MB-BTL' }, { sku: 'MK-PLM' }],
      address: 'sarahHome',
      placedDays: 12,
      deliveredDays: 10,
      before: funded({ amount: 150, via: 'airtel_money', agoH: day(13) }),
      // A dispute that support refused: the delivery code proves both items were handed over.
      after: (c) => disputeSettled(c, CASE.T0, 'refused'),
    }),
    // Paid with Airtel Money, delivered.
    withTimeline({
      key: 'T1',
      customer: T,
      lines: [{ sku: 'MK-SHB' }, { sku: 'MK-HNY' }, { sku: 'MB-TEA' }],
      address: 'sarahHome',
      stage: 'delivered',
      placedAgoH: day(6),
      deliveredAgoH: day(4),
      pay: { method: 'airtel_money', phone: '+243 900 000 146', outcome: 'paid' },
      afterCreate: settlePayment,
      after: async (c) => {
        await rated(c, 'MK-SHB', 5, REVIEW.T1, 'en', day(3));
      },
    }),
    // Paid with Orange Money, out for delivery.
    open({
      key: 'T2',
      customer: T,
      lines: [{ sku: 'MK-LMP' }, { sku: 'MK-PWR' }],
      address: 'sarahHome',
      stage: 'out',
      placedAgoH: 26,
      pay: { method: 'orange_money', phone: '+243 900 000 146', outcome: 'paid' },
      afterCreate: settlePayment,
    }),
    // Declined by the subscriber: cancelled, nothing was charged.
    withCancelled(0.1, {
      key: 'T4',
      customer: T,
      lines: [{ sku: 'MK-DRS', variant: 'Size: S · Colour: Blue' }],
      address: 'sarahHome',
      stage: 'placed',
      placedAgoH: 29,
      pay: { method: 'airtel_money', phone: '+243 900 000 146', outcome: 'failed' },
      afterCreate: settlePayment,
    }),
    // Nobody approved the charge in time: expired and cancelled.
    withCancelled(0.3, {
      key: 'T5',
      customer: T,
      lines: [{ sku: 'MK-EAR' }, { sku: 'MK-SOP', qty: 2 }],
      address: 'sarahHome',
      stage: 'placed',
      placedAgoH: 40,
      pay: { method: 'orange_money', phone: '+243 900 000 146', outcome: 'expired' },
      afterCreate: settlePayment,
    }),
    // Awaiting payment: the charge is waiting for the customer's approval on the phone. (Placed minutes ago, so that the platform's own
    // timeout, 15 minutes with the sandbox and 24 hours in manual mode, has not closed it yet.)
    {
      key: 'T3',
      customer: T,
      lines: [{ sku: 'MC-KTL' }, { sku: 'MC-CHG' }],
      address: 'sarahHome',
      stage: 'placed',
      placedAgoH: 0.05,
      pay: { method: 'vodacom_mpesa', phone: '+243 900 000 146', outcome: 'pending' },
      afterCreate: settlePayment,
    },
    open({ key: 'T6', customer: T, lines: [{ sku: 'MK-BLL' }], address: 'sarahHome', stage: 'placed', placedAgoH: 3 }),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────────
// What the new customers have besides orders
// ─────────────────────────────────────────────────────────────────────────────────

const NEW_CUSTOMERS = [V, J, E, K, N, T, 'customer.newfr', 'customer.cart'] as const;

/**
 * The wallets of the two customers who have no order, wishlists, carts, followed stores, support tickets, and the read / unread
 * mix of every new customer's notices. Each part checks what exists first (a second run changes nothing).
 */
export async function seedCustomerExtras(ctx: DemoCtx): Promise<void> {
  const { ds, app } = ctx;
  const user = (key: string) => ctx.users.get(key)!;
  const pid = (sku: string) => ctx.products.get(sku)!.id;

  // Wallets of the customers with no order (the others are funded just before their first order).
  for (const [key, credits] of [
    ['customer.newfr', [{ amount: 5, via: 'welcome', agoH: day(13) }, { amount: 20, via: 'airtel_money', agoH: day(12) }]],
    ['customer.cart', [{ amount: 5, via: 'welcome', agoH: day(7) }, { amount: 60, via: 'orange_money', agoH: day(6) }]],
  ] as [string, Credit[]][]) {
    const u = user(key);
    const has = await ds.getRepository(WalletTransaction).count({ where: { userId: u.id } });
    if (!has) for (const x of credits) await credit(ctx, u, x);
  }

  // Wishlists (one entry is out of stock: the "notify me" state) and carts with a coupon the customer can apply.
  const wl = app.get(WishlistService);
  for (const [key, skus] of Object.entries({
    [V]: ['MK-PHN', 'MG-DRM', 'MK-BAG'],
    [E]: ['MK-PHN', 'MB-BIN'],
    'customer.newfr': ['MK-SHB', 'MK-HNY', 'MK-DRS'],
    'customer.cart': ['MK-SNK', 'MK-MAT'],
  })) {
    const u = user(key);
    const have = await ds.query('SELECT COUNT(*) AS n FROM wishlist_items WHERE userId = ?', [u.id]);
    if (Number(have[0].n) === 0) for (const sku of skus) await wl.toggle(u.id, pid(sku));
  }
  const cart = app.get(CartService);
  const entry = (sku: string, qty: number) => ({ productId: pid(sku), qty, variant: 'Default', priceWhenAdded: ctx.products.get(sku)!.price });
  for (const [key, c] of Object.entries({
    [V]: { lines: [entry('MK-HNY', 2), entry('MK-COF', 1)], saved: [entry('MK-SOP', 3)] },
    [E]: { lines: [entry('MK-PLT', 1)], saved: [entry('MK-MAT', 1)] },
    // Worth more than the minimum of MAISON5 ($30 of the store's goods) and of DEMOWELCOME ($15): both apply at checkout.
    'customer.cart': { lines: [entry('MK-LMP', 1), entry('MB-TEA', 2), entry('MK-OIL', 1)], saved: [entry('MK-YOG', 1), entry('MB-BTL', 1)] },
  }) as [string, { lines: ReturnType<typeof entry>[]; saved: ReturnType<typeof entry>[] }][]) {
    const u = user(key);
    const have = await ds.query('SELECT COUNT(*) AS n FROM cart_lines WHERE userId = ?', [u.id]);
    if (Number(have[0].n) === 0) await cart.set(u.id, { lines: c.lines, saved: c.saved });
  }

  const follows = app.get(FollowsService);
  for (const [key, stores] of Object.entries({ [V]: ['A', 'B'], [E]: ['C'], [J]: ['A'] })) {
    const u = user(key);
    for (const s of stores) {
      const sellerId = ctx.stores.get(s)!.id;
      const have = await ds.query('SELECT COUNT(*) AS n FROM store_follows WHERE userId = ? AND sellerId = ?', [u.id, sellerId]);
      if (Number(have[0].n) === 0) await follows.toggle({ id: u.id }, sellerId, true);
    }
  }

  await tickets(ctx);

  // Older notices are read, the newest stay unread (the first half of each customer's list, oldest first).
  for (const key of NEW_CUSTOMERS) {
    const u = user(key);
    const rows: { id: string; read: number }[] = await ds.query('SELECT id, `read` FROM notifications WHERE userId = ? ORDER BY createdAt ASC', [u.id]);
    if (rows.some((r) => r.read)) continue; // already mixed
    const older = rows.slice(0, Math.floor(rows.length / 2)).map((r) => r.id);
    if (older.length) await ds.query(`UPDATE notifications SET \`read\` = 1 WHERE id IN (${older.map(() => '?').join(',')})`, older);
  }
  log('✓ customer demo: wallets, wishlists, carts, follows, tickets and read notices of the new customers');
}

async function tickets(ctx: DemoCtx): Promise<void> {
  const support = ctx.app.get(SupportService);
  const repo = ctx.ds.getRepository(SupportTicket);
  const agentUser = ctx.users.get('admin.support')!;
  const agent = { id: agentUser.id, name: agentUser.name, role: agentUser.role as string };
  const open = async (
    key: string,
    subject: Pair,
    message: Pair,
    lang: 'en' | 'fr',
    category: string,
    flow: (id: string) => Promise<void>,
    agoH: number,
  ) => {
    const u = ctx.users.get(key)!;
    if (await repo.findOne({ where: { userId: u.id, subject: say(subject, lang) } })) return;
    const t = await support.open({ id: u.id, name: u.name, role: u.role }, { subject: say(subject, lang), message: say(message, lang), category });
    await flow(t.id);
    // Date the whole thread: the opening message at `agoH` ago, the answer an hour later.
    const sec = Math.round((new Date(t.createdAt).getTime() - (Date.now() - agoH * H)) / 1000);
    await ctx.ds.query(`UPDATE support_tickets SET createdAt = DATE_SUB(createdAt, INTERVAL ${sec} SECOND), updatedAt = DATE_SUB(updatedAt, INTERVAL ${sec} SECOND) WHERE id = ?`, [t.id]);
    await ctx.ds.query(`UPDATE support_messages SET createdAt = DATE_SUB(createdAt, INTERVAL ${sec} SECOND) WHERE ticketId = ?`, [t.id]);
    await ctx.ds.query('UPDATE notifications SET createdAt = DATE_SUB(createdAt, INTERVAL ? SECOND) WHERE entityId = ?', [sec, t.id]);
  };
  // Answered and closed (French).
  await open(V, TICKET.V_SUBJECT, TICKET.V_MESSAGE, 'fr', 'orders', async (id) => {
    await support.reply(id, agent, say(TICKET.V_REPLY, 'fr'));
    await support.setStatus(id, 'closed');
  }, 100);
  // Open, waiting for the answer (English).
  await open(E, TICKET.E_SUBJECT, TICKET.E_MESSAGE, 'en', 'orders', async () => undefined, 9);
  // Answered, not closed (French): the customer may still reply.
  await open('customer.newfr', TICKET.A_SUBJECT, TICKET.A_MESSAGE, 'fr', 'payment', async (id) => {
    await support.reply(id, agent, say(TICKET.A_REPLY, 'fr'));
  }, 30);
}
