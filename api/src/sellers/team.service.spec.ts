import { DataSource } from 'typeorm';
import { Seller, SellerTeamMember, User } from '../database/entities';
import { recordingEmitter, testDb } from '../testing/test-db';
import { UsersService } from '../users/users.service';
import { SellerContextService } from './seller-context';
import type { SellerContext } from './seller-context';
import { TeamDirectory } from './team-directory';
import { INVITES_PER_HOUR, INVITE_TTL_MS, TeamService, maskEmail } from './team.service';

let ds: DataSource;
let svc: TeamService;
let ctxSvc: SellerContextService;
let emitter: ReturnType<typeof recordingEmitter>;
let notices: { to: string; title: string; body: string; type?: string }[];
let mails: { to: string; subject: string; text: string }[];
let seats: number | null;

const users = () => new UsersService(ds.getRepository(User));

async function user(name: string, role: User['role'] = 'seller'): Promise<User> {
  return users().create({ email: `${name}@x.test`, passwordHash: 'x', name, role });
}
async function owned(name = 'owner'): Promise<{ owner: User; seller: Seller; ctx: SellerContext }> {
  const owner = await user(name);
  const repo = ds.getRepository(Seller);
  const seller = await repo.save(repo.create({ name: `${name} store`, userId: owner.id, status: 'approved' }));
  return { owner, seller, ctx: await ctxSvc.resolve({ id: owner.id, role: 'seller', name: owner.name }, 'team') };
}
const caller = (u: User) => ({ id: u.id, role: u.role, name: u.name });
const tokenOf = (r: { devToken?: string }) => r.devToken as string;

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  notices = [];
  mails = [];
  seats = null;
  const dir = new TeamDirectory(ds.getRepository(SellerTeamMember), ds.getRepository(Seller));
  ctxSvc = new SellerContextService(ds.getRepository(Seller), ds.getRepository(SellerTeamMember), ds.getRepository(User), { get: async () => null } as never);
  svc = new TeamService(
    ds.getRepository(SellerTeamMember),
    ds.getRepository(Seller),
    ds.getRepository(User),
    users(),
    { toUser: async (to: string, n: { title: string; body: string; type?: string }) => void notices.push({ to, ...n }) } as never,
    { sendEmail: async (to: string, subject: string, text: string) => (mails.push({ to, subject, text }), true) } as never,
    emitter as never,
    dir,
    { planOf: async () => ({ id: 'free', name: 'Free', perks: { teamSeats: seats } }) } as never,
  );
});
afterEach(() => ds.destroy());

