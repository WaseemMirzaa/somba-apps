import { DisputesService } from '../../disputes/disputes.service';
import { ExchangesService } from '../../flows/exchanges.service';
import { ReplacementsService } from '../../flows/replacements.service';
import { CaseThreadService } from '../../sellers/case-thread.service';
import { WalletService } from '../../wallet/wallet.service';
import { Dispute, Exchange, Replacement, Seller, WalletTransaction } from '../entities';
import type { CaseKind } from '../entities';
import { log } from './demo-common';
import type { DemoCtx } from './demo-ctx';
import { REASONS, THREAD } from './demo-aftersale-texts';
import type { OrderSpec, Scenario } from './demo-commerce';

/**
 * The seller portal's read-only after-sale view, as demo data (docs/contracts/admin-controls.md §13). On each active demo store
 * (A Maison Kinshasa, B Limete Grossiste, C Ndolo Électro): three returns at different stages (waiting for support; approved and
 * on the road to the warehouse; received and refunded, with the leg that brings the goods back to the store still open), two exchanges (one pending, one approved with a
 * price difference) and two replacements (one pending, one approved). Every case hangs off a demo-owned order (made here, delivered
 * a few days ago), so `seed:demo:remove` takes it out with the rest. Private seller <-> support threads are written as history
 * (no push, no notice), some unread for each side, and one case has a customer <-> support exchange beside them.
 *
 * The switches: the six platform defaults (four sections, customer conversation, reasons) are NEVER touched (they stay off). Store A
 * carries an override with all four sections, the conversation and the reasons ON; store C returns and reasons only; store B none (it
 * follows the default: off), so the three states can be tried at once.
 */

const H = 3_600_000;
type Address = OrderSpec['address'];
type Pair = readonly [en: string, fr: string];

/** The customers' wallets get this once, so the extra orders cannot run them dry (dated with the first top-ups). */
const WALLET_BONUS = 260;
const BONUS_NOTE = 'Demo starter credit (not real money)';
export const AFTER_SALE_CUSTOMERS = ['reviewer.1', 'reviewer.2', 'reviewer.3', 'reviewer.4', 'customer.fr'] as const;

/**
 * Store A: every section on, and it also sees the customer <-> support conversation and the customers' reasons and photos.
 * Store C: returns only, with the reasons but not the conversation. Store B: none (follows the default, all off).
 */
export const STORE_OVERRIDES: Record<string, Record<string, boolean>> = {
  A: { returns: true, exchanges: true, replacements: true, express: true, customerThread: true, reasons: true },
  C: { returns: true, reasons: true },
};

const ADDRESS: Record<string, Address> = {
  'reviewer.1': 'limete',
  'reviewer.2': 'kalamu',
  'reviewer.3': 'bandalungwa',
  'reviewer.4': 'kintambo',
  'customer.fr': 'ngaliema',
};

type ReturnStage = 'waiting' | 'transit' | 'refunded';
type Swap = 'pending' | 'approved';

interface Thread {
  side: 'seller' | 'support';
  text: Pair;
  /** Hours after the case was opened. */
  afterH: number;
  /** Has the other side read it? (`false` = unread for them.) */
  read: boolean;
}

interface CaseSpec {
  key: string;
  store: 'A' | 'B' | 'C';
  customer: (typeof AFTER_SALE_CUSTOMERS)[number];
  sku: string;
  qty: number;
  /** A second, cheap item of the same store on the order (a basket of one product is what other demo checks look for). */
  also: string;
  kind: CaseKind;
  reason: Pair;
  /** Returns: how far support and the goods have got. */
  stage?: ReturnStage;
  /** Exchanges and replacements: still pending or approved. */
  swap?: Swap;
  /** Exchange: the product asked for in exchange. */
  toSku?: string;
  ageH: number;
  thread?: Thread[];
  /** A customer <-> support exchange on the case (so the two threads are visibly separate). */
  customerThread?: boolean;
}

const th = (side: Thread['side'], text: Pair, afterH: number, read: boolean): Thread => ({ side, text, afterH, read });

