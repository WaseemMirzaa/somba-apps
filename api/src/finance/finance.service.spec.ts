import { mkdtempSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Order, OrderItem, Payout, PayoutStatementLine } from '../database/entities';
import type { Seller } from '../database/entities';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';
import { pdfText } from '../testing/pdf-text';
import { testTranslations } from '../testing/test-db';
import { OrderItemTranslationSubscriber } from '../translation/order-item-translation.subscriber';

const H = 3_600_000;

let w: World;
let shop: Seller;
let owner: { id: string; role: string };
let uploads: string;
beforeEach(async () => {
  uploads = mkdtempSync(join(tmpdir(), 'somba-uploads-'));
  process.env.UPLOAD_DIR = uploads;
  w = await commerceWorld();
  shop = await w.store('Kinshasa Traders', 'u-kt', { legalName: 'KT SARL', taxNumber: 'A123456B', rccm: 'CD/KIN/RCCM/22-B-1' });
  owner = { id: 'u-kt', role: 'seller' };
});
afterEach(async () => {
  delete process.env.UPLOAD_DIR;
  await w.ds.destroy();
});

let n = 0;
/** One order with one line of the seller's product; `updatedAt` is when it reached its status (= delivery time for delivered). */
async function sale(opts: { status?: string; hoursAgo?: number; price?: number; qty?: number; coupon?: number; pct?: number; name?: string; at?: Date } = {}) {
  const product = await w.product(shop, { name: opts.name ?? 'Phone case', price: opts.price ?? 10, stock: 100 });
  const price = opts.price ?? 10;
  const qty = opts.qty ?? 1;
  const pct = opts.pct ?? 10;
  const gross = price * qty - (opts.coupon ?? 0);
  const order = await w.ds.getRepository(Order).save(
    w.ds.getRepository(Order).create({ reference: `SOM-${1000 + ++n}`, customerId: 'c1', customerName: 'Jean Mukendi', status: (opts.status ?? 'delivered') as never, shippingAddress: JSON.stringify({ city: 'Kinshasa' }) }),
  );
  const item = await w.ds.getRepository(OrderItem).save(
    w.ds.getRepository(OrderItem).create({
      orderId: order.id,
      productId: product.id,
      productName: product.name,
      variant: 'Default',
      qty,
      priceUsd: price,
      sellerId: shop.id,
      couponDiscountUsd: opts.coupon ?? 0,
      commissionPct: pct,
      commissionUsd: Number(((gross * pct) / 100).toFixed(2)),
    }),
  );
  const at = opts.at ?? new Date(Date.now() - (opts.hoursAgo ?? 100) * H);
  await w.ds.getRepository(Order).update({ id: order.id }, { updatedAt: at, createdAt: at });
  return { order, item, product };
}

/** A payout carrying the given items on its statement. */
async function payoutWith(status: string, items: OrderItem[], extra: Partial<Payout> = {}) {
  const payout = await w.ds.getRepository(Payout).save(
    w.ds.getRepository(Payout).create({ reference: `PO-${++n}`, sellerId: 'u-kt', sellerName: 'KT', amountUsd: 5, method: 'wallet', status: status as never, ...extra }),
  );
  for (const i of items) {
    await w.ds.getRepository(PayoutStatementLine).save(
      w.ds.getRepository(PayoutStatementLine).create({
        payoutId: payout.id, sellerId: 'u-kt', orderItemId: i.id, orderId: i.orderId, orderReference: 'x', productName: i.productName, variant: 'Default', qty: i.qty, kind: 'sale',
        grossUsd: i.priceUsd * i.qty, commissionPct: i.commissionPct, commissionUsd: i.commissionUsd, netUsd: i.priceUsd * i.qty - i.commissionUsd,
        paidOutAt: status === 'paid' ? new Date() : null,
      }),
    );
  }
  return payout;
}

const states = async (input: Record<string, unknown> = {}) => (await w.finance.earnings(owner, input)).items.map((i) => [i.orderStatus === 'delivered' || i.orderStatus === 'returned' ? i.orderStatus : 'open', i.state]);

