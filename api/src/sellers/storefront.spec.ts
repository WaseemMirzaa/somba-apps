import { DataSource } from 'typeorm';
import { CartLine, Product, Seller } from '../database/entities';
import { addProduct, addSeller, recordingEmitter, testDb, testTranslations } from '../testing/test-db';
import {
  EMPTY_GOALS,
  MAX_HANDLING_DAYS,
  assertNoNewVacationLines,
  assertStoreOpen,
  cleanGoals,
  cleanHandlingDays,
  cleanVacationUntil,
  onVacation,
  parseGoals,
  storeForListing,
  totalDeliveryDays,
  vacationError,
  vacationNotice,
} from './storefront';
import { StorefrontService, touchesStorefront } from './storefront.service';
import { cleanPayoutAccount, maskAccount } from './payout-account';
import type { SellerContext } from './seller-context';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-25T10:00:00Z');

describe('vacation mode', () => {
  it('is on only while the return date is in the future', () => {
    expect(onVacation({ vacationUntil: new Date(NOW + 1000) }, NOW)).toBe(true);
    expect(onVacation({ vacationUntil: new Date(NOW - 1000) }, NOW)).toBe(false);
    expect(onVacation({ vacationUntil: null }, NOW)).toBe(false);
    expect(onVacation({}, NOW)).toBe(false);
    expect(onVacation(null, NOW)).toBe(false);
    expect(onVacation({ vacationUntil: 'garbage' as never }, NOW)).toBe(false);
    expect(onVacation({ vacationUntil: new Date(NOW + DAY).toISOString() }, NOW)).toBe(true);
  });

  it('the message is clear in both languages and names the store and the date', () => {
    const n = vacationNotice('Kinshasa Traders', new Date('2026-11-12T12:00:00Z'));
    expect(n.en).toBe('Kinshasa Traders is on vacation until 12 Nov 2026 and is not taking new orders.');
    expect(n.fr).toBe('Kinshasa Traders est en vacances jusqu’au 12 nov. 2026 et ne prend pas de nouvelles commandes.');
    expect(vacationError('Shop', new Date('2026-11-12T12:00:00Z'))).toBe(`${vacationNotice('Shop', new Date('2026-11-12T12:00:00Z')).en} / ${vacationNotice('Shop', new Date('2026-11-12T12:00:00Z')).fr}`);
  });

  it('assertStoreOpen throws the bilingual message for a store that is away, and passes otherwise', () => {
    expect(() => assertStoreOpen({ name: 'Shop', vacationUntil: new Date(NOW + DAY) }, NOW)).toThrow(/on vacation until .*en vacances jusqu’au/);
    expect(() => assertStoreOpen({ name: 'Shop', vacationUntil: new Date(NOW - DAY) }, NOW)).not.toThrow();
    expect(() => assertStoreOpen({ name: 'Shop', vacationUntil: null }, NOW)).not.toThrow();
    expect(() => assertStoreOpen(null, NOW)).not.toThrow();
  });

  describe('cleanVacationUntil', () => {
    it('null and empty reopen the store', () => {
      expect(cleanVacationUntil(null, NOW)).toBeNull();
      expect(cleanVacationUntil('', NOW)).toBeNull();
    });
    it('takes a future date or datetime', () => {
      expect(cleanVacationUntil('2026-11-12T08:00:00Z', NOW)?.toISOString()).toBe('2026-11-12T08:00:00.000Z');
    });
    it('a bare date means the END of that day, so "back on the 12th" stays closed through it', () => {
      expect(cleanVacationUntil('2026-11-12', NOW)?.toISOString()).toBe('2026-11-12T23:59:59.000Z');
    });
    it('refuses the past, nonsense, and more than a year ahead', () => {
      expect(() => cleanVacationUntil('2026-10-01T00:00:00Z', NOW)).toThrow(/future/);
      expect(() => cleanVacationUntil('soon', NOW)).toThrow(/valid return date/);
      expect(() => cleanVacationUntil(new Date(NOW + 400 * DAY).toISOString(), NOW)).toThrow(/one year/);
      expect(() => cleanVacationUntil(new Date(NOW + 365 * DAY).toISOString(), NOW)).not.toThrow();
    });
  });
});