const CASES: CaseSpec[] = [
  // ── Store A: Maison Kinshasa ──
  { key: 'AS-A1', store: 'A', customer: 'reviewer.1', sku: 'MK-OIL', qty: 3, also: 'MK-SOP', kind: 'return', stage: 'waiting', reason: REASONS.RA1, ageH: 30, customerThread: true, thread: [th('seller', THREAD.S1, 2, true), th('support', THREAD.K1, 4, true), th('seller', THREAD.S2, 6, false)] },
  { key: 'AS-A2', store: 'A', customer: 'reviewer.2', sku: 'MK-SOP', qty: 3, also: 'MK-PLM', kind: 'return', stage: 'transit', reason: REASONS.RA2, ageH: 60, thread: [th('support', THREAD.K2, 20, false)] },
  { key: 'AS-A3', store: 'A', customer: 'reviewer.3', sku: 'MK-COF', qty: 3, also: 'MK-HNY', kind: 'return', stage: 'refunded', reason: REASONS.RA3, ageH: 90, thread: [th('support', THREAD.K6, 40, true), th('seller', THREAD.S6, 44, true)] },
  { key: 'AS-A4', store: 'A', customer: 'reviewer.4', sku: 'MK-NBK', qty: 3, also: 'MK-SOP', kind: 'exchange', swap: 'pending', toSku: 'MK-EAR', reason: REASONS.XA4, ageH: 26 },
  { key: 'AS-A5', store: 'A', customer: 'customer.fr', sku: 'MK-PLM', qty: 2, also: 'MK-HNY', kind: 'exchange', swap: 'approved', toSku: 'MK-OIL', reason: REASONS.XA5, ageH: 50, thread: [th('seller', THREAD.S4, 5, true), th('support', THREAD.K4, 7, false)] },
  { key: 'AS-A6', store: 'A', customer: 'reviewer.1', sku: 'MK-PLT', qty: 2, also: 'MK-SOP', kind: 'replacement', swap: 'pending', reason: REASONS.PA6, ageH: 22 },
  { key: 'AS-A7', store: 'A', customer: 'reviewer.2', sku: 'MK-LMP', qty: 2, also: 'MK-SOP', kind: 'replacement', swap: 'approved', reason: REASONS.PA7, ageH: 46, thread: [th('support', THREAD.K5, 8, false), th('seller', THREAD.S5, 10, false)] },
  // ── Store B: Limete Grossiste ──
  { key: 'AS-B1', store: 'B', customer: 'reviewer.1', sku: 'MB-PNT', qty: 3, also: 'MB-FLR', kind: 'return', stage: 'waiting', reason: REASONS.RB1, ageH: 28, thread: [th('seller', THREAD.S1, 3, false)] },
  { key: 'AS-B2', store: 'B', customer: 'reviewer.3', sku: 'MB-TEA', qty: 2, also: 'MB-PNT', kind: 'return', stage: 'transit', reason: REASONS.RB2, ageH: 58, thread: [th('seller', THREAD.S3, 18, true), th('support', THREAD.K3, 22, false)] },
  { key: 'AS-B3', store: 'B', customer: 'reviewer.4', sku: 'MB-FLR', qty: 2, also: 'MB-PNT', kind: 'return', stage: 'refunded', reason: REASONS.RB3, ageH: 88 },
  { key: 'AS-B4', store: 'B', customer: 'reviewer.2', sku: 'MB-BIN', qty: 2, also: 'MB-PNT', kind: 'exchange', swap: 'pending', toSku: 'MB-BTL', reason: REASONS.XB4, ageH: 24 },
  { key: 'AS-B5', store: 'B', customer: 'reviewer.1', sku: 'MB-NBK', qty: 3, also: 'MB-PNT', kind: 'exchange', swap: 'approved', toSku: 'MB-BIN', reason: REASONS.XB5, ageH: 48 },
  { key: 'AS-B6', store: 'B', customer: 'customer.fr', sku: 'MB-TOW', qty: 2, also: 'MB-PNT', kind: 'replacement', swap: 'pending', reason: REASONS.PB6, ageH: 21 },
  { key: 'AS-B7', store: 'B', customer: 'reviewer.3', sku: 'MB-BTL', qty: 3, also: 'MB-PNT', kind: 'replacement', swap: 'approved', reason: REASONS.PB7, ageH: 44 },
  // ── Store C: Ndolo Électro ──
  { key: 'AS-C1', store: 'C', customer: 'reviewer.1', sku: 'MC-KTL', qty: 2, also: 'MC-IRN', kind: 'return', stage: 'waiting', reason: REASONS.RC1, ageH: 27, thread: [th('seller', THREAD.S6, 3, false), th('support', THREAD.K7, 5, true)] },
  { key: 'AS-C2', store: 'C', customer: 'reviewer.2', sku: 'MC-IRN', qty: 2, also: 'MC-KTL', kind: 'return', stage: 'transit', reason: REASONS.RC2, ageH: 56, thread: [th('support', THREAD.K2, 19, false)] },
  { key: 'AS-C3', store: 'C', customer: 'reviewer.3', sku: 'MC-CHG', qty: 3, also: 'MC-IRN', kind: 'return', stage: 'refunded', reason: REASONS.RC3, ageH: 86 },
  { key: 'AS-C4', store: 'C', customer: 'reviewer.4', sku: 'MC-FAN', qty: 2, also: 'MC-KTL', kind: 'exchange', swap: 'pending', toSku: 'MC-IRN', reason: REASONS.XC4, ageH: 25 },
  { key: 'AS-C5', store: 'C', customer: 'customer.fr', sku: 'MC-KTL', qty: 1, also: 'MC-IRN', kind: 'exchange', swap: 'approved', toSku: 'MC-FAN', reason: REASONS.XC5, ageH: 47, thread: [th('seller', THREAD.S4, 5, true), th('support', THREAD.K4, 7, false)] },
  { key: 'AS-C6', store: 'C', customer: 'reviewer.4', sku: 'MC-CHG', qty: 2, also: 'MC-IRN', kind: 'replacement', swap: 'pending', reason: REASONS.PC6, ageH: 20 },
  { key: 'AS-C7', store: 'C', customer: 'customer.fr', sku: 'MC-IRN', qty: 1, also: 'MC-CHG', kind: 'replacement', swap: 'approved', reason: REASONS.PC7, ageH: 43 },
];