describe('earnings follow the clearance hold', () => {
  it('delivered money is "clearing" until `hold` hours after delivery, then "available"', async () => {
    w.settings.payoutClearanceHours = '48';
    const young = await sale({ hoursAgo: 10, name: 'Young' });
    const old = await sale({ hoursAgo: 100, name: 'Old' });
    const r = await w.finance.earnings(owner);
    const byName = Object.fromEntries(r.items.map((i) => [i.productName, i]));
    expect(byName.Young.state).toBe('clearing');
    expect(byName.Young.clearanceEndsAt?.getTime()).toBeGreaterThan(Date.now() + 37 * H);
    expect(byName.Young.clearanceEndsAt?.getTime()).toBeLessThan(Date.now() + 39 * H);
    expect(byName.Old.state).toBe('available');
    expect(r.holdHours).toBe(48);
    expect(r.totals).toMatchObject({ clearingUsd: 9, availableUsd: 9 });
    // The same rule decides what can be withdrawn.
    const bal = await w.payouts.available('u-kt');
    expect(bal).toMatchObject({ earned: 9, available: 9, clearingUsd: 9, holdHours: 48, minPayoutUsd: 1, inProgressUsd: 0 });
    expect(bal.nextClearanceAt?.getTime()).toBe(byName.Young.clearanceEndsAt?.getTime());
    void young; void old;
  });

  it('with no hold, delivered is immediately available', async () => {
    w.settings.payoutClearanceHours = '0';
    await sale({ hoursAgo: 0.01 });
    expect((await w.finance.earnings(owner)).items[0].state).toBe('available');
  });

  it('shows every state, in progress and returned included, and leaves cancelled out', async () => {
    w.settings.payoutClearanceHours = '48';
    await sale({ status: 'out_for_delivery', hoursAgo: 1, name: 'A' });
    await sale({ status: 'delivered', hoursAgo: 5, name: 'B' });
    await sale({ status: 'delivered', hoursAgo: 90, name: 'C' });
    await sale({ status: 'returned', hoursAgo: 90, name: 'D' });
    await sale({ status: 'cancelled', hoursAgo: 90, name: 'E' });
    const r = await w.finance.earnings(owner);
    expect(Object.fromEntries(r.items.map((i) => [i.productName, i.state]))).toEqual({ A: 'in_progress', B: 'clearing', C: 'available', D: 'returned' });
    expect(r.total).toBe(4);
    expect(r.totals).toEqual({ inProgressUsd: 9, clearingUsd: 9, availableUsd: 9, inPayoutUsd: 0, paidOutUsd: 0, returnedUsd: 9 });
  });

  it('a line on a requested / sending payout is in_payout; on a paid one paid_out (with the date); a rejected one frees the line', async () => {
    const a = await sale({ name: 'A' });
    const b = await sale({ name: 'B' });
    const c = await sale({ name: 'C' });
    const d = await sale({ name: 'D' });
    await payoutWith('requested', [a.item]);
    await payoutWith('sending', [b.item]);
    const paid = await payoutWith('paid', [c.item]);
    await payoutWith('rejected', [d.item]);
    const r = await w.finance.earnings(owner);
    const by = Object.fromEntries(r.items.map((i) => [i.productName, i]));
    expect([by.A.state, by.B.state, by.C.state, by.D.state]).toEqual(['in_payout', 'in_payout', 'paid_out', 'available']);
    expect(by.C.payout).toMatchObject({ id: paid.id, status: 'paid' });
    expect(by.C.paidOutAt).toBeInstanceOf(Date);
    expect(by.D.payout).toBeNull();
    expect(r.totals).toMatchObject({ inPayoutUsd: 18, paidOutUsd: 9, availableUsd: 9 });
  });

  it('a payout that is really paid marks its statement lines paid out (paidOutAt)', async () => {
    await sale({ hoursAgo: 100 });
    const payout = await w.payouts.request({ id: 'u-kt', name: 'KT' }, 5, 'wallet');
    expect((await w.finance.earnings(owner)).items[0]).toMatchObject({ state: 'in_payout', paidOutAt: null });
    await w.payouts.approve(payout.id);
    const line = (await w.finance.earnings(owner)).items[0];
    expect(line.state).toBe('paid_out');
    expect(line.paidOutAt).toBeInstanceOf(Date);
    // The super admin and finance heard about the request and the payment.
    expect(w.notes.filter((x) => x.to === 'role:admin').map((x) => x.title)).toEqual(['Payout requested', 'Payout settled']);
    expect(w.notes.find((x) => x.title === 'Payout settled')?.body).toMatch(/^PO-\d+ · KT · \$5\.00 was paid\.$/);
    expect(w.notes.filter((x) => x.to === 'role:admin_finance').map((x) => x.title)).toEqual(['Payout requested']);
  });

  it('a rejected payout tells the super admin and never marks lines paid', async () => {
    await sale({ hoursAgo: 100 });
    const payout = await w.payouts.request({ id: 'u-kt', name: 'KT' }, 5, 'wallet');
    await w.payouts.reject(payout.id, 'Wrong account');
    expect(w.notes.filter((x) => x.to === 'role:admin').map((x) => x.title)).toEqual(['Payout requested', 'Payout declined']);
    expect(w.notes.find((x) => x.title === 'Payout declined')?.body).toMatch(/was rejected \(Wrong account\)\.$/);
    expect((await w.finance.earnings(owner)).items[0]).toMatchObject({ state: 'available', paidOutAt: null });
  });

  it('a store coupon comes off the seller: gross, commission and net all follow it', async () => {
    const { order } = await sale({ price: 100, qty: 2, coupon: 40, pct: 10, hoursAgo: 100 });
    const line = (await w.finance.earnings(owner)).items[0];
    expect(line).toMatchObject({ orderId: order.id, grossUsd: 160, couponUsd: 40, commissionUsd: 16, netUsd: 144 });
    expect((await w.payouts.available('u-kt')).available).toBe(144);
    const payout = await w.payouts.request({ id: 'u-kt', name: 'KT' }, 100, 'wallet');
    const st = await w.payouts.statement(payout.id, { id: 'u-kt', role: 'seller' });
    expect(st.lines[0]).toMatchObject({ grossUsd: 160, commissionUsd: 16, netUsd: 144 });
  });
});

