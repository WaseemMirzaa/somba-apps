import { DataSource } from 'typeorm';
import { Seller, SellerTeamMember, User } from '../database/entities';
import type { TeamRole } from '../database/entities';
import { testDb } from '../testing/test-db';
import { SellerContextService } from './seller-context';
import { SellerPlatformKit } from './seller-kit';

let ds: DataSource;
let kit: SellerPlatformKit;
let adopted: string[][];

const kyc = {
  name: 'Shop',
  legalName: 'Shop SARL',
  phone: '+243812345678',
  idNumber: 'ID-12345',
  rccm: 'RCCM-1',
  taxNumber: 'TAX-1',
  documentUrls: ['http://x/uploads/11111111-2222-3333-4444-555555555555.png'],
  acceptTerms: true,
};

async function user(name: string): Promise<User> {
  const repo = ds.getRepository(User);
  return repo.save(repo.create({ email: `${name}@x.test`, emailHash: `h-${name}`, passwordHash: 'x', name, role: 'seller' }));
}
const caller = (u: User) => ({ id: u.id, role: u.role, name: u.name });

beforeEach(async () => {
  ds = await testDb();
  adopted = [];
  const ctx = new SellerContextService(ds.getRepository(Seller), ds.getRepository(SellerTeamMember), ds.getRepository(User), { get: async () => null } as never);
  const sellersSvc = {
    withPlanState: async (s: Seller) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      userId: s.userId,
      legalName: 'Shop SARL',
      phone: '+243812345678',
      idNumber: 'ID-12345',
      rccm: 'R',
      taxNumber: 'T',
      documentUrls: ['http://x/api/v1/private-uploads/1'],
      payoutMethod: 'bank',
      payoutAccountMasked: 'FR •••• 5678',
      termsAcceptedAt: new Date(),
      kycSubmittedAt: new Date(),
      handlingDays: 2,
      rating: 4.5,
    }),
  };
  const files = { adopt: async (urls: string[]) => (adopted.push(urls), urls.map((u) => u.replace('/uploads/', '/api/v1/private-uploads/'))) };
  kit = new SellerPlatformKit(ctx, {} as never, {} as never, {} as never, files as never, {} as never, {} as never, sellersSvc as never);
});
afterEach(() => ds.destroy());

async function storeWith(role?: TeamRole) {
  const owner = await user('owner');
  const repo = ds.getRepository(Seller);
  const seller = await repo.save(repo.create({ name: 'Shop', userId: owner.id, status: 'approved' }));
  if (!role) return { owner, seller };
  const m = await user('member');
  const team = ds.getRepository(SellerTeamMember);
  await team.save(team.create({ sellerId: seller.id, userId: m.id, emailHash: 'h-member', email: 'member@x.test', role, status: 'active', invitedBy: owner.id }));
  return { owner, seller, member: m };
}

describe('SellerPlatformKit.mine (sellers:mine)', () => {
  it('the owner gets the whole store and an owner membership', async () => {
    const { owner } = await storeWith();
    const out = (await kit.mine(caller(owner))) as Record<string, unknown>;
    expect(out).toMatchObject({ legalName: 'Shop SARL', idNumber: 'ID-12345', payoutMethod: 'bank', handlingDays: 2 });
    expect(out.membership).toMatchObject({ role: 'owner', isOwner: true });
    expect((out.membership as { permissions: string[] }).permissions).toContain('payout_account');
  });

  it('staff get the store without the owner\'s papers, payout destination or account id', async () => {
    const { member } = await storeWith('finance');
    const out = (await kit.mine(caller(member!))) as Record<string, unknown>;
    for (const k of ['legalName', 'phone', 'idNumber', 'rccm', 'taxNumber', 'documentUrls', 'termsAcceptedAt', 'kycSubmittedAt', 'payoutMethod', 'payoutAccountMasked', 'userId']) {
      expect(out).not.toHaveProperty(k);
    }
    expect(out).toMatchObject({ name: 'Shop', handlingDays: 2, rating: 4.5 });
    expect(out.membership).toMatchObject({ role: 'finance', isOwner: false });
    expect((out.membership as { permissions: string[] }).permissions).toEqual(expect.arrayContaining(['finance', 'insight', 'any']));
    expect((out.membership as { permissions: string[] }).permissions).not.toContain('orders');
  });

  it('an account with no store (and a customer) gets null', async () => {
    const lone = await user('lone');
    expect(await kit.mine(caller(lone))).toBeNull();
    expect(await kit.mine({ id: 'c', role: 'customer', name: 'c' })).toBeNull();
  });
});

describe('SellerPlatformKit.orNull', () => {
  it('is null for non-sellers and for sellers with no store, a context otherwise', async () => {
    const { owner, member } = await storeWith('orders');
    const lone = await user('lone');
    expect(await kit.orNull({ id: 'c', role: 'customer', name: 'c' }, 'orders')).toBeNull();
    expect(await kit.orNull(caller(lone), 'orders')).toBeNull();
    expect((await kit.orNull(caller(owner), 'orders'))?.isOwner).toBe(true);
    expect((await kit.orNull(caller(member!), 'orders'))?.member).toBe('orders');
  });

  it('still refuses a role that is not allowed (null means "no store", not "no permission")', async () => {
    const { member } = await storeWith('orders');
    await expect(kit.orNull(caller(member!), 'finance')).rejects.toThrow(/does not allow/);
  });
});

describe('SellerPlatformKit.kycBody', () => {
  it('validates the application first (nothing is moved for a bad one), then adopts the documents', async () => {
    const out = await kit.kycBody('owner-1', { ...kyc });
    expect(adopted).toEqual([kyc.documentUrls]);
    expect(out.documentUrls[0]).toContain('/api/v1/private-uploads/');
    expect(out).toMatchObject({ name: 'Shop', legalName: 'Shop SARL' });
    adopted.length = 0;
    await expect(kit.kycBody('owner-1', { ...kyc, legalName: '' })).rejects.toThrow();
    await expect(kit.kycBody('owner-1', { ...kyc, documentUrls: [] })).rejects.toThrow();
    await expect(kit.kycBody('owner-1', { ...kyc, acceptTerms: false })).rejects.toThrow();
    expect(adopted).toEqual([]);
  });
});