describe('TeamService.invite', () => {
  it('invites by e-mail, stores only a hash of the token, and mails a bilingual link', async () => {
    const { ctx } = await owned();
    const r = await svc.invite(ctx, { email: 'Fiona@Shop.test ', role: 'finance', name: 'Fiona' });
    expect(r.member).toMatchObject({ email: 'fiona@shop.test', role: 'finance', status: 'invited', name: 'Fiona' });
    expect(r.devToken).toMatch(/^[0-9a-f]{64}$/);
    const row = await ds.getRepository(SellerTeamMember).findOneByOrFail({ id: r.member.id });
    expect(row.inviteTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.inviteTokenHash).not.toBe(r.devToken);
    expect(row.inviteExpiresAt!.getTime()).toBeGreaterThan(Date.now() + INVITE_TTL_MS - 5000);
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe('fiona@shop.test');
    expect(mails[0].text).toContain(`/seller/team/accept?token=${r.devToken}`);
    expect(mails[0].text).toMatch(/Bonjour/);
  });

  it('does not return the dev token in production', async () => {
    const was = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { ctx } = await owned();
      expect((await svc.invite(ctx, { email: 'a@b.cd', role: 'orders' })).devToken).toBeUndefined();
    } finally {
      process.env.NODE_ENV = was;
    }
  });

  it.each([['', 'orders'], ['nope', 'orders'], ['a@b', 'orders'], ['a@b.cd', 'owner'], ['a@b.cd', 'admin'], ['a@b.cd', '']])('refuses %j as %j', async (email, role) => {
    const { ctx } = await owned();
    await expect(svc.invite(ctx, { email, role })).rejects.toThrow();
  });

  it('refuses the owner, a shopper, staff of another role, another store\'s owner and another store\'s staff', async () => {
    const { ctx, owner } = await owned();
    await expect(svc.invite(ctx, { email: owner.email, role: 'orders' })).rejects.toThrow(/already own/);
    await user('shopper', 'customer');
    await expect(svc.invite(ctx, { email: 'shopper@x.test', role: 'orders' })).rejects.toThrow(/shopper or staff account/);
    await user('whouse', 'warehouse_staff');
    await expect(svc.invite(ctx, { email: 'whouse@x.test', role: 'orders' })).rejects.toThrow(/shopper or staff account/);
    const { owner: other, ctx: otherCtx } = await owned('other');
    await expect(svc.invite(ctx, { email: other.email, role: 'orders' })).rejects.toThrow(/already owns a store/);
    const worker = await user('worker');
    const r = await svc.invite(otherCtx, { email: worker.email, role: 'orders' });
    await svc.accept(caller(worker), tokenOf(r));
    await expect(svc.invite(ctx, { email: worker.email, role: 'finance' })).rejects.toThrow(/another store/);
  });

  it('tells an invitee who already has an account (a notice), but not a stranger', async () => {
    const { ctx } = await owned();
    const acct = await user('known');
    await svc.invite(ctx, { email: acct.email, role: 'orders' });
    await svc.invite(ctx, { email: 'unknown@x.test', role: 'orders' });
    expect(notices.filter((n) => n.title === 'Team invitation').map((n) => n.to)).toEqual([acct.id]);
  });

  it('enforces the plan seats; a re-sent invitation takes no extra seat; a removed seat is free again', async () => {
    seats = 2;
    const { ctx } = await owned();
    await svc.invite(ctx, { email: 'a@x.test', role: 'orders' });
    await svc.invite(ctx, { email: 'b@x.test', role: 'orders' });
    await expect(svc.invite(ctx, { email: 'c@x.test', role: 'orders' })).rejects.toThrow(/allows 2 team members/);
    await expect(svc.invite(ctx, { email: 'a@x.test', role: 'support' })).resolves.toBeDefined();
    const list = await svc.list(ctx);
    expect(list.seats).toEqual({ used: 2, max: 2 });
    await svc.remove(ctx, { memberId: list.members.find((m) => m.email === 'a@x.test')!.id });
    await expect(svc.invite(ctx, { email: 'c@x.test', role: 'orders' })).resolves.toBeDefined();
  });

  it('a plan with 0 seats says it has no team accounts; null means unlimited', async () => {
    const { ctx } = await owned();
    seats = 0;
    await expect(svc.invite(ctx, { email: 'a@x.test', role: 'orders' })).rejects.toThrow(/does not include team accounts/);
    seats = null;
    for (let i = 0; i < 12; i++) await svc.invite(ctx, { email: `p${i}@x.test`, role: 'orders' });
    expect((await svc.list(ctx)).seats).toEqual({ used: 12, max: null });
  });

  it('limits the invitation e-mails a store can send per hour', async () => {
    const { ctx } = await owned();
    for (let i = 0; i < INVITES_PER_HOUR; i++) await svc.invite(ctx, { email: 'same@x.test', role: 'orders' });
    await expect(svc.invite(ctx, { email: 'same@x.test', role: 'orders' })).rejects.toThrow(/too many invitations/);
    expect(mails).toHaveLength(INVITES_PER_HOUR);
    // another store is not affected
    const { ctx: other } = await owned('other');
    await expect(svc.invite(other, { email: 'same@x.test', role: 'orders' })).resolves.toBeDefined();
  });

  it('re-inviting an active member is refused; re-inviting a removed one starts over', async () => {
    const { ctx } = await owned();
    const w = await user('w');
    const r = await svc.invite(ctx, { email: w.email, role: 'orders' });
    await svc.accept(caller(w), tokenOf(r));
    await expect(svc.invite(ctx, { email: w.email, role: 'orders' })).rejects.toThrow(/already on your team/);
    const m = (await svc.list(ctx)).members.find((x) => x.userId === w.id)!;
    await svc.remove(ctx, { memberId: m.id });
    const again = await svc.invite(ctx, { email: w.email, role: 'finance' });
    expect(again.member).toMatchObject({ role: 'finance', status: 'invited', userId: null });
  });
});