describe('earnings: paging and filters happen in the database', () => {
  it('pages, and counts the whole', async () => {
    for (let i = 0; i < 7; i++) await sale({ hoursAgo: 100 + i, name: `P${i}` });
    const p1 = await w.finance.earnings(owner, { limit: 3, offset: 0 });
    const p3 = await w.finance.earnings(owner, { limit: 3, offset: 6 });
    expect(p1).toMatchObject({ total: 7, limit: 3, offset: 0 });
    expect(p1.items.map((i) => i.productName)).toEqual(['P0', 'P1', 'P2']); // newest first
    expect(p3.items.map((i) => i.productName)).toEqual(['P6']);
    expect(p1.totals.availableUsd).toBe(63); // totals cover every row, not the page
  });

  it('filters by state, by order date, and by search', async () => {
    w.settings.payoutClearanceHours = '48';
    await sale({ hoursAgo: 5, name: 'Fresh phone' });
    await sale({ hoursAgo: 100, name: 'Old phone' });
    await sale({ hoursAgo: 300, name: 'Ancient lamp' });
    expect((await w.finance.earnings(owner, { state: 'clearing' })).items.map((i) => i.productName)).toEqual(['Fresh phone']);
    expect((await w.finance.earnings(owner, { state: 'available' })).total).toBe(2);
    const from = new Date(Date.now() - 200 * H).toISOString();
    expect((await w.finance.earnings(owner, { from })).total).toBe(2);
    expect((await w.finance.earnings(owner, { to: new Date(Date.now() - 200 * H).toISOString() })).items.map((i) => i.productName)).toEqual(['Ancient lamp']);
    expect((await w.finance.earnings(owner, { q: 'PHONE' })).total).toBe(2);
    expect((await w.finance.earnings(owner, { q: 'som-1' })).total).toBeGreaterThanOrEqual(0);
    await expect(w.finance.earnings(owner, { state: 'nope' })).rejects.toThrow('State must be one of');
    await expect(w.finance.earnings(owner, { from: 'junk' })).rejects.toThrow('not valid');
  });

  it('a seller only ever sees their own lines; an admin names a store', async () => {
    await sale({ name: 'Mine' });
    const other = await w.store('Other Shop', 'u-other');
    const p = await w.product(other, { name: 'Theirs' });
    const o = await w.ds.getRepository(Order).save(w.ds.getRepository(Order).create({ reference: 'SOM-X', customerId: 'c', customerName: 'C', status: 'delivered' }));
    await w.ds.getRepository(OrderItem).save(w.ds.getRepository(OrderItem).create({ orderId: o.id, productId: p.id, productName: 'Theirs', qty: 1, priceUsd: 50 }));
    expect((await w.finance.earnings(owner)).items.map((i) => i.productName)).toEqual(['Mine']);
    expect((await w.finance.earnings({ id: 'a', role: 'admin_finance' }, { sellerId: other.id })).items.map((i) => i.productName)).toEqual(['Theirs']);
    await expect(w.finance.earnings({ id: 'a', role: 'admin_finance' })).rejects.toThrow('sellerId');
    await expect(w.finance.earnings({ id: 'c', role: 'customer' })).rejects.toThrow('Not allowed');
    // A seller cannot read another store by passing its id.
    expect((await w.finance.earnings(owner, { sellerId: other.id })).items.map((i) => i.productName)).toEqual(['Mine']);
  });
});