describe('handling time', () => {
  it('whole days 0..14', () => {
    expect(cleanHandlingDays(0)).toBe(0);
    expect(cleanHandlingDays('3')).toBe(3);
    expect(cleanHandlingDays(MAX_HANDLING_DAYS)).toBe(14);
    for (const bad of [-1, 15, 1.5, 'x', null, '', undefined]) expect(() => cleanHandlingDays(bad)).toThrow(/0 to 14/);
  });

  it('adds to the product\'s delivery time (clamped), and a store with none changes nothing', () => {
    expect(totalDeliveryDays(3, { handlingDays: 2 })).toBe(5);
    expect(totalDeliveryDays(3, { handlingDays: 0 })).toBe(3);
    expect(totalDeliveryDays(3, null)).toBe(3);
    expect(totalDeliveryDays(undefined, { handlingDays: 2 })).toBe(5); // unset delivery time falls back to 3 days
    expect(totalDeliveryDays(30, { handlingDays: 14 })).toBe(30); // the TOTAL is clamped to 30, as the order estimate is
    expect(totalDeliveryDays(25, { handlingDays: 14 })).toBe(30);
    expect(totalDeliveryDays(16, { handlingDays: 14 })).toBe(30);
    expect(totalDeliveryDays(15, { handlingDays: 14 })).toBe(29);
    expect(totalDeliveryDays(3, { handlingDays: 99 })).toBe(17); // handling is capped at 14
  });
});

describe('seller goals', () => {
  it('keeps valid numbers, clears blanks, rounds money and rating', () => {
    expect(cleanGoals({ revenueUsd: '5000.456', orders: 100, rating: 4.567, products: null })).toEqual({ revenueUsd: 5000.46, orders: 100, rating: 4.57, products: null });
    expect(cleanGoals({})).toEqual(EMPTY_GOALS);
    expect(cleanGoals(undefined)).toEqual(EMPTY_GOALS);
    expect(cleanGoals({ orders: '' })).toEqual(EMPTY_GOALS);
  });
  it('refuses negatives, fractions where a whole number is needed, and out-of-range values', () => {
    expect(() => cleanGoals({ orders: -1 })).toThrow(/Orders goal/);
    expect(() => cleanGoals({ orders: 1.5 })).toThrow(/whole number/);
    expect(() => cleanGoals({ rating: 5.5 })).toThrow(/Rating goal/);
    expect(() => cleanGoals({ revenueUsd: 'lots' })).toThrow(/Revenue goal/);
    expect(() => cleanGoals({ products: 2_000_000 })).toThrow(/Listings goal/);
  });
  it('reads what is stored without throwing, whatever it holds', () => {
    expect(parseGoals(null)).toEqual(EMPTY_GOALS);
    expect(parseGoals('not json')).toEqual(EMPTY_GOALS);
    expect(parseGoals(JSON.stringify({ orders: 50, rating: 99, evil: 1 }))).toEqual({ ...EMPTY_GOALS, orders: 50 });
  });
});

describe('payout account', () => {
  it('masks all but the first two and last four characters', () => {
    expect(maskAccount('FR76 3000 1234 5678')).toBe('FR •••• 5678');
    expect(maskAccount('+243812345678')).toBe('+2 •••• 5678');
    expect(maskAccount('123')).toBe('••••');
    expect(maskAccount(null)).toBeNull();
    expect(maskAccount('   ')).toBeNull();
  });
  it('validates method and account', () => {
    expect(cleanPayoutAccount({ method: 'bank', account: ' FR76 3000 1234 ' })).toEqual({ method: 'bank', account: 'FR76 3000 1234' });
    expect(() => cleanPayoutAccount({ method: 'cash', account: 'x'.repeat(10) })).toThrow(/bank or mobile money/);
    expect(() => cleanPayoutAccount({ method: 'bank', account: '123' })).toThrow(/IBAN/);
    expect(() => cleanPayoutAccount({ method: 'mobile_money', account: '1' })).toThrow(/mobile-money number/);
    expect(() => cleanPayoutAccount({ method: 'bank', account: 'x'.repeat(251) })).toThrow();
  });
});

