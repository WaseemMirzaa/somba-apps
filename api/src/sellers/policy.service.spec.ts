import { DataSource } from 'typeorm';
import { Seller, SellerPolicyRevision, Translation } from '../database/entities';
import { SellerPolicyService, touchesPolicy } from './policy.service';
import { ROLE_GROUPS, inRoleGroup } from '../common/role-groups';
import { policyTemplate } from './policy-template';
import { addSeller, recordingEmitter, testDb, testTranslations } from '../testing/test-db';
import type { SellerContext } from './seller-context';
import { SellerPolicyRevisions1793480000002 } from '../database/migrations/1793480000002-SellerPolicyRevisions';
import { AwaitingSupport1793480000001 } from '../database/migrations/1793480000001-AwaitingSupport';

let ds: DataSource;
let emitter: ReturnType<typeof recordingEmitter>;
let notices: { to: string; title: string; body: string; fr?: { title: string; body: string } | null }[];
let roleNotices: { role: string; title: string; body: string }[];
let svc: SellerPolicyService;
let translations: ReturnType<typeof testTranslations>;
let windowDays: string | null;

const admin = { id: 'admin-1', name: 'Admin' };
const ctxOf = (seller: Seller) => ({ seller, isOwner: true, member: 'owner', user: { id: seller.userId ?? 'u', role: 'seller', name: 'u' }, actor: { id: seller.userId ?? 'u', name: 'u', role: 'seller' }, ownerIds: [seller.id], suspended: false, permissions: [] }) as unknown as SellerContext;
const live = (id: string) => ds.getRepository(Seller).findOneByOrFail({ id });
const revs = (sellerId: string) => ds.getRepository(SellerPolicyRevision).find({ where: { sellerId }, order: { createdAt: 'ASC' } });

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  notices = [];
  roleNotices = [];
  windowDays = null;
  translations = testTranslations(ds);
  const sellersSvc = {
    withPlanState: async (s: Seller) => ({ id: s.id, name: s.name, returnsPolicy: s.returnsPolicy }),
    // what the real `present` serves: the live text in both languages from the translation rows
    present: async (rows: Seller[]) => {
      const texts = await translations.present('seller', rows as never);
      return rows.map((s) => ({ ...s, returnsPolicy: texts.get(s.id)?.texts.returnsPolicy ?? s.returnsPolicy, returnsPolicyFr: texts.get(s.id)?.texts.returnsPolicyFr ?? s.returnsPolicy, shippingPolicy: texts.get(s.id)?.texts.shippingPolicy ?? s.shippingPolicy, shippingPolicyFr: texts.get(s.id)?.texts.shippingPolicyFr ?? s.shippingPolicy }));
    },
  };
  const notifications = {
    toUser: async (to: string, n: { title: string; body: string; fr?: { title: string; body: string } | null }) => void notices.push({ to, ...n }),
    toRole: async (role: string, n: { title: string; body: string }) => void roleNotices.push({ role, ...n }),
  };
  svc = new SellerPolicyService(ds.getRepository(SellerPolicyRevision), ds.getRepository(Seller), sellersSvc as never, emitter as never, notifications as never, { get: async () => windowDays } as never, translations);
});
afterEach(() => ds.destroy());