describe('monthly statements', () => {
  const oct = (day: number) => new Date(Date.UTC(2026, 9, day, 12));

  it('lists a month’s sales and the sales taken back, with totals and CSV', async () => {
    await sale({ at: oct(3), price: 20, qty: 2, name: 'Early' }); // gross 40, commission 4
    await sale({ at: oct(20), price: 10, name: 'Late' }); // 10 / 1
    await sale({ at: oct(21), price: 30, status: 'returned', name: 'Sent back' }); // -30 / -3
    await sale({ at: new Date(Date.UTC(2026, 8, 30, 23)), name: 'September' });
    await sale({ at: new Date(Date.UTC(2026, 10, 1, 1)), name: 'November' });
    const s = (await w.finance.statements(owner, { month: '2026-10' })) as Awaited<ReturnType<typeof w.finance.statements>> & { totals: Record<string, number>; lines: { kind: string; productName: string }[] };
    expect(s.lines.map((l) => [l.kind, l.productName])).toEqual([['sale', 'Early'], ['sale', 'Late'], ['refund', 'Sent back']]);
    expect(s.totals).toMatchObject({ orders: 2, units: 3, grossUsd: 50, commissionUsd: 5, refundsUsd: 27, commissionCreditedUsd: 3, netUsd: 45 - 27 });
    const csv = (await w.finance.statements(owner, { month: '2026-10', format: 'csv' })) as { filename: string; csv: string };
    expect(csv.filename).toBe('statement-2026-10.csv');
    expect(csv.csv.startsWith('﻿Statement,2026-10,Kinshasa Traders')).toBe(true);
    expect(csv.csv).toContain('2026-10-21,refund,');
    expect(csv.csv).toContain('Net USD,18.00');
  });

  it('includes the payouts of the month', async () => {
    const a = await sale({ at: oct(3) });
    const p = await payoutWith('paid', [a.item], { amountUsd: 7 });
    await w.ds.getRepository(Payout).update({ id: p.id }, { createdAt: oct(10), updatedAt: oct(11) });
    const s = (await w.finance.statements(owner, { month: '2026-10' })) as { totals: Record<string, number>; payouts: { reference: string }[] };
    expect(s.payouts).toHaveLength(1);
    expect(s.totals).toMatchObject({ payoutsRequestedUsd: 7, payoutsPaidUsd: 7 });
    expect(((await w.finance.statements(owner, { month: '2026-09' })) as { payouts: unknown[] }).payouts).toHaveLength(0);
  });

  it('does not count a rejected payout as requested (it is still listed)', async () => {
    const a = await sale({ at: oct(3) });
    const paid = await payoutWith('paid', [a.item], { amountUsd: 7 });
    const rejected = await payoutWith('rejected', [], { amountUsd: 40 });
    const sending = await payoutWith('sending', [], { amountUsd: 5 });
    const requested = await payoutWith('requested', [], { amountUsd: 2 });
    for (const p of [paid, rejected, sending, requested]) await w.ds.getRepository(Payout).update({ id: p.id }, { createdAt: oct(10), updatedAt: oct(11) });
    const s = (await w.finance.statements(owner, { month: '2026-10' })) as { totals: Record<string, number>; payouts: { status: string }[] };
    expect(s.payouts.map((p) => p.status).sort()).toEqual(['paid', 'rejected', 'requested', 'sending']);
    expect(s.totals).toMatchObject({ payoutsRequestedUsd: 14, payoutsPaidUsd: 7 });
  });

  it('writes its CSV in French on request: headings, kinds and totals (the numbers do not change)', async () => {
    await sale({ at: oct(3), price: 50, name: 'Chaise' });
    const en = (await w.finance.statements(owner, { month: '2026-10', format: 'csv' })) as { csv: string };
    const fr = (await w.finance.statements(owner, { month: '2026-10', format: 'csv', locale: 'fr' })) as { csv: string };
    expect(fr.csv.startsWith('\uFEFFRelevé,2026-10,Kinshasa Traders')).toBe(true);
    expect(fr.csv).toContain('Date,Type,Commande,Produit,Option,Qté,Ventes USD,Commission %,Commission USD,Net USD');
    expect(fr.csv).toContain(',vente,');
    for (const line of ['Commandes,1', 'Unités,1', 'Ventes USD,50.00', 'Retours USD,0.00', 'Net USD,45.00', 'Versements payés USD,0.00']) expect(fr.csv).toContain(line);
    expect(en.csv).toContain('Date,Kind,Order,Product');
    expect(en.csv).toContain('Payouts paid USD,0.00');
  });

  it('without a month, the last 12 months with their totals', async () => {
    const now = new Date();
    await sale({ at: now, price: 10 });
    const r = (await w.finance.statements(owner)) as { months: { month: string; orders: number; grossUsd: number }[] };
    expect(r.months).toHaveLength(12);
    expect(r.months[0]).toMatchObject({ month: now.toISOString().slice(0, 7), orders: 1, grossUsd: 10 });
    expect(r.months[11].orders).toBe(0);
  });

  it('a bad month is refused', async () => {
    await expect(w.finance.statements(owner, { month: '2026-13' })).rejects.toThrow('Choose a month like 2026-10.');
  });
});