describe('TeamService.accept', () => {
  it('takes the seat with the invited address and tells the owner', async () => {
    const { ctx, owner, seller } = await owned();
    const w = await user('worker');
    const r = await svc.invite(ctx, { email: w.email, role: 'finance' });
    const out = await svc.accept(caller(w), tokenOf(r));
    expect(out).toMatchObject({ role: 'finance', seller: { id: seller.id } });
    expect(out.permissions).toContain('finance');
    expect(out.permissions).not.toContain('team');
    const row = await ds.getRepository(SellerTeamMember).findOneByOrFail({ id: r.member.id });
    expect(row).toMatchObject({ status: 'active', userId: w.id, inviteTokenHash: null, name: 'worker' });
    expect(notices.find((n) => n.title === 'Team member joined')).toMatchObject({ to: owner.id, type: 'team' });
    expect(emitter.sent.some((e) => e.to === `user:${owner.id}` && e.event === 'team:updated')).toBe(true);
    // the resolver now sees the member
    expect((await ctxSvc.resolve(caller(w), 'finance')).seller.id).toBe(seller.id);
  });

  it('is single-use and expires after 7 days', async () => {
    const { ctx } = await owned();
    const w = await user('worker');
    const r = await svc.invite(ctx, { email: w.email, role: 'orders' });
    await svc.accept(caller(w), tokenOf(r));
    await expect(svc.accept(caller(w), tokenOf(r))).rejects.toThrow(/no longer valid/);

    const w2 = await user('late');
    const r2 = await svc.invite(ctx, { email: w2.email, role: 'orders' });
    await ds.getRepository(SellerTeamMember).update({ id: r2.member.id }, { inviteExpiresAt: new Date(Date.now() - 1000) });
    await expect(svc.accept(caller(w2), tokenOf(r2))).rejects.toThrow(/expired/);
    expect((await svc.preview(tokenOf(r2))).expired).toBe(true);
  });

  it('refuses another e-mail address, a non-seller account, an owner, a garbage token', async () => {
    const { ctx, owner } = await owned();
    const w = await user('worker');
    const r = await svc.invite(ctx, { email: w.email, role: 'orders' });
    const impostor = await user('impostor');
    await expect(svc.accept(caller(impostor), tokenOf(r))).rejects.toThrow(/another e-mail address/);
    const shopper = await user('shop', 'customer');
    await expect(svc.accept(caller(shopper), tokenOf(r))).rejects.toThrow(/seller account/);
    await expect(svc.accept(caller(owner), tokenOf(r))).rejects.toThrow();
    await expect(svc.accept(caller(w), 'f'.repeat(64))).rejects.toThrow(/no longer valid/);
    await expect(svc.accept(caller(w), 12345)).rejects.toThrow(/no longer valid/);
    await expect(svc.accept(caller(w), undefined)).rejects.toThrow(/no longer valid/);
  });

  it('an account works for one store at a time', async () => {
    const { ctx } = await owned('a');
    const { ctx: ctxB } = await owned('b');
    const w = await user('worker');
    const ra = await svc.invite(ctx, { email: w.email, role: 'orders' });
    const rb = await svc.invite(ctxB, { email: w.email, role: 'orders' });
    await svc.accept(caller(w), tokenOf(ra));
    await expect(svc.accept(caller(w), tokenOf(rb))).rejects.toThrow(/already work for a store/);
  });

  it('preview shows the store, role and invited address, and nothing for a bad token', async () => {
    const { ctx } = await owned();
    const r = await svc.invite(ctx, { email: 'someone@x.test', role: 'support' });
    expect(await svc.preview(tokenOf(r))).toEqual({ storeName: 'owner store', role: 'support', email: 'someone@x.test', expired: false });
    await expect(svc.preview('nope')).rejects.toThrow(/no longer valid/);
  });

  it('masks the invited address in the error, not the owner\'s own list', () => {
    expect(maskEmail('amina@shop.test')).toBe('a***@shop.test');
    expect(maskEmail('weird')).toBe('***');
  });
});