describe('a seller proposes: the live text is left alone', () => {
  it('creates one pending revision, tells the owner and the policy admins, and notifies moderation', async () => {
    const s = await addSeller(ds, { userId: 'owner-1', returnsPolicy: 'Live: returns within 7 days.' });
    const rev = await svc.propose(ctxOf(s), { returnsPolicy: 'Returns are accepted within 14 days.', shippingPolicyFr: 'Expédition sous deux jours ouvrés.' });
    expect(rev).toMatchObject({ sellerId: s.id, status: 'pending', returnsPolicy: 'Returns are accepted within 14 days.', shippingPolicyFr: 'Expédition sous deux jours ouvrés.', returnsPolicyFr: null, shippingPolicy: null, proposedBy: 'owner-1', decidedBy: null, decidedAt: null });
    expect((await live(s.id)).returnsPolicy).toBe('Live: returns within 7 days.');
    expect(emitter.sent.find((e) => e.to === 'user:owner-1' && e.event === 'seller:policy')?.payload).toMatchObject({ status: 'pending' });
    expect(emitter.sent.find((e) => e.event === 'policy:pending')?.to.split(',').sort()).toEqual([...ROLE_GROUPS.storePolicy].sort());
    expect(roleNotices).toHaveLength(1);
    expect(roleNotices[0]).toMatchObject({ role: 'admin_moderation', title: 'Store policy awaiting approval', body: `${s.name}: new returns or shipping policy to review.` });
  });

  it('keeps ONE pending revision per store: a newer proposal replaces the fields it names and keeps the rest', async () => {
    const s = await addSeller(ds, { userId: 'owner-1' });
    await svc.propose(ctxOf(s), { returnsPolicy: 'Returns are accepted within 14 days.', shippingPolicy: 'We ship within two working days.' });
    const second = await svc.propose(ctxOf(s), { returnsPolicyFr: 'Retours acceptés sous 14 jours.' });
    expect(await revs(s.id)).toHaveLength(1);
    // the French authoring of the returns policy replaces the English proposal; the shipping proposal stays
    expect(second).toMatchObject({ returnsPolicy: null, returnsPolicyFr: 'Retours acceptés sous 14 jours.', shippingPolicy: 'We ship within two working days.' });
  });

  it('validates like the live write did, and a clear is kept as a clear', async () => {
    const s = await addSeller(ds);
    await expect(svc.propose(ctxOf(s), { returnsPolicy: 'short' })).rejects.toThrow(/Returns policy/);
    await expect(svc.propose(ctxOf(s), { shippingPolicyFr: 'x'.repeat(2001) })).rejects.toThrow(/Shipping policy \(French\)/);
    expect(await revs(s.id)).toHaveLength(0);
    const cleared = await svc.propose(ctxOf(s), { returnsPolicy: '' });
    expect(cleared?.returnsPolicy).toBe('');
    expect(await svc.propose(ctxOf(s), {})).toBeNull();
    expect(touchesPolicy({ returnsPolicyFr: 'x' })).toBe(true);
    expect(touchesPolicy({ handlingDays: 1 })).toBe(false);
  });

  it('mine: the pending proposal and the last decided one', async () => {
    const s = await addSeller(ds, { userId: 'owner-1' });
    const first = await svc.propose(ctxOf(s), { returnsPolicy: 'Returns are accepted within 14 days.' });
    await svc.reject(admin, first!.id, 'Please list what cannot be returned.');
    await svc.propose(ctxOf(s), { returnsPolicy: 'Returns within 14 days, except opened cosmetics.' });
    const mine = await svc.mine(ctxOf(s));
    expect(mine.pending).toMatchObject({ status: 'pending' });
    expect(mine.lastDecided).toMatchObject({ status: 'rejected', note: 'Please list what cannot be returned.' });
  });
});