const viewer = (c: Scenario, key: string) => {
  const u = c.ctx.users.get(key)!;
  return { id: u.id, role: u.role as string, name: u.name, hubId: (u.hubId ?? null) as string | null };
};

/** Every case hangs off its own delivered order: the order specs the commerce seed makes (and finds again by their lines). */
export function afterSaleSpecs(): OrderSpec[] {
  return CASES.map((k) => ({
    key: k.key,
    customer: k.customer,
    lines: [{ sku: k.sku, qty: k.qty }, { sku: k.also }],
    address: ADDRESS[k.customer],
    stage: 'delivered' as const,
    placedAgoH: k.ageH + 24,
    deliveredAgoH: k.ageH + 8,
    caseAgoH: k.ageH,
    after: (c: Scenario) => runCase(c, k),
  }));
}

/** A little credit for the customers who get the extra orders (once; dated with their first top-ups). */
export async function topUpForAfterSale(ctx: DemoCtx): Promise<void> {
  const wallet = ctx.app.get(WalletService);
  const rows = ctx.ds.getRepository(WalletTransaction);
  for (const key of AFTER_SALE_CUSTOMERS) {
    const user = ctx.users.get(key);
    if (!user) continue;
    const have = await rows.findOne({ where: { userId: user.id, description: BONUS_NOTE, amount: WALLET_BONUS } });
    if (have) continue;
    const tx = await wallet.apply(user.id, 'cashback', WALLET_BONUS, BONUS_NOTE);
    await ctx.ds.query('UPDATE wallet_transactions SET createdAt = ? WHERE id = ?', [new Date(Date.now() - 78 * 24 * H), tx.id]);
  }
}

