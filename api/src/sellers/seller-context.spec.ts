import { DataSource } from 'typeorm';
import { Seller, SellerTeamMember, User } from '../database/entities';
import type { TeamRole } from '../database/entities';
import { testDb } from '../testing/test-db';
import { SELLER_ERRORS, SellerContextService, sellerContext } from './seller-context';

let ds: DataSource;
let settings: Record<string, string>;
let svc: SellerContextService;

const caller = (u: User) => ({ id: u.id, role: u.role, name: u.name });

async function user(name: string, role: User['role'] = 'seller', extra: Partial<User> = {}): Promise<User> {
  const repo = ds.getRepository(User);
  return repo.save(repo.create({ email: `${name}@x.test`, emailHash: `h-${name}`, passwordHash: 'x', name, role, ...extra }));
}
async function store(owner: User | null, over: Partial<Seller> = {}): Promise<Seller> {
  const repo = ds.getRepository(Seller);
  return repo.save(repo.create({ name: `Store of ${owner?.name ?? 'nobody'}`, userId: owner?.id ?? null, status: 'approved', ...over }));
}
async function join(seller: Seller, who: User, role: TeamRole, status: SellerTeamMember['status'] = 'active') {
  const repo = ds.getRepository(SellerTeamMember);
  return repo.save(repo.create({ sellerId: seller.id, userId: who.id, emailHash: `h-${who.name}`, email: `${who.name}@x.test`, role, status, invitedBy: seller.userId ?? 'x' }));
}

beforeEach(async () => {
  ds = await testDb();
  settings = {};
  svc = new SellerContextService(ds.getRepository(Seller), ds.getRepository(SellerTeamMember), ds.getRepository(User), { get: async (k: string) => settings[k] ?? null } as never);
});
afterEach(() => ds.destroy());

describe('sellerContext: who is "my seller"', () => {
  it('an owner resolves to their store with every permission', async () => {
    const owner = await user('owner');
    const s = await store(owner);
    const ctx = await svc.resolve(caller(owner), 'account');
    expect(ctx.seller.id).toBe(s.id);
    expect(ctx.member).toBe('owner');
    expect(ctx.isOwner).toBe(true);
    expect(ctx.permissions).toContain('payout_account');
  });

  it('a team member resolves to the store they work for, acting as the owner account', async () => {
    const owner = await user('owner');
    const s = await store(owner);
    const fin = await user('fin');
    await join(s, fin, 'finance');
    const ctx = await svc.resolve(caller(fin), 'finance');
    expect(ctx.seller.id).toBe(s.id);
    expect(ctx.member).toBe('finance');
    expect(ctx.isOwner).toBe(false);
    // services key everything by the owner's account; the name stays the caller's
    expect(ctx.actor).toEqual({ id: owner.id, name: 'fin', role: 'seller' });
    expect(ctx.user.id).toBe(fin.id);
    expect(ctx.ownerIds).toEqual([s.id, owner.id]);
  });

  it('the global helper resolves the same way as the service', async () => {
    const owner = await user('owner');
    const s = await store(owner);
    expect((await sellerContext(caller(owner), 'orders')).seller.id).toBe(s.id);
  });

  it('is refused for accounts that are not sellers, and for sellers with no store', async () => {
    const cust = await user('cust', 'customer');
    const admin = await user('adm', 'admin');
    const lone = await user('lone');
    await expect(svc.resolve(caller(cust), 'any')).rejects.toThrow(SELLER_ERRORS.sellersOnly);
    await expect(svc.resolve(caller(admin), 'any')).rejects.toThrow(SELLER_ERRORS.sellersOnly);
    await expect(svc.resolve(caller(lone), 'any')).rejects.toThrow(SELLER_ERRORS.noStore);
  });

  it('an invited or removed member is nobody', async () => {
    const owner = await user('owner');
    const s = await store(owner);
    const invited = await user('invited');
    const removed = await user('removed');
    await join(s, invited, 'orders', 'invited');
    await join(s, removed, 'orders', 'removed');
    await expect(svc.resolve(caller(invited), 'orders')).rejects.toThrow(SELLER_ERRORS.noStore);
    await expect(svc.resolve(caller(removed), 'orders')).rejects.toThrow(SELLER_ERRORS.noStore);
  });

  it('an owner who is also (stale) staff elsewhere is the owner of their own store', async () => {
    const o1 = await user('o1');
    const o2 = await user('o2');
    const s1 = await store(o1);
    const s2 = await store(o2);
    await join(s1, o2, 'finance');
    expect((await svc.resolve(caller(o2), 'account')).seller.id).toBe(s2.id);
  });
});