describe('an admin decides', () => {
  it('approve copies the proposal into the live fields, translates like a live write, tells the seller in English and French', async () => {
    const s = await addSeller(ds, { userId: 'owner-1' });
    const rev = await svc.propose(ctxOf(s), { returnsPolicy: 'Returns are accepted within 14 days.', shippingPolicyFr: 'Expédition sous deux jours ouvrés.' });
    notices.length = 0;
    const done = await svc.approve(admin, rev!.id, 'Looks good.');
    expect(done).toMatchObject({ status: 'approved', decidedBy: 'admin-1', note: 'Looks good.' });
    expect(done.decidedAt).toBeInstanceOf(Date);
    const row = await live(s.id);
    expect(row.returnsPolicy).toBe('Returns are accepted within 14 days.');
    // the French shipping text is an author row; the English returns text queues a machine translation
    const rows = (await translations.rowsFor('seller', [s.id])).get(s.id) ?? [];
    expect(rows.find((r: Translation) => r.field === 'shippingPolicy' && r.locale === 'fr')).toMatchObject({ origin: 'author', value: 'Expédition sous deux jours ouvrés.' });
    expect(await ds.getRepository('translation_jobs').count()).toBeGreaterThan(0);
    expect(emitter.sent.some((e) => e.to === 'user:owner-1' && e.event === 'seller:updated')).toBe(true);
    expect(emitter.sent.some((e) => e.event === 'seller:updated' && !e.to.startsWith('user:'))).toBe(true);
    expect(emitter.sent.filter((e) => e.to === 'user:owner-1' && e.event === 'seller:policy').at(-1)?.payload.status).toBe('approved');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ to: 'owner-1', title: 'Store policy approved' });
    expect(notices[0].body).toContain('Looks good.');
    // a decided revision cannot be decided twice
    await expect(svc.approve(admin, rev!.id)).rejects.toThrow('This policy change was already decided.');
    await expect(svc.reject(admin, rev!.id, 'Too late for this one.')).rejects.toThrow('This policy change was already decided.');
  });

  it('an approved clear empties the live text', async () => {
    const s = await addSeller(ds, { userId: 'owner-1', returnsPolicy: 'Live: returns within 7 days.' });
    const rev = await svc.propose(ctxOf(s), { returnsPolicy: null });
    await svc.approve(admin, rev!.id);
    expect((await live(s.id)).returnsPolicy).toBeNull();
  });

  it('reject needs a note, leaves the live text alone, and tells the seller why', async () => {
    const s = await addSeller(ds, { userId: 'owner-1', returnsPolicy: 'Live: returns within 7 days.' });
    const rev = await svc.propose(ctxOf(s), { returnsPolicy: 'No returns at all, ever.' });
    notices.length = 0;
    await expect(svc.reject(admin, rev!.id, '')).rejects.toThrow('Tell the seller why the policy was not approved.');
    await expect(svc.reject(admin, rev!.id, 'no')).rejects.toThrow('Tell the seller why the policy was not approved.');
    const done = await svc.reject(admin, rev!.id, 'Customers have a legal right to return defective goods.');
    expect(done).toMatchObject({ status: 'rejected', decidedBy: 'admin-1', note: 'Customers have a legal right to return defective goods.' });
    expect((await live(s.id)).returnsPolicy).toBe('Live: returns within 7 days.');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ to: 'owner-1', title: 'Store policy rejected' });
    expect(notices[0].body).toBe('Your policy change was not approved: Customers have a legal right to return defective goods.');
    expect(notices[0].fr?.body).toBeDefined();
  });

  it('an unknown revision is "not found"', async () => {
    await expect(svc.approve(admin, 'nope')).rejects.toThrow('Policy change not found.');
    await expect(svc.reject(admin, 'nope', 'Some long enough reason')).rejects.toThrow('Policy change not found.');
  });

  it('two admins approving at once: one wins, the live text is written once', async () => {
    const s = await addSeller(ds, { userId: 'owner-1' });
    const rev = await svc.propose(ctxOf(s), { returnsPolicy: 'Returns are accepted within 14 days.' });
    const results = await Promise.allSettled([svc.approve(admin, rev!.id), svc.approve({ id: 'admin-2', name: 'B' }, rev!.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('a failed live write puts the proposal back in the queue', async () => {
    const s = await addSeller(ds, { userId: 'owner-1' });
    const rev = await svc.propose(ctxOf(s), { returnsPolicy: 'Returns are accepted within 14 days.' });
    jest.spyOn(svc, 'writeLive').mockRejectedValueOnce(new Error('db down'));
    await expect(svc.approve(admin, rev!.id)).rejects.toThrow('db down');
    expect(await ds.getRepository(SellerPolicyRevision).findOneByOrFail({ id: rev!.id })).toMatchObject({ status: 'pending', decidedBy: null });
  });

  it('list: pending by default, with the live text beside the proposal; filters by status and store', async () => {
    const a = await addSeller(ds, { name: 'Alpha', userId: 'oa', returnsPolicy: 'Alpha live returns policy.' });
    const b = await addSeller(ds, { name: 'Beta', userId: 'ob' });
    const ra = await svc.propose(ctxOf(a), { returnsPolicy: 'Alpha new returns policy text.' });
    await svc.propose(ctxOf(b), { shippingPolicy: 'Beta ships on Mondays only.' });
    await svc.approve(admin, ra!.id);
    const pending = await svc.list();
    expect(pending.map((r) => r.storeName)).toEqual(['Beta']);
    expect(pending[0].live).toEqual({ returnsPolicy: null, returnsPolicyFr: null, shippingPolicy: null, shippingPolicyFr: null });
    const all = await svc.list({ status: 'all' });
    expect(all).toHaveLength(2);
    const approved = await svc.list({ status: 'approved', sellerId: a.id });
    expect(approved).toHaveLength(1);
    expect(approved[0].live?.returnsPolicy).toBe('Alpha new returns policy text.');
    await expect(svc.list({ status: 'maybe' })).rejects.toThrow('Status must be pending, approved, rejected or all.');
  });
});

describe('an admin edits and publishes any store\'s policy', () => {
  it('goes live at once, records an approved revision by the admin, and tells the seller', async () => {
    const s = await addSeller(ds, { userId: 'owner-1' });
    const done = await svc.publish(admin, { sellerId: s.id, returnsPolicy: 'Returns within 7 days if unused and in the box.', note: 'Aligned with the platform rules.' });
    expect(done).toMatchObject({ status: 'approved', proposedBy: 'admin-1', decidedBy: 'admin-1', returnsPolicy: 'Returns within 7 days if unused and in the box.' });
    expect((await live(s.id)).returnsPolicy).toBe('Returns within 7 days if unused and in the box.');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ to: 'owner-1', title: 'Store policy updated' });
  });

  it('publishing the edited proposal approves that revision; any other pending one is closed as replaced', async () => {
    const s = await addSeller(ds, { userId: 'owner-1' });
    const pending = await svc.propose(ctxOf(s), { returnsPolicy: 'Returns are accepted within 14 days.' });
    const edited = await svc.publish(admin, { sellerId: s.id, revisionId: pending!.id, returnsPolicy: 'Returns are accepted within 7 days.' });
    expect(edited.id).toBe(pending!.id);
    const all = await revs(s.id);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ status: 'approved', returnsPolicy: 'Returns are accepted within 7 days.' });
    // without naming it, a pending proposal is superseded
    const again = await svc.propose(ctxOf(s), { shippingPolicy: 'We ship within two working days.' });
    await svc.publish(admin, { sellerId: s.id, returnsPolicy: 'Returns are accepted within 10 days.' });
    expect(await ds.getRepository(SellerPolicyRevision).findOneByOrFail({ id: again!.id })).toMatchObject({ status: 'rejected', decidedBy: 'admin-1' });
  });

  it('refuses an unknown store, nothing to publish, and an invalid text (nothing is saved)', async () => {
    const s = await addSeller(ds);
    await expect(svc.publish(admin, { sellerId: 'nope', returnsPolicy: 'Returns are accepted within 14 days.' })).rejects.toThrow('Store not found.');
    await expect(svc.publish(admin, { sellerId: s.id })).rejects.toThrow('Nothing to publish: write at least one policy.');
    await expect(svc.publish(admin, { sellerId: s.id, returnsPolicy: 'short' })).rejects.toThrow(/Returns policy/);
    expect(await revs(s.id)).toHaveLength(0);
  });

  it('the silent option (the demo seed) tells nobody', async () => {
    const s = await addSeller(ds, { userId: 'owner-1' });
    await svc.publish(admin, { sellerId: s.id, returnsPolicy: 'Returns within 7 days if unused and in the box.' }, { silent: true });
    expect(notices).toHaveLength(0);
    expect(emitter.sent.some((e) => e.event === 'seller:policy')).toBe(false);
  });
});