describe('transactions', () => {
  it('is one ledger: sales, refunds and payouts, newest first, paged and filtered by date', async () => {
    const a = await sale({ hoursAgo: 200, price: 20, name: 'A' }); // +18
    await sale({ hoursAgo: 100, price: 10, status: 'returned', name: 'B' }); // -9
    const p = await payoutWith('requested', [a.item], { amountUsd: 8 });
    await w.ds.getRepository(Payout).update({ id: p.id }, { createdAt: new Date(Date.now() - 50 * H) });
    const rejected = await payoutWith('rejected', [], { amountUsd: 3 });
    await w.ds.getRepository(Payout).update({ id: rejected.id }, { createdAt: new Date(Date.now() - 40 * H) });
    const ledger = async (input: Record<string, unknown>) => (await w.finance.transactions(owner, input)) as Extract<Awaited<ReturnType<typeof w.finance.transactions>>, { items: unknown }>;
    const r = await ledger({});
    expect(r.items.map((e) => [e.kind, e.amountUsd, e.counts])).toEqual([
      ['payout', 0, false],
      ['payout', -8, true],
      ['refund', -9, true],
      ['sale', 18, true],
    ]);
    expect(r.totals).toEqual({ salesUsd: 18, refundsUsd: -9, payoutsUsd: -8, netUsd: 1 });
    expect((await ledger({ limit: 2, offset: 1 })).items.map((e) => e.kind)).toEqual(['payout', 'refund']);
    expect((await ledger({ from: new Date(Date.now() - 120 * H).toISOString() })).total).toBe(3);
    const csv = (await w.finance.transactions(owner, { format: 'csv' })) as { csv: string };
    expect(csv.csv.split('\r\n')[0]).toBe('﻿Date,Kind,Reference,Description,Sales USD,Commission USD,Amount USD,Status');
    expect(csv.csv.split('\r\n').filter(Boolean)).toHaveLength(5);
  });
});

