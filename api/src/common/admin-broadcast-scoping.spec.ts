import { DataSource } from 'typeorm';
import { CmsBlock, Hub, Order, User, WalletTransaction } from '../database/entities';
import { CmsService } from '../content/cms.service';
import { SettingsService } from '../content/settings.service';
import { CustomersService } from '../ops/customers.service';
import { RolesService } from '../ops/roles.service';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';
import { recordingEmitter, testDb, testTranslations } from '../testing/test-db';
import { FRAUD_THRESHOLDS } from '../ops/fraud-rules.config';
import { ROLE_GROUPS } from './role-groups';

const FRAUD_KEY = Object.values(FRAUD_THRESHOLDS)[0].key;

/**
 * Least privilege, part 3: live pushes that used to go to EVERY admin room go to the department that owns the screen reading
 * them (the super admin always included). Each test names who must hear the event and who must not; the rooms are what the
 * emitter was asked for, so a screen that follows an event keeps updating and the other departments are not sent the data.
 */
const ALL_ADMINS = ['admin', 'admin_operations', 'admin_finance', 'admin_support', 'admin_marketing', 'admin_moderation'];

/** The admin rooms an event went to (customer, seller... rooms are not admin audiences). */
function adminRooms(sent: { to: string; event: string }[], event: string): string[][] {
  return sent
    .filter((e) => e.event === event)
    .map((e) => e.to.split(',').filter((r) => r === 'admin' || r.startsWith('admin_')))
    .filter((r) => r.length > 0);
}
const heard = (rooms: string[][], role: string) => rooms.some((r) => r.includes(role));

describe('store coupons, promo codes, flash sales: Marketing and the super admin only', () => {
  let w: World;
  beforeEach(async () => {
    w = await commerceWorld();
  });
  afterEach(async () => w.ds.destroy());

  const MARKETING = [...ROLE_GROUPS.content];
  const expectOnly = (rooms: string[][], allowed: readonly string[]) => {
    expect(rooms.length).toBeGreaterThan(0);
    for (const role of ALL_ADMINS) expect(heard(rooms, role)).toBe(allowed.includes(role));
  };

  it('coupon:updated and coupon:removed', async () => {
    const shop = await w.store('Kinshasa Traders', 'u-kt');
    w.emitter.sent.length = 0;
    const c = await w.coupons.create('u-kt', { code: 'spring10', type: 'percent', value: 10 });
    await w.coupons.remove('u-kt', c.id);
    expectOnly(adminRooms(w.emitter.sent, 'coupon:updated'), MARKETING);
    expectOnly(adminRooms(w.emitter.sent, 'coupon:removed'), MARKETING);
    void shop;
  });

  it('promo:updated', async () => {
    w.emitter.sent.length = 0;
    const p = await w.promos.create({ code: 'SAVE10', type: 'percent', value: 10 });
    await w.promos.setActive(p.id, false);
    const rooms = adminRooms(w.emitter.sent, 'promo:updated');
    expect(rooms).toHaveLength(2);
    expectOnly(rooms, MARKETING);
  });

  it('flashsale:updated: shoppers keep hearing it, admins only Marketing and the super admin', async () => {
    const shop = await w.store('Kinshasa Traders', 'u-kt');
    const product = await w.product(shop, { name: 'Phone', price: 50, stock: 5 });
    w.emitter.sent.length = 0;
    const sale = await w.promos.createFlashSale({ productId: product.id, flashPrice: 30, title: 'Flash', startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString() });
    await w.promos.endFlashSale(sale.id);
    const rooms = adminRooms(w.emitter.sent, 'flashsale:updated');
    expectOnly(rooms, MARKETING);
    expect(w.emitter.sent.some((e) => e.event === 'flashsale:updated' && e.to.startsWith('customer,guest'))).toBe(true);
  });
});

describe('cms:updated', () => {
  it('shoppers keep hearing it; admins only Marketing and the super admin', async () => {
    const ds = await testDb();
    const emitter = recordingEmitter();
    const cms = new CmsService(ds.getRepository(CmsBlock), emitter as never, testTranslations(ds));
    await cms.upsert({ key: 'home-banner', title: 'Welcome', body: 'Hello', type: 'banner' });
    const rooms = adminRooms(emitter.sent, 'cms:updated');
    expect(rooms).toHaveLength(1);
    for (const role of ALL_ADMINS) expect(heard(rooms, role)).toBe(['admin', 'admin_marketing'].includes(role));
    expect(emitter.sent.some((e) => e.event === 'cms:updated' && e.to.startsWith('customer'))).toBe(true);
    await ds.destroy();
  });
});