describe('sellerContext: roles are enforced', () => {
  const cases: [TeamRole, string, boolean][] = [
    ['finance', 'finance', true],
    ['finance', 'orders', false],
    ['finance', 'catalog', false],
    ['finance', 'support', false],
    ['catalog', 'catalog', true],
    ['catalog', 'finance', false],
    ['orders', 'orders', true],
    ['orders', 'catalog', false],
    ['orders', 'catalog_read', true],
    ['support', 'support', true],
    ['support', 'orders', false],
    ['manager', 'catalog', true],
    ['manager', 'finance', true],
    ['manager', 'storefront', true],
    ['manager', 'team', false],
    ['manager', 'payout_account', false],
    ['manager', 'account', false],
  ];
  it.each(cases)('%s asking for %s -> allowed: %s', async (role, permission, allowed) => {
    const owner = await user('owner');
    const s = await store(owner);
    const m = await user('m');
    await join(s, m, role);
    const run = svc.resolve(caller(m), permission as never);
    if (allowed) await expect(run).resolves.toMatchObject({ member: role });
    else await expect(run).rejects.toThrow(SELLER_ERRORS.role(role));
  });

  it('the message names the role so the member knows to ask the owner', async () => {
    const owner = await user('owner');
    const s = await store(owner);
    const m = await user('m');
    await join(s, m, 'finance');
    await expect(svc.resolve(caller(m), 'orders')).rejects.toThrow('Your team role (finance) does not allow this. Ask the store owner.');
  });
});

describe('sellerContext: a suspended store is read-only', () => {
  async function suspended(role: TeamRole | 'owner') {
    const owner = await user('owner');
    const s = await store(owner, { status: 'suspended' });
    if (role === 'owner') return { who: owner, s };
    const m = await user('m');
    await join(s, m, role);
    return { who: m, s };
  }

  it.each(['orders', 'finance', 'insight', 'any'] as const)('may still READ %s', async (permission) => {
    const { who } = await suspended('owner');
    await expect(svc.resolve(caller(who), permission, { write: false })).resolves.toMatchObject({ suspended: true });
  });

  it.each(['orders', 'finance', 'insight', 'any', 'catalog', 'support', 'storefront', 'team', 'account'] as const)('may not WRITE %s', async (permission) => {
    const { who } = await suspended('owner');
    await expect(svc.resolve(caller(who), permission)).rejects.toThrow(SELLER_ERRORS.suspended);
  });

  it.each(['catalog', 'catalog_read', 'support', 'storefront', 'team', 'account', 'payout_account'] as const)('may not even read %s', async (permission) => {
    const { who } = await suspended('owner');
    await expect(svc.resolve(caller(who), permission, { write: false })).rejects.toThrow(SELLER_ERRORS.suspended);
  });

  it('`allowSuspended` lets the few self-explaining calls through (resubmit, subscribe)', async () => {
    const { who } = await suspended('owner');
    await expect(svc.resolve(caller(who), 'account')).rejects.toThrow(SELLER_ERRORS.suspended);
    await expect(svc.resolve(caller(who), 'account', { allowSuspended: true })).resolves.toMatchObject({ suspended: true });
    // it never grants a permission the role does not have
    const owner = await user('o2');
    const s = await store(owner, { status: 'suspended' });
    const m = await user('m2');
    await join(s, m, 'finance');
    await expect(svc.resolve(caller(m), 'account', { allowSuspended: true })).rejects.toThrow(SELLER_ERRORS.role('finance'));
  });

  it('staff of a suspended store are read-only too (finance still sees earnings)', async () => {
    const { who } = await suspended('finance');
    await expect(svc.resolve(caller(who), 'finance', { write: false })).resolves.toBeDefined();
    await expect(svc.resolve(caller(who), 'finance')).rejects.toThrow(SELLER_ERRORS.suspended);
  });

  it('pending and rejected stores are not read-only here (handlers check approval themselves)', async () => {
    const owner = await user('owner');
    await store(owner, { status: 'pending' });
    await expect(svc.resolve(caller(owner), 'catalog')).resolves.toBeDefined();
  });
});

describe('sellerContext: two-factor authentication required for owners', () => {
  it('stops an owner without 2FA once the setting is on, on everything but `any`', async () => {
    settings.seller2faRequired = 'true';
    const owner = await user('owner');
    await store(owner);
    await expect(svc.resolve(caller(owner), 'orders')).rejects.toThrow(SELLER_ERRORS.twofaRequired);
    await expect(svc.resolve(caller(owner), 'orders', { write: false })).rejects.toThrow(SELLER_ERRORS.twofaRequired);
    await expect(svc.resolve(caller(owner), 'any', { write: false })).resolves.toBeDefined();
  });

  it('lets an owner with 2FA through', async () => {
    settings.seller2faRequired = 'true';
    const owner = await user('owner', 'seller', { twofaEnabled: true, twofaSecret: 'ABC' });
    await store(owner);
    await expect(svc.resolve(caller(owner), 'orders')).resolves.toBeDefined();
  });

  it('does not apply to staff, nor when the setting is off', async () => {
    const owner = await user('owner');
    const s = await store(owner);
    const m = await user('m');
    await join(s, m, 'finance');
    await expect(svc.resolve(caller(owner), 'orders')).resolves.toBeDefined();
    settings.seller2faRequired = 'true';
    await expect(svc.resolve(caller(m), 'finance')).resolves.toBeDefined();
  });
});