describe('transactions name the product in the viewer\'s language (bug 2)', () => {
  type Row = { kind: string; description: string; descriptionFr?: string; line?: unknown };
  const ledger = async (input: Record<string, unknown> = {}) => (await w.finance.transactions(owner, input)) as unknown as { items: Row[] };
  let tr: ReturnType<typeof testTranslations>;
  beforeEach(() => {
    tr = testTranslations(w.ds);
    new OrderItemTranslationSubscriber(w.ds, tr); // registers itself, like TranslationModule does
  });
  const snap = (itemId: string, field: 'productName' | 'variant', value: string) => tr.snapshot(w.ds.manager, [{ entityId: itemId, field, locale: 'fr', value }]);

  it('a sale and a refund carry the French description next to the English one', async () => {
    const a = await sale({ hoursAgo: 200, price: 20, qty: 2, name: 'Running shoes' });
    const b = await sale({ hoursAgo: 100, price: 10, status: 'returned', name: 'Blue T-shirt' });
    await snap(a.item.id, 'productName', 'Baskets de running');
    await snap(b.item.id, 'productName', 'T-shirt bleu');
    const r = await ledger();
    const by = Object.fromEntries(r.items.map((e) => [e.kind, e]));
    expect(by.sale).toMatchObject({ description: '2 × Running shoes', descriptionFr: '2 × Baskets de running' });
    expect(by.refund).toMatchObject({ description: '1 × Blue T-shirt', descriptionFr: '1 × T-shirt bleu' });
    expect('line' in by.sale).toBe(false); // the helper field stays on the server
  });

  it('the option label is French too; a payout has no product to name', async () => {
    const a = await sale({ hoursAgo: 200, price: 20, name: 'Hat' });
    await w.ds.getRepository(OrderItem).update({ id: a.item.id }, { variant: 'Colour: Blue' });
    await snap(a.item.id, 'productName', 'Chapeau');
    await snap(a.item.id, 'variant', 'Couleur : Bleu');
    await payoutWith('requested', [a.item], { amountUsd: 8 });
    const r = await ledger();
    expect(r.items.find((e) => e.kind === 'sale')).toMatchObject({ description: '1 × Hat (Colour: Blue)', descriptionFr: '1 × Chapeau (Couleur : Bleu)' });
    expect(r.items.find((e) => e.kind === 'payout')!.descriptionFr).toBeUndefined();
  });

  it('a product with no French name is named by its base name (the page shows it in both languages)', async () => {
    await sale({ hoursAgo: 200, price: 20, name: 'Lamp' });
    expect((await ledger()).items[0]).toMatchObject({ description: '1 × Lamp', descriptionFr: '1 × Lamp' });
  });

  it('the French CSV uses the French description; the English one is unchanged', async () => {
    const a = await sale({ hoursAgo: 200, price: 20, name: 'Running shoes' });
    await snap(a.item.id, 'productName', 'Baskets de running');
    const fr = (await w.finance.transactions(owner, { format: 'csv', locale: 'fr' })) as { csv: string };
    expect(fr.csv).toContain('1 × Baskets de running');
    expect(fr.csv).not.toContain('Running shoes');
    const en = (await w.finance.transactions(owner, { format: 'csv' })) as { csv: string };
    expect(en.csv).toContain('1 × Running shoes');
  });

  it('earnings and the month\'s statement carry the French name and option; the French statement CSV uses them', async () => {
    const a = await sale({ at: new Date(Date.UTC(2026, 9, 5, 12)), price: 20, name: 'Hat' });
    await w.ds.getRepository(OrderItem).update({ id: a.item.id }, { variant: 'Colour: Blue' });
    await snap(a.item.id, 'productName', 'Chapeau');
    await snap(a.item.id, 'variant', 'Couleur : Bleu');
    await sale({ at: new Date(Date.UTC(2026, 9, 6, 12)), price: 10, name: 'Lamp' });
    const earn = (await w.finance.earnings(owner, {})) as { items: { productName: string; productNameFr: string | null; variantFr: string | null }[] };
    expect(earn.items.find((l) => l.productName === 'Hat')).toMatchObject({ productNameFr: 'Chapeau', variantFr: 'Couleur : Bleu' });
    const st = (await w.finance.statements(owner, { month: '2026-10' })) as { lines: { productName: string; productNameFr: string | null }[] };
    expect(st.lines.find((l) => l.productName === 'Hat')!.productNameFr).toBe('Chapeau');
    const lamp = st.lines.find((l) => l.productName === 'Lamp')!.productNameFr;
    expect(lamp === null || lamp === 'Lamp').toBe(true); // no French name: the page shows the base name
    const fr = (await w.finance.statements(owner, { month: '2026-10', format: 'csv', locale: 'fr' })) as { csv: string };
    expect(fr.csv).toContain('Chapeau,Couleur : Bleu');
    const en = (await w.finance.statements(owner, { month: '2026-10', format: 'csv' })) as { csv: string };
    expect(en.csv).toContain('Hat,Colour: Blue');
  });
});