describe('settings:updated: the full set is the super admin’s, everyone else gets the public view', () => {
  it('the super admin gets every setting; each other admin role, shoppers and staff get only the public subset', async () => {
    const rows: Record<string, string> = { requireStaffTwoFactor: 'true' };
    const repo = {
      find: async () => Object.entries(rows).map(([key, value]) => ({ key, value })),
      findOne: async ({ where }: { where: { key: string } }) => (rows[where.key] !== undefined ? { key: where.key, value: rows[where.key] } : null),
      create: (r: { key: string; value: string }) => r,
      save: async (r: { key: string; value: string }) => ((rows[r.key] = r.value), r),
    };
    const emitter = recordingEmitter();
    const svc = new SettingsService(repo as never, emitter as never);
    await svc.set('fxRate', 2800);
    await svc.set(FRAUD_KEY, 7);
    const pushes = emitter.sent.filter((e) => e.event === 'settings:updated');
    const full = pushes.filter((e) => e.to === 'admin');
    expect(full).toHaveLength(2);
    expect(full[1].payload).toMatchObject({ fxRate: '2800', [FRAUD_KEY]: '7', requireStaffTwoFactor: 'true' });
    const others = pushes.filter((e) => e.to !== 'admin');
    expect(others).toHaveLength(2);
    for (const e of others) {
      const rooms = e.to.split(',');
      for (const role of ALL_ADMINS.filter((r) => r !== 'admin')) expect(rooms).toContain(role); // the exchange rate keeps updating in every portal
      expect(rooms).not.toContain('admin');
      expect(Object.keys(e.payload)).not.toContain(FRAUD_KEY);
      expect(Object.keys(e.payload)).not.toContain('requireStaffTwoFactor');
      expect(e.payload).toMatchObject({ fxRate: '2800' });
    }
  });
});

describe('customer:updated: the customer list (Support) and the fraud pages (Finance, Support)', () => {
  it('goes to the super admin, finance and support', async () => {
    const ds = await testDb();
    const emitter = recordingEmitter();
    const svc = new CustomersService(ds.getRepository(User), ds.getRepository(Order), ds.getRepository(WalletTransaction), emitter as never);
    const c = await ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: 'h1', email: 'c@x.y', passwordHash: 'x', name: 'Awa', role: 'customer' }));
    await svc.setActive(c.id, false, 'someone-else');
    const rooms = adminRooms(emitter.sent, 'customer:updated');
    expect(rooms).toHaveLength(1);
    for (const role of ALL_ADMINS) expect(heard(rooms, role)).toBe(['admin', 'admin_finance', 'admin_support'].includes(role));
    await ds.destroy();
  });
});

describe('roles:updated and hub:updated after a staff change', () => {
  it('the staff lists are the super admin’s: only `admin` hears roles:updated; the warehouse directory still follows hub:updated', async () => {
    const ds = await testDb();
    const emitter = recordingEmitter();
    const hub = await ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name: 'Kinshasa', city: 'Kinshasa', active: true }));
    const rider = await ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: 'r1', email: 'r@x.y', passwordHash: 'x', name: 'Marc', role: 'rider', hubId: hub.id, active: true }));
    const svc = new RolesService(ds.getRepository(User), {} as never, emitter as never, ds.getRepository(Hub));
    await svc.setHub(rider.id, hub.id);
    await svc.setStaffActive(rider.id, false, 'a1');
    const roles = emitter.sent.filter((e) => e.event === 'roles:updated');
    expect(roles).toHaveLength(2);
    for (const e of roles) expect(e.to).toBe('admin'); // not warehouse staff, not the other departments
    const hubs = emitter.sent.filter((e) => e.event === 'hub:updated');
    expect(hubs).toHaveLength(1);
    expect(hubs[0].to.split(',').sort()).toEqual(['admin', 'admin_operations', 'warehouse_staff']);
    await ds.destroy();
  });
});