describe('TeamService roles and removal', () => {
  async function team() {
    const base = await owned();
    const w = await user('worker');
    const r = await svc.invite(base.ctx, { email: w.email, role: 'orders' });
    await svc.accept(caller(w), tokenOf(r));
    return { ...base, w, memberId: r.member.id };
  }

  it('changes a role; the new role applies on the next call and the member is told', async () => {
    const { ctx, w, memberId } = await team();
    await expect(ctxSvc.resolve(caller(w), 'finance')).rejects.toThrow(/does not allow/);
    const m = await svc.setRole(ctx, { memberId, role: 'finance' });
    expect(m.role).toBe('finance');
    await expect(ctxSvc.resolve(caller(w), 'finance')).resolves.toBeDefined();
    await expect(ctxSvc.resolve(caller(w), 'orders')).rejects.toThrow(/does not allow/);
    expect(notices.find((n) => n.title === 'Team role changed')).toMatchObject({ to: w.id });
    expect(emitter.sent.find((e) => e.to === `user:${w.id}` && e.event === 'team:me')?.payload.role).toBe('finance');
  });

  it('refuses owner / unknown roles and members of other stores', async () => {
    const { ctx, memberId } = await team();
    await expect(svc.setRole(ctx, { memberId, role: 'owner' })).rejects.toThrow(/Choose a role/);
    await expect(svc.setRole(ctx, { memberId, role: 'root' })).rejects.toThrow(/Choose a role/);
    const { ctx: other } = await owned('other');
    await expect(svc.setRole(other, { memberId, role: 'finance' })).rejects.toThrow(/not found/);
    await expect(svc.remove(other, { memberId })).rejects.toThrow(/not found/);
    await expect(svc.setRole(ctx, { memberId: 'nope', role: 'finance' })).rejects.toThrow(/not found/);
  });

  it('removing ends access at once, tells the member, and cancels an open invitation', async () => {
    const { ctx, w, memberId, owner } = await team();
    await svc.remove(ctx, { memberId });
    await expect(ctxSvc.resolve(caller(w), 'orders')).rejects.toThrow(/Open a store first/);
    expect(notices.find((n) => n.title === 'Removed from store team')).toMatchObject({ to: w.id });
    expect(emitter.sent.some((e) => e.to === `user:${w.id}` && e.event === 'team:removed')).toBe(true);
    await expect(svc.remove(ctx, { memberId })).rejects.toThrow(/not found/);

    const open = await svc.invite(ctx, { email: 'pending@x.test', role: 'orders' });
    await svc.remove(ctx, { memberId: open.member.id });
    await expect(svc.preview(tokenOf(open))).rejects.toThrow(/no longer valid/);
    expect((await svc.list(ctx)).members.map((m) => m.id)).toEqual(['owner']);
    void owner;
  });

  it('a member can leave, and the owner is told; someone with no seat cannot', async () => {
    const { w, owner } = await team();
    await svc.leave({ id: w.id, name: w.name });
    await expect(ctxSvc.resolve(caller(w), 'orders')).rejects.toThrow(/Open a store first/);
    expect(notices.find((n) => n.title === 'Team member left')).toMatchObject({ to: owner.id });
    await expect(svc.leave({ id: w.id, name: w.name })).rejects.toThrow(/do not work for a store/);
  });

  it('closing the store ends every seat', async () => {
    const { ctx, seller, w } = await team();
    await svc.invite(ctx, { email: 'open@x.test', role: 'orders' });
    expect(await svc.releaseAll(seller)).toBe(2);
    await expect(ctxSvc.resolve(caller(w), 'orders')).rejects.toThrow(/Open a store first/);
  });

  it('shows the name a member has now, not the one they joined with', async () => {
    const { ctx, w } = await team();
    await ds.getRepository(User).update({ id: w.id }, { name: 'Renamed Worker' });
    expect((await svc.list(ctx)).members[1].name).toBe('Renamed Worker');
  });

  it('lists the owner first, then the staff, with seats', async () => {
    const { ctx, w } = await team();
    const out = await svc.list(ctx);
    expect(out.members[0]).toMatchObject({ id: 'owner', role: 'owner', isOwner: true, status: 'active' });
    expect(out.members[1]).toMatchObject({ userId: w.id, role: 'orders', status: 'active' });
    expect(out.seats.used).toBe(1);
    expect(svc.me(ctx)).toMatchObject({ role: 'owner', isOwner: true });
  });
});