describe('transactions CSV language', () => {
  it('headings, kinds and statuses are French for a French caller; amounts and references are untouched', async () => {
    const a = await sale({ hoursAgo: 200, price: 20, name: 'A' });
    await sale({ hoursAgo: 100, price: 10, status: 'returned', name: 'B' });
    await payoutWith('requested', [a.item], { amountUsd: 8 });
    const fr = (await w.finance.transactions(owner, { format: 'csv', locale: 'fr' })) as { csv: string };
    const lines = fr.csv.split('\r\n').filter(Boolean);
    expect(lines[0]).toBe('\uFEFFDate,Type,Référence,Description,Ventes USD,Commission USD,Montant USD,Statut');
    const cells = lines.slice(1).map((l) => l.split(','));
    expect(cells.map((c) => c[1]).sort()).toEqual(['remboursement', 'vente', 'versement']);
    expect(cells.find((c) => c[1] === 'versement')![7]).toBe('demandé');
    expect(cells.find((c) => c[1] === 'vente')![7]).toBe('livrée');
    expect(cells.find((c) => c[1] === 'remboursement')![7]).toBe('retournée');
    expect(cells.find((c) => c[1] === 'versement')![6]).toContain('8.00');
    // English stays as it always was.
    const en = (await w.finance.transactions(owner, { format: 'csv' })) as { csv: string };
    expect(en.csv.split('\r\n')[0]).toBe('\uFEFFDate,Kind,Reference,Description,Sales USD,Commission USD,Amount USD,Status');
    expect(en.csv).toContain(',payout,');
  });
});