async function runCase(c: Scenario, k: CaseSpec): Promise<void> {
  const { ds, app } = c.ctx;
  const item = c.line(k.sku);
  const customer = { id: c.user.id, name: c.user.name, role: 'customer' };
  let caseId: string;
  if (k.kind === 'return') {
    const disputes = app.get(DisputesService);
    const repo = ds.getRepository(Dispute);
    let d = await repo.findOne({ where: { orderId: c.order.id, type: 'return' } });
    if (!d) {
      const view = await disputes.open(customer, { orderId: c.order.id, type: 'return', reason: k.reason[0], category: 'damaged', items: [{ itemId: item.id, qty: item.qty }] });
      d = (await repo.findOne({ where: { id: view.id } }))!;
    }
    caseId = d.id;
    if (k.stage !== 'waiting' && d.status === 'open' && d.stage === 'awaiting_support') {
      await disputes.adminDecideReturn(viewer(c, 'admin.support'), d.id, true, '');
    }
    let fresh = (await repo.findOne({ where: { id: d.id } }))!;
    if (fresh.status === 'open' && fresh.stage === 'pickup') {
      // `transit`: the rider has the goods and is on the road to the warehouse (stage "pickup");
      // `refunded`: the goods reach the warehouse, the return is received and refunded, and the leg that brings them back to the
      // store is open (a `return_to_seller` leg waiting for a rider).
      await c.driver.driveSideLegs({ disputeId: d.id }, k.stage === 'transit' ? 'road' : 'done', 1);
      fresh = (await repo.findOne({ where: { id: d.id } }))!;
    }
    // A return received but not graded yet (the warehouse grades it by hand) is graded here, so the refund follows.
    if (k.stage === 'refunded' && fresh.status === 'open' && fresh.receivedAt && !fresh.gradedAt) {
      const lines: { id: string }[] = await ds.query('SELECT id FROM dispute_items WHERE disputeId = ?', [d.id]);
      await disputes.grade(viewer(c, 'warehouse.supervisor'), d.id, lines.map((l) => ({ itemId: l.id, condition: 'resellable' })), '');
    }
  } else if (k.kind === 'exchange') {
    const repo = ds.getRepository(Exchange);
    let ex = await repo.findOne({ where: { orderId: c.order.id } });
    if (!ex) {
      const target = c.ctx.products.get(k.toSku!)!;
      const view = await app.get(ExchangesService).create(customer, { orderId: c.order.id, itemId: item.id, toSku: target.id, toName: target.name, reason: k.reason[0] });
      ex = (await repo.findOne({ where: { id: view.id } }))!;
    }
    caseId = ex.id;
    if (k.swap === 'approved' && ex.status === 'requested') {
      await app.get(ExchangesService).respond(viewer(c, 'admin.support'), ex.id, true, '');
      await c.driver.driveSideLegs({ exchangeId: ex.id }, 'assigned');
    }
  } else {
    const repo = ds.getRepository(Replacement);
    let rep = await repo.findOne({ where: { orderId: c.order.id } });
    if (!rep) {
      const view = await app.get(ReplacementsService).create(customer, { orderId: c.order.id, itemId: item.id, reason: k.reason[0], condition: 'Defective' });
      rep = (await repo.findOne({ where: { id: view.id } }))!;
    }
    caseId = rep.id;
    if (k.swap === 'approved' && rep.status === 'requested') {
      await app.get(ReplacementsService).respond(viewer(c, 'admin.support'), rep.id, true, '');
      await c.driver.driveSideLegs({ replacementId: rep.id }, 'assigned');
    }
  }
  const sellerOwner = c.ctx.users.get(`seller.${k.store.toLowerCase()}`)!;
  const support = c.ctx.users.get('admin.support')!;
  if (k.thread?.length) {
    // Times: after the case was opened (`ageH` hours ago), never in the future.
    await app.get(CaseThreadService).importHistory({
      kind: k.kind,
      caseId,
      messages: k.thread.map((m) => ({
        side: m.side,
        author: m.side === 'seller' ? { id: sellerOwner.id, name: sellerOwner.name } : { id: support.id, name: support.name },
        text: m.text[0],
        at: new Date(Date.now() - Math.max(0, k.ageH - m.afterH) * H),
        // unread for the OTHER side when `read` is false
        readBySeller: m.side === 'seller' ? true : m.read,
        readBySupport: m.side === 'support' ? true : m.read,
      })),
    });
  }
  if (k.customerThread && k.kind === 'return') {
    const disputes = app.get(DisputesService);
    const messages: { text: string }[] = await ds.query('SELECT text FROM dispute_messages WHERE disputeId = ?', [caseId]);
    if (!messages.some((m) => m.text === THREAD.C1[0])) {
      await disputes.reply(viewer(c, k.customer), caseId, THREAD.C1[0]);
      await disputes.reply(viewer(c, 'admin.support'), caseId, THREAD.K8[0]);
    }
  }
}

/**
 * The three states of the switches: an override on store A (all four sections), on store C (returns only), none on store B.
 * Writes only the stores' own column: the platform defaults (settings) are never touched.
 */
export async function seedStoreSwitches(ctx: DemoCtx): Promise<void> {
  const repo = ctx.ds.getRepository(Seller);
  for (const key of ['A', 'B', 'C']) {
    const store = ctx.stores.get(key);
    if (!store) continue;
    const want = STORE_OVERRIDES[key] ? JSON.stringify(STORE_OVERRIDES[key]) : null;
    const row = await repo.findOne({ where: { id: store.id } });
    if (row && row.afterSaleAccess !== want) await repo.update({ id: store.id }, { afterSaleAccess: want });
  }
  log('✓ seller portal switches: store A shows all four sections + the customer conversation + the reasons, store C returns + reasons, store B follows the default (off)');
}