describe('the returns-policy template', () => {
  it('is served in English and French with the platform\'s return window, within the policy length', async () => {
    windowDays = '10';
    const t = await svc.template();
    expect(t.returnWindowDays).toBe(10);
    expect(t.returnsPolicy.en).toContain('within 10 days of delivery');
    expect(t.returnsPolicy.fr).toContain('dans les 10 jours');
    for (const text of [t.returnsPolicy.en, t.returnsPolicy.fr]) {
      expect(text.length).toBeGreaterThanOrEqual(10);
      expect(text.length).toBeLessThanOrEqual(2000);
      expect(text).not.toContain('{days}');
    }
    // a seller can submit the template as it is
    const s = await addSeller(ds, { userId: 'owner-1' });
    await expect(svc.propose(ctxOf(s), { returnsPolicy: t.returnsPolicy.en, returnsPolicyFr: t.returnsPolicy.fr })).resolves.toMatchObject({ status: 'pending' });
  });

  it('falls back to 7 days when the setting is missing or zero', async () => {
    expect(policyTemplate(0).returnWindowDays).toBe(7);
    expect(policyTemplate(NaN).returnWindowDays).toBe(7);
    expect((await svc.template()).returnWindowDays).toBe(7);
  });
});

describe('who may decide', () => {
  it('only the super admin and moderation are in the group', () => {
    expect([...ROLE_GROUPS.storePolicy]).toEqual(['admin', 'admin_moderation']);
    for (const r of ['admin_support', 'admin_finance', 'admin_marketing', 'admin_operations', 'seller', 'customer']) expect(inRoleGroup(r, 'storePolicy')).toBe(false);
  });
});

