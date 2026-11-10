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
  legacyDays,
  totalDeliveryDays,
  vacationError,
  vacationNotice,
} from './storefront';
import { EXPRESS_NEEDS_PIN, EXPRESS_NOT_BOOLEAN, StorefrontService, touchesStorefront } from './storefront.service';
import { sellerView } from '../database/entities/seller.entity';
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

  it('delivery time = preparation + the store\'s handling + the platform\'s local transit (default 1), clamped to 1..30', () => {
    expect(totalDeliveryDays(3, { handlingDays: 2 })).toBe(6);
    expect(totalDeliveryDays(3, { handlingDays: 0 })).toBe(4);
    expect(totalDeliveryDays(3, null)).toBe(4);
    expect(totalDeliveryDays(undefined, { handlingDays: 2 })).toBe(5); // unset preparation falls back to 2 days
    expect(totalDeliveryDays(0, null)).toBe(1); // ships the same day: just the platform's transit day
    expect(totalDeliveryDays(0, null, 0)).toBe(1); // never below 1, even with no local transit
    expect(totalDeliveryDays(3, { handlingDays: 2 }, 3)).toBe(8);
    expect(totalDeliveryDays(30, { handlingDays: 14 })).toBe(30); // the TOTAL is clamped to 30, as the order estimate is
    expect(totalDeliveryDays(25, { handlingDays: 14 })).toBe(30);
    expect(totalDeliveryDays(15, { handlingDays: 14 })).toBe(30);
    expect(totalDeliveryDays(14, { handlingDays: 14 })).toBe(29);
    expect(totalDeliveryDays(15, { handlingDays: 14 }, 0)).toBe(29);
    expect(totalDeliveryDays(3, { handlingDays: 99 })).toBe(18); // handling is capped at 14
  });

  it('the legacy delivery time is preparation + local transit WITHOUT handling, at least 1, so it round-trips', () => {
    expect(legacyDays(3)).toBe(4);
    expect(legacyDays(0)).toBe(1);
    expect(legacyDays(0, 0)).toBe(1);
    expect(legacyDays(4, 2)).toBe(6);
    expect(legacyDays(30)).toBe(30);
    expect(legacyDays(undefined)).toBe(3); // unset preparation = 2, + 1 transit
    // what the wizard reads back is what it wrote: deliveryDays 4 -> prep 3 -> served 4; the total adds the handling on top
    const store = { handlingDays: 3 };
    expect(totalDeliveryDays(3, store)).toBe(legacyDays(3) + store.handlingDays);
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
      const sellersSvc = { withPlanState: async (s: Seller) => ({ id: s.id, legalName: 'Mama SARL', idNumber: 'ID-1', rccm: 'RC-1', taxNumber: 'TX-1', documentUrls: ['/uploads/x'], phone: '+243800000000', onVacation: onVacation(s), vacationUntil: s.vacationUntil, handlingDays: s.handlingDays, expressDelivery: s.expressDelivery, returnsPolicy: s.returnsPolicy }) };
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

    it('the seller:updated push gives the identity papers to the KYC reviewers only, never to Marketing, Support or Finance', async () => {
      const { svc, emitter } = make();
      const s = await addSeller(ds, { userId: 'owner-1' });
      await svc.update(ctxOf(s), { handlingDays: 2 });
      const pushes = emitter.sent.filter((e) => e.event === 'seller:updated' && !e.to.startsWith('user:'));
      const rooms = pushes.flatMap((p) => p.to.split(','));
      expect(rooms).toEqual(expect.arrayContaining(['admin', 'admin_moderation', 'admin_operations', 'admin_finance', 'admin_support', 'admin_marketing']));
      for (const p of pushes) {
        const reviewer = p.to.split(',').every((r) => ['admin', 'admin_moderation', 'admin_operations'].includes(r));
        for (const k of ['legalName', 'idNumber', 'rccm', 'taxNumber', 'documentUrls', 'phone']) expect(k in p.payload).toBe(reviewer);
      }
    });

    describe('express delivery switch', () => {
      const PIN = { pickupLat: -4.3152, pickupLng: 15.3098 };
      const stored = async (id: string) => (await ds.getRepository(Seller).findOneByOrFail({ id })).expressDelivery;

      it('turns on for a store with a pinned pickup location, tells the owner and the admins, and turns off again', async () => {
        const { svc, emitter } = make();
        const s = await addSeller(ds, { userId: 'owner-1', ...PIN });
        expect(await stored(s.id)).toBe(false);
        const on = await svc.update(ctxOf(s), { expressDelivery: true });
        expect(on).toMatchObject({ expressDelivery: true });
        expect(await stored(s.id)).toBe(true);
        expect(emitter.sent.some((e) => e.to === 'user:owner-1' && e.event === 'seller:updated' && e.payload.expressDelivery === true)).toBe(true);
        expect(emitter.sent.some((e) => e.event === 'store:vacation')).toBe(false); // not a vacation change: shoppers are not pinged
        expect(await svc.update(ctxOf(on as never as Seller & { id: string }), { expressDelivery: false })).toMatchObject({ expressDelivery: false });
        expect(await stored(s.id)).toBe(false);
      });

      it('is refused without a pinned pickup location, with the pin message, and saves nothing', async () => {
        const { svc } = make();
        const s = await addSeller(ds, { handlingDays: 1 });
        await expect(svc.update(ctxOf(s), { expressDelivery: true, handlingDays: 3 })).rejects.toThrow(EXPRESS_NEEDS_PIN);
        expect(EXPRESS_NEEDS_PIN).toBe('Pin your pickup location on the map (Store settings) before offering express delivery.');
        expect(await stored(s.id)).toBe(false);
        expect((await ds.getRepository(Seller).findOneByOrFail({ id: s.id })).handlingDays).toBe(1);
        // half a pin is no pin
        const half = await addSeller(ds, { pickupLat: -4.3 });
        await expect(svc.update(ctxOf(half), { expressDelivery: true })).rejects.toThrow(EXPRESS_NEEDS_PIN);
      });

      it('a request that pins the location and switches express on together is judged by the pin it sends (and one that clears the pin is refused)', async () => {
        const { svc } = make();
        const s = await addSeller(ds);
        await expect(svc.update(ctxOf(s), { expressDelivery: true, pickupLat: null, pickupLng: null } as never)).rejects.toThrow(EXPRESS_NEEDS_PIN);
        await svc.update(ctxOf(s), { expressDelivery: true, ...PIN } as never);
        expect(await stored(s.id)).toBe(true);
        const pinned = await addSeller(ds, PIN);
        await expect(svc.update(ctxOf(pinned), { expressDelivery: true, pickupLat: null, pickupLng: null } as never)).rejects.toThrow(EXPRESS_NEEDS_PIN);
      });

      it('must be true or false', async () => {
        const { svc } = make();
        const s = await addSeller(ds, PIN);
        for (const bad of ['true', 1, 0, null, 'yes', {}]) await expect(svc.update(ctxOf(s), { expressDelivery: bad })).rejects.toThrow(EXPRESS_NOT_BOOLEAN);
        expect(EXPRESS_NOT_BOOLEAN).toBe('Express delivery must be true or false.');
        expect(await stored(s.id)).toBe(false);
      });

      it('switching off needs no pin, and an untouched switch stays as it was', async () => {
        const { svc } = make();
        const s = await addSeller(ds, { expressDelivery: true });
        await svc.update(ctxOf(s), { handlingDays: 2 });
        expect(await stored(s.id)).toBe(true);
        await svc.update(ctxOf(s), { expressDelivery: false });
        expect(await stored(s.id)).toBe(false);
      });

      it('is part of the seller view (sellers:mine, seller:updated, the admin lists and the public storefront all spread it)', async () => {
        const s = await addSeller(ds, { expressDelivery: true });
        expect(sellerView(s).expressDelivery).toBe(true);
        expect(sellerView(await addSeller(ds)).expressDelivery).toBe(false);
      });
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
    expect(touchesStorefront({ expressDelivery: false })).toBe(true);
    expect(touchesStorefront({ returnsPolicyFr: 'x' })).toBe(true);
    expect(touchesStorefront({ name: 'x', description: 'y' })).toBe(false);
    expect(touchesStorefront(undefined)).toBe(false);
    expect(touchesStorefront(null)).toBe(false);
  });
});

void Product;