describe('storefront with a database', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = await testDb();
  });
  afterEach(() => ds.destroy());

  it('finds the store behind a listing by the store id or the owner id', async () => {
    const s = await addSeller(ds, { userId: 'owner-1' });
    expect((await storeForListing(ds.getRepository(Seller), s.id))?.id).toBe(s.id);
    expect((await storeForListing(ds.getRepository(Seller), 'owner-1'))?.id).toBe(s.id);
    expect(await storeForListing(ds.getRepository(Seller), 'nobody')).toBeNull();
  });

  it('refuses NEW cart lines from a store that is away, keeps what the cart already holds', async () => {
    const away = await addSeller(ds, { name: 'Away', vacationUntil: new Date(Date.now() + DAY) });
    const open = await addSeller(ds, { name: 'Open' });
    const pAway = await addProduct(ds, { sellerId: away.id });
    const pAway2 = await addProduct(ds, { sellerId: away.id });
    const pOpen = await addProduct(ds, { sellerId: open.id });
    await expect(assertNoNewVacationLines(ds, new Set(), [pOpen.id])).resolves.toBeUndefined();
    await expect(assertNoNewVacationLines(ds, new Set(), [pOpen.id, pAway.id])).rejects.toThrow(/Away is on vacation/);
    // already in the cart: syncing never fails
    await expect(assertNoNewVacationLines(ds, new Set([pAway.id]), [pAway.id, pOpen.id])).resolves.toBeUndefined();
    await expect(assertNoNewVacationLines(ds, new Set([pAway.id]), [pAway.id, pAway2.id])).rejects.toThrow(/on vacation/);
    // the vacation is over
    await ds.getRepository(Seller).update({ id: away.id }, { vacationUntil: new Date(Date.now() - 1000) });
    await expect(assertNoNewVacationLines(ds, new Set(), [pAway.id])).resolves.toBeUndefined();
    void CartLine;
  });

  describe('StorefrontService', () => {
    function make() {
      const emitter = recordingEmitter();
      const notices: { to: string; title: string }[] = [];
      const translations = testTranslations(ds);
      const sellersSvc = { withPlanState: async (s: Seller) => ({ id: s.id, onVacation: onVacation(s), vacationUntil: s.vacationUntil, handlingDays: s.handlingDays, returnsPolicy: s.returnsPolicy }) };
      const svc = new StorefrontService(ds.getRepository(Seller), sellersSvc as never, emitter as never, { toUser: async (to: string, n: { title: string }) => void notices.push({ to, title: n.title }) } as never, translations);
      return { svc, emitter, notices, translations };
    }
    const ctxOf = (seller: Seller, isOwner = true) => ({ seller, isOwner, member: isOwner ? 'owner' : 'manager', user: { id: 'u', role: 'seller', name: 'u' }, actor: { id: seller.userId ?? 'u', name: 'u', role: 'seller' }, ownerIds: [seller.id], suspended: false, permissions: [] }) as unknown as SellerContext;

    it('sets vacation and handling time, tells shoppers, and reopens', async () => {
      const { svc, emitter } = make();
      const s = await addSeller(ds, { userId: 'owner-1' });
      const until = new Date(Date.now() + 3 * DAY).toISOString();
      const out = await svc.update(ctxOf(s), { vacationUntil: until, handlingDays: 2 });
      expect(out).toMatchObject({ onVacation: true, handlingDays: 2 });
      const push = emitter.sent.find((e) => e.event === 'store:vacation');
      expect(push?.payload).toMatchObject({ sellerId: s.id, ownerId: 'owner-1', sellerIds: [s.id, 'owner-1'], onVacation: true });
      expect(push?.payload.notice.fr).toMatch(/vacances/);
      expect(emitter.sent.some((e) => e.to === 'user:owner-1' && e.event === 'seller:updated')).toBe(true);
      emitter.sent.length = 0;
      const reopened = await svc.update(ctxOf(s), { vacationUntil: null });
      expect(reopened).toMatchObject({ onVacation: false, vacationUntil: null, handlingDays: 2 });
      expect(emitter.sent.find((e) => e.event === 'store:vacation')?.payload).toMatchObject({ onVacation: false, notice: null, sellerIds: [s.id, 'owner-1'] });
    });

    it('a change that does not flip the state does not spam shoppers (handling time only)', async () => {
      const { svc, emitter } = make();
      const s = await addSeller(ds);
      await svc.update(ctxOf(s), { handlingDays: 4 });
      expect(emitter.sent.some((e) => e.event === 'store:vacation')).toBe(false);
    });

    it('saves nothing when any value is invalid', async () => {
      const { svc } = make();
      const s = await addSeller(ds, { handlingDays: 1 });
      await expect(svc.update(ctxOf(s), { handlingDays: 3, vacationUntil: 'soon' })).rejects.toThrow();
      expect((await ds.getRepository(Seller).findOneByOrFail({ id: s.id })).handlingDays).toBe(1);
    });

    it('policies are authored in either language and the other is queued for translation', async () => {
      const { svc, translations } = make();
      const s = await addSeller(ds);
      await svc.update(ctxOf(s), { returnsPolicy: 'Returns are accepted within 14 days.', shippingPolicyFr: 'Expédition sous deux jours ouvrés.' });
      const row = await ds.getRepository(Seller).findOneByOrFail({ id: s.id });
      expect(row.returnsPolicy).toBe('Returns are accepted within 14 days.');
      const rows = (await translations.rowsFor('seller', [s.id])).get(s.id) ?? [];
      expect(rows.find((r) => r.field === 'shippingPolicy' && r.locale === 'fr')).toMatchObject({ origin: 'author', value: 'Expédition sous deux jours ouvrés.' });
      await expect(svc.update(ctxOf(s), { returnsPolicy: 'short' })).rejects.toThrow(/Returns policy/);
      const cleared = await svc.update(ctxOf(s), { returnsPolicy: null });
      expect(cleared.returnsPolicy).toBeNull();
    });

    it('the sweep reopens stores whose date passed and tells the owner', async () => {
      const { svc, notices, emitter } = make();
      const done = await addSeller(ds, { userId: 'o1', vacationUntil: new Date(Date.now() - 1000) });
      const still = await addSeller(ds, { userId: 'o2', vacationUntil: new Date(Date.now() + DAY) });
      expect(await svc.sweepVacations()).toBe(1);
      expect((await ds.getRepository(Seller).findOneByOrFail({ id: done.id })).vacationUntil).toBeNull();
      expect((await ds.getRepository(Seller).findOneByOrFail({ id: still.id })).vacationUntil).not.toBeNull();
      expect(notices).toEqual([{ to: 'o1', title: 'Vacation mode ended' }]);
      expect(emitter.sent.find((e) => e.event === 'store:vacation')?.payload).toMatchObject({ sellerId: done.id, onVacation: false });
      expect(await svc.sweepVacations()).toBe(0);
    });

    it('goals and the payout account are stored per store; staff see the payout account masked', async () => {
      const { svc } = make();
      const s = await addSeller(ds);
      expect(svc.goals(ctxOf(s))).toEqual(EMPTY_GOALS);
      expect(await svc.setGoals(ctxOf(s), { orders: 10 })).toEqual({ ...EMPTY_GOALS, orders: 10 });
      const fresh = await ds.getRepository(Seller).findOneByOrFail({ id: s.id });
      expect(svc.goals(ctxOf(fresh))).toEqual({ ...EMPTY_GOALS, orders: 10 });
      await expect(svc.setGoals(ctxOf(s), { orders: -2 })).rejects.toThrow();

      expect(svc.payoutAccount(ctxOf(s))).toEqual({ method: null, account: null, masked: null, set: false });
      const saved = await svc.setPayoutAccount(ctxOf(s), { method: 'bank', account: 'FR76 3000 1234 5678' });
      expect(saved).toMatchObject({ method: 'bank', account: 'FR76 3000 1234 5678', set: true });
      const f2 = await ds.getRepository(Seller).findOneByOrFail({ id: s.id });
      expect(svc.payoutAccount(ctxOf(f2, true)).account).toBe('FR76 3000 1234 5678');
      expect(svc.payoutAccount(ctxOf(f2, false))).toEqual({ method: 'bank', account: null, masked: 'FR •••• 5678', set: true });
      // encrypted at rest
      const raw = await ds.query('SELECT payoutAccount FROM sellers WHERE id = ?', [s.id]);
      expect(raw[0].payoutAccount).toMatch(/^enc::/);
      expect(await svc.setPayoutAccount(ctxOf(f2), { clear: true })).toMatchObject({ set: false });
    });
  });

  it('touchesStorefront recognises the storefront fields of a sellers:update body', () => {
    expect(touchesStorefront({ vacationUntil: null })).toBe(true);
    expect(touchesStorefront({ handlingDays: 0 })).toBe(true);
    expect(touchesStorefront({ returnsPolicyFr: 'x' })).toBe(true);
    expect(touchesStorefront({ name: 'x', description: 'y' })).toBe(false);
    expect(touchesStorefront(undefined)).toBe(false);
    expect(touchesStorefront(null)).toBe(false);
  });
});

void Product;