describe('migrations', () => {
  it('seller_policy_revisions grandfathers every live policy as approved, once, and is reversible', async () => {
    const withBoth = await addSeller(ds, { name: 'Both', returnsPolicy: 'We take returns within 7 days.', shippingPolicy: 'We ship in 2 days.' });
    const onlyShip = await addSeller(ds, { name: 'Ship', shippingPolicy: 'We ship in 2 days.' });
    const none = await addSeller(ds, { name: 'None' });
    const q = ds.createQueryRunner();
    await q.dropTable('seller_policy_revisions', true, true, true);
    const mig = new SellerPolicyRevisions1793480000002();
    await mig.up(q);
    await mig.up(q); // a second run changes nothing
    const rows = await ds.getRepository(SellerPolicyRevision).find();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.sellerId === withBoth.id)).toMatchObject({ status: 'approved', decidedBy: 'system', returnsPolicy: 'We take returns within 7 days.', shippingPolicy: 'We ship in 2 days.' });
    expect(rows.find((r) => r.sellerId === onlyShip.id)).toMatchObject({ status: 'approved', returnsPolicy: null });
    expect(rows.some((r) => r.sellerId === none.id)).toBe(false);
    expect(rows.every((r) => r.decidedAt instanceof Date)).toBe(true);
    await mig.down(q);
    expect(await q.hasTable('seller_policy_revisions')).toBe(false);
    await q.release();
  });

  it('awaiting_support moves the seller stages of OPEN requests and nothing else', async () => {
    const q = ds.createQueryRunner();
    const mk = (stage: string, status = 'open') =>
      q.query("INSERT INTO disputes (id, reference, orderId, orderReference, customerId, customerName, type, reason, status, stage) VALUES (?, ?, 'o', 'SOM-1', 'c', 'C', 'return', 'reason', ?, ?)", [`id-${stage}-${status}`, `R-${stage}-${status}`, status, stage]);
    for (const st of ['awaiting_seller', 'seller_rejected', 'seller_timeout', 'seller_replied', 'escalated', 'approved', 'pickup', 'received']) await mk(st);
    await mk('awaiting_seller', 'rejected');
    const mig = new AwaitingSupport1793480000001();
    await mig.up(q);
    await mig.up(q); // idempotent
    const stage = async (id: string) => (await q.query('SELECT stage, sellerLapsedAt FROM disputes WHERE id = ?', [id]))[0];
    for (const st of ['awaiting_seller', 'seller_rejected', 'seller_timeout', 'seller_replied']) expect((await stage(`id-${st}-open`)).stage).toBe('awaiting_support');
    for (const st of ['escalated', 'approved', 'pickup', 'received']) expect((await stage(`id-${st}-open`)).stage).toBe(st);
    expect((await stage('id-awaiting_seller-rejected')).stage).toBe('awaiting_seller'); // closed rows keep their last stage
    // the ones support was already told about (or that waited on a rejection) are not alerted again on the first sweep
    expect((await stage('id-seller_rejected-open')).sellerLapsedAt).not.toBeNull();
    expect((await stage('id-seller_timeout-open')).sellerLapsedAt).not.toBeNull();
    expect((await stage('id-awaiting_seller-open')).sellerLapsedAt).toBeNull();
    await mig.down(q);
    expect((await stage('id-awaiting_seller-open')).stage).toBe('awaiting_seller');
    await q.release();
  });
});