describe('commission invoices (tax documents)', () => {
  const lastMonth = () => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 15, 12));
  };
  const period = () => lastMonth().toISOString().slice(0, 7);

  it('issues a PDF in the seller’s language with the right numbers, and stores it under uploads', async () => {
    await w.ds.getRepository('User').update({ id: 'u-kt' }, { locale: 'fr' });
    await sale({ at: lastMonth(), price: 100, qty: 2, coupon: 20, pct: 10, name: 'Chaise' }); // gross 180 commission 18
    await sale({ at: lastMonth(), price: 40, status: 'returned', pct: 10, name: 'Lampe' }); // credit 4
    const doc = await w.finance.taxDocument(owner, { period: period() }, 'http://api.test');
    expect(doc).toMatchObject({ sellerId: 'u-kt', period: period(), locale: 'fr', orders: 1, units: 2, grossUsd: 180, commissionUsd: 18, creditedUsd: 4, netUsd: 162 - 36 });
    expect(doc.number).toMatch(/^CI-\d{6}-[0-9A-F]{8}$/);
    expect(doc.url).toMatch(new RegExp(`^http://api.test/uploads/invoices/u-kt/${doc.number}-[0-9a-f]{8}\\.pdf$`));
    const file = join(uploads, 'invoices', 'u-kt', doc.url.split('/').pop()!);
    expect(existsSync(file)).toBe(true);
    const pdf = readFileSync(file);
    expect(pdf.subarray(0, 8).toString()).toBe('%PDF-1.4');
    const text = pdfText(pdf).join(' | ');
    expect(text).toContain('FACTURE DE COMMISSION');
    expect(text).toContain('Chaise');
    expect(text).toContain('KT SARL');
    expect(text).toContain('A123456B');
    expect(text).toContain('TOTAL DE COMMISSION DÛ'.replace('Û', 'Û'));
    expect(text).toContain('14,00 $'); // 18 - 4
    expect(w.notes.find((x) => x.title === 'Commission invoice ready')).toMatchObject({ to: 'user:u-kt', type: 'finance', body: `Your commission invoice ${doc.number} for ${period()} is ready.` });
  });

  it('English by default (and `locale` overrides)', async () => {
    await sale({ at: lastMonth(), name: 'Chair' });
    const en = await w.finance.taxDocument(owner, { period: period() }, 'http://api.test');
    expect(en.locale).toBe('en');
    expect(pdfText(readFileSync(join(uploads, 'invoices', 'u-kt', en.url.split('/').pop()!))).join(' | ')).toContain('COMMISSION INVOICE');
  });

  it('a month that has ended is frozen once issued; an admin can refresh it; the number never changes', async () => {
    await sale({ at: lastMonth(), name: 'First' });
    const a = await w.finance.taxDocument(owner, { period: period() }, 'http://api.test');
    await sale({ at: lastMonth(), name: 'Second' }); // a later correction: the issued invoice does not move for the seller
    const b = await w.finance.taxDocument(owner, { period: period() }, 'http://api.test');
    expect(b).toMatchObject({ id: a.id, url: a.url, orders: 1 });
    const c = await w.finance.taxDocument({ id: 'a', role: 'admin_finance' }, { period: period(), sellerId: shop.id, refresh: true }, 'http://api.test');
    expect(c).toMatchObject({ id: a.id, number: a.number, orders: 2 });
    expect(c.url).not.toBe(a.url);
    expect(existsSync(join(uploads, 'invoices', 'u-kt', a.url.split('/').pop()!))).toBe(false); // the old file is gone
    // The seller told once, at the first issue.
    expect(w.notes.filter((x) => x.title === 'Commission invoice ready')).toHaveLength(1);
  });

  it('the current month is rebuilt every time with the same number', async () => {
    const now = new Date().toISOString().slice(0, 7);
    await sale({ at: new Date(), name: 'Today' });
    const a = await w.finance.taxDocument(owner, { period: now }, 'http://api.test');
    await sale({ at: new Date(), name: 'Today 2' });
    const b = await w.finance.taxDocument(owner, { period: now }, 'http://api.test');
    expect(b.number).toBe(a.number);
    expect(b.orders).toBe(2);
    expect(w.notes.filter((x) => x.title === 'Commission invoice ready')).toHaveLength(0); // the month is not over
  });

  it('refuses a month with no sales, a future month, and a bad period', async () => {
    await expect(w.finance.taxDocument(owner, { period: period() })).rejects.toThrow('nothing to invoice');
    const future = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 1)).toISOString().slice(0, 7);
    await expect(w.finance.taxDocument(owner, { period: future })).rejects.toThrow('not started');
    await expect(w.finance.taxDocument(owner, { period: 'last month' })).rejects.toThrow('Choose a month');
  });

  it('lists the issued documents and which of the last months had sales', async () => {
    await sale({ at: lastMonth(), name: 'Chair' });
    const doc = await w.finance.taxDocument(owner, { period: period() }, 'http://api.test');
    const r = await w.finance.taxDocuments(owner, {});
    expect(r.items.map((d) => d.id)).toEqual([doc.id]);
    expect(r.months[1]).toMatchObject({ month: period(), orders: 1, hasSales: true, documentId: doc.id, url: doc.url });
    expect(r.months[0]).toMatchObject({ hasSales: false, documentId: null });
    expect((await w.finance.taxDocuments(owner, { year: 1999 })).items).toHaveLength(0);
  });
});

describe('seller settings', () => {
  it('shows the commission, minimum payout and hold the money follows', async () => {
    w.settings.commissionPct = '12';
    w.settings.minPayoutUsd = '25';
    w.settings.payoutClearanceHours = '72';
    expect(await w.finance.sellerSettings()).toEqual({ currency: 'USD', commissionPct: 12, minPayoutUsd: 25, payoutClearanceHours: 72 });
  });
});
