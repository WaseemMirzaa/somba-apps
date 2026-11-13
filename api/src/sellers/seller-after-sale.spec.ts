import { DataSource } from 'typeorm';
import { CaseSellerMessage, Dispute, Exchange, Replacement, Seller, SellerTeamMember, Setting, DeliveryTask } from '../database/entities';
import { addSeller, recordingEmitter, testDb, testTranslations } from '../testing/test-db';
import { SettingsService } from '../content/settings.service';
import { AfterSaleAccessService } from './after-sale-access.service';
import { SellerAfterSaleViewService } from './seller-after-sale.service';
import { CaseThreadService } from './case-thread.service';
import { SellerContextService } from './seller-context';
import { TeamDirectory } from './team-directory';
import { accessFields, defaultsFrom, overrideColumn, parseOverride, resolveAccess } from './after-sale-access';
import { redactExchange, redactReplacement, redactReturn } from './seller-case-view';
import { ROLE_GROUPS } from '../common/role-groups';
import { errorFr } from '../common/error-fr';

describe('after-sale access: pure rules', () => {
  const off = { returns: false, exchanges: false, replacements: false, express: false };
  it('every section defaults to off, and only "true" turns a default on', () => {
    expect(defaultsFrom({})).toEqual(off);
    expect(defaultsFrom({ sellerViewReturns: 'true', sellerViewExpress: 'false', sellerViewExchanges: 'yes' })).toEqual({ ...off, returns: true });
  });
  it('a store override wins over the default; null / missing follows it', () => {
    const on = { ...off, returns: true, exchanges: true };
    expect(resolveAccess({}, on)).toEqual(on);
    expect(resolveAccess({ returns: false, replacements: true }, on)).toEqual({ returns: false, exchanges: true, replacements: true, express: false });
  });
  it('parses the stored JSON defensively and writes only the forced keys', () => {
    expect(parseOverride('{"returns":false,"express":true,"x":1,"exchanges":"yes"}')).toEqual({ returns: false, express: true });
    expect(parseOverride('not json')).toEqual({});
    expect(parseOverride(null)).toEqual({});
    expect(parseOverride('[true]')).toEqual({});
    expect(overrideColumn({ returns: null, exchanges: true })).toBe('{"exchanges":true}');
    expect(overrideColumn({ returns: null })).toBeNull();
    expect(accessFields('{"returns":true}', off)).toEqual({ afterSaleAccess: { ...off, returns: true }, afterSaleAccessOverride: { returns: true }, afterSaleAccessDefaults: off });
  });
  it('the manager group is admin, operations and support; finance is not in it', () => {
    expect([...ROLE_GROUPS.sellerAfterSaleManage]).toEqual(['admin', 'admin_operations', 'admin_support']);
  });
});

describe('redaction: what a store may see of a case', () => {
  const ret = {
    id: 'r1', reference: 'RET-1001', orderId: 'o1', orderReference: 'SOM-1001', customerId: 'c1', customerName: 'Awa Diallo Kone', customerPhone: '+243970000000',
    type: 'return', category: 'damaged', reason: 'Arrived broken', status: 'open', stage: 'approved', attachments: ['/uploads/a.jpg'], sellerId: 's1',
    resolution: null, resolutionFr: null, refundUsd: 0, createdAt: new Date('2026-11-01'), updatedAt: new Date('2026-11-02'), sellerReason: 'old', escalatedAt: null,
    items: [{ id: 'i1', productName: 'Kettle', productNameFr: 'Bouilloire', variant: 'Red', variantFr: 'Rouge', qty: 2, unitPriceUsd: 10 }],
    messages: [{ id: 'm', text: 'customer says' }],
  };
  it('a return: first name only, no id / phone / address, no customer thread', () => {
    const v = redactReturn(ret) as unknown as Record<string, unknown>;
    expect(v).toMatchObject({ sellerView: true, kind: 'return', reference: 'RET-1001', orderReference: 'SOM-1001', customerFirstName: 'Awa', stage: 'approved', reason: 'Arrived broken', attachments: ['/uploads/a.jpg'] });
    expect((v.items as unknown[])[0]).toEqual({ name: 'Kettle', nameFr: 'Bouilloire', variant: 'Red', variantFr: 'Rouge', qty: 2 });
    for (const leak of ['customerId', 'customerName', 'customerPhone', 'messages', 'messageCount', 'address', 'sellerReason', 'pickupTaskId']) expect(v).not.toHaveProperty(leak);
    expect(JSON.stringify(v)).not.toMatch(/Diallo|Kone|\+243|customer says/);
  });
  it('a refused return carries support\'s note and a refused timeline', () => {
    const v = redactReturn({ ...ret, status: 'rejected', stage: 'closed', resolution: 'Outside the window', resolutionFr: 'Hors délai' });
    expect(v.decisionNote).toBe('Outside the window');
    expect(v.decisionNoteFr).toBe('Hors délai');
    expect(v.timeline.map((s) => s.key)).toEqual(['opened', 'refused']);
  });
  it('an exchange shows both items and the price difference; a replacement the dispatch status', () => {
    const ex = redactExchange({ id: 'e1', reference: 'EXC-1', orderId: 'o', orderReference: 'SOM-2', customerId: 'c', customerName: 'Jean Mbala', status: 'approved', fromName: 'Shirt S', toName: 'Shirt M', fromNameFr: 'Chemise S', toNameFr: null, qty: 1, priceDiffUsd: -2, sellerReason: 'ok', createdAt: new Date(), updatedAt: new Date(), attachments: [] });
    expect(ex).toMatchObject({ kind: 'exchange', customerFirstName: 'Jean', priceDiffUsd: -2, decisionNote: 'ok' });
    expect(ex.items.map((i) => i.name)).toEqual(['Shirt S', 'Shirt M']);
    expect(ex.timeline.filter((s) => s.done).map((s) => s.key)).toEqual(['requested', 'approved']);
    const rep = redactReplacement({ id: 'p1', reference: 'REP-1', orderId: 'o', orderReference: 'SOM-3', customerName: 'Mimi', status: 'dispatched', dispatchStatus: 'dispatched', productName: 'Lamp', qty: 1, createdAt: new Date(), updatedAt: new Date(), attachments: [] });
    expect(rep).toMatchObject({ kind: 'replacement', dispatchStatus: 'dispatched', customerFirstName: 'Mimi' });
  });
});

describe('seller after-sale view: switches, reads and the private thread', () => {
  let ds: DataSource;
  let emitter: ReturnType<typeof recordingEmitter>;
  let notices: { to: string; title: string; body: string; type?: string }[];
  let roleNotices: { role: string; title: string; type?: string }[];
  let access: AfterSaleAccessService;
  let view: SellerAfterSaleViewService;
  let threads: CaseThreadService;
  let settings: SettingsService;
  let storeA: Seller;
  let storeB: Seller;
  let reRun: number;

  const sellerCaller = (id: string) => ({ id, role: 'seller', name: 'Owner' });
  const staff = (role: string) => ({ id: `${role}-1`, role, name: role });

  const addReturn = (over: Partial<Dispute> = {}) =>
    ds.getRepository(Dispute).save(
      ds.getRepository(Dispute).create({ reference: `RET-${++reRun}`, orderId: 'o1', orderReference: 'SOM-1', customerId: 'cust-1', customerName: 'Awa Diallo', type: 'return', reason: 'broken', status: 'open', stage: 'awaiting_support', sellerId: storeA.id, ...over }),
    );

  beforeEach(async () => {
    reRun = 1000;
    ds = await testDb();
    emitter = recordingEmitter();
    notices = [];
    roleNotices = [];
    const translations = testTranslations(ds);
    settings = new SettingsService(ds.getRepository(Setting), emitter as never);
    const sellersSvc = { withPlanState: async (s: Seller) => ({ id: s.id, name: s.name, ...accessFields(s.afterSaleAccess, defaultsFrom(await settings.all())) }) };
    access = new AfterSaleAccessService(ds.getRepository(Seller), settings, sellersSvc as never, emitter as never);
    const users = ds.getRepository('User' as never);
    const ctx = new SellerContextService(ds.getRepository(Seller), ds.getRepository(SellerTeamMember), users as never, settings);
    const team = new TeamDirectory(ds.getRepository(SellerTeamMember), ds.getRepository(Seller));
    const notifications = {
      toUser: async (to: string, n: { title: string; body: string; type?: string }) => void notices.push({ to, ...n }),
      toRole: async (role: string, n: { title: string; type?: string }) => void roleNotices.push({ role, ...n }),
    };
    view = new SellerAfterSaleViewService(access, ctx, ds.getRepository(Seller), ds.getRepository(DeliveryTask), ds.getRepository(CaseSellerMessage), emitter as never, team, notifications as never);
    threads = new CaseThreadService(ds.getRepository(CaseSellerMessage), ds.getRepository(Dispute), ds.getRepository(Exchange), ds.getRepository(Replacement), ds.getRepository(Seller), view, emitter as never, team, notifications as never, translations);
    storeA = await addSeller(ds, { name: 'Store A', userId: 'owner-a' });
    storeB = await addSeller(ds, { name: 'Store B', userId: 'owner-b' });
  });
  afterEach(() => ds.destroy());

  it('defaults: all off; a store sees nothing until admin switches the default on, and its override beats the default', async () => {
    expect(await access.defaults()).toEqual({ returns: false, exchanges: false, replacements: false, express: false });
    expect(await view.readerOf(sellerCaller('owner-a'), 'return')).toBeNull();
    await access.setDefaults({ returns: true });
    expect((await view.readerOf(sellerCaller('owner-a'), 'return'))?.seller.id).toBe(storeA.id);
    expect(await view.readerOf(sellerCaller('owner-a'), 'exchange')).toBeNull();
    await access.setStoreAccess({ sellerId: storeA.id, returns: false });
    expect(await view.readerOf(sellerCaller('owner-a'), 'return')).toBeNull();
    expect(await view.readerOf(sellerCaller('owner-b'), 'return')).not.toBeNull();
    // null = follow the default again
    await access.setStoreAccess({ sellerId: storeA.id, returns: null });
    expect(await view.readerOf(sellerCaller('owner-a'), 'return')).not.toBeNull();
    expect((await ds.getRepository(Seller).findOneByOrFail({ id: storeA.id })).afterSaleAccess).toBeNull();
  });

  it('a customer or an unknown account is never a reader', async () => {
    await access.setDefaults({ returns: true });
    expect(await view.readerOf({ id: 'cust-1', role: 'customer', name: 'c' }, 'return')).toBeNull();
    expect(await view.readerOf(sellerCaller('nobody'), 'return')).toBeNull();
  });

  it('changing a default tells the stores that follow it, not the ones that override it; staff hear the defaults', async () => {
    await access.setStoreAccess({ sellerId: storeB.id, returns: false });
    emitter.sent.length = 0;
    await access.setDefaults({ returns: true });
    const to = emitter.sent.filter((e) => e.event === 'seller:updated' && e.to.startsWith('user:')).map((e) => e.to);
    expect(to).toEqual(['user:owner-a']);
    expect(emitter.sent.find((e) => e.event === 'seller:updated' && e.to === 'user:owner-a')?.payload.afterSaleAccess.returns).toBe(true);
    const defaultsPush = emitter.sent.find((e) => e.event === 'sellerAccess:defaults');
    expect(defaultsPush?.to.split(',')).toEqual(expect.arrayContaining(['admin', 'admin_operations', 'admin_support']));
    // nothing changed: no push
    emitter.sent.length = 0;
    await access.setDefaults({ returns: true });
    expect(emitter.sent.filter((e) => e.event === 'seller:updated')).toEqual([]);
  });

  it('refuses bad values and unknown stores with French errors', async () => {
    await expect(access.setDefaults({ returns: 'yes' })).rejects.toThrow('Choose On or Off for each section.');
    await expect(access.setStoreAccess({ sellerId: storeA.id, express: 'on' })).rejects.toThrow('Choose Follow default, On or Off for each section.');
    await expect(access.setStoreAccess({ sellerId: 'nope', express: true })).rejects.toThrow('Store not found.');
    expect(errorFr('Choose On or Off for each section.')).toBe('Choisissez Activé ou Désactivé pour chaque section.');
    expect(errorFr('This section is turned off for your store.')).toBe('Cette section est désactivée pour votre boutique.');
  });

  it('pushes a case to the store only while the section is on, redacted, and sends the info notices', async () => {
    const d = await addReturn();
    const full = { ...d, items: [], attachments: [] } as unknown as Record<string, unknown>;
    await view.push('return', full, 'opened');
    expect(emitter.sent.filter((e) => e.event === 'dispute:updated')).toEqual([]);
    expect(notices).toEqual([]);
    await access.setDefaults({ returns: true });
    emitter.sent.length = 0;
    await view.push('return', full, 'opened');
    const pushed = emitter.sent.find((e) => e.event === 'dispute:updated' && e.to === 'user:owner-a');
    expect(pushed?.payload).toMatchObject({ sellerView: true, customerFirstName: 'Awa', reference: d.reference });
    expect(JSON.stringify(pushed?.payload)).not.toContain('Diallo');
    expect(notices).toEqual([{ to: 'owner-a', title: 'Return opened on your item', body: `${d.reference} · SOM-1`, type: 'seller_return', entityId: d.id }]);
    await view.decided('return', full);
    expect(notices[1]).toMatchObject({ title: 'Return decided', type: 'seller_return' });
    // another store's case never reaches this one
    emitter.sent.length = 0;
    await view.push('return', { ...full, sellerId: storeB.id }, 'updated');
    expect(emitter.sent.filter((e) => e.to === 'user:owner-a')).toEqual([]);
  });

  describe('the private thread', () => {
    let ret: Dispute;
    beforeEach(async () => {
      ret = await addReturn();
    });

    it('is refused while the section is off ("This section is turned off for your store.") and for another store\'s case', async () => {
      await expect(threads.list(sellerCaller('owner-a'), { kind: 'return', caseId: ret.id })).rejects.toThrow('This section is turned off for your store.');
      await expect(threads.send(sellerCaller('owner-a'), { kind: 'return', caseId: ret.id, text: 'hello' })).rejects.toThrow('This section is turned off for your store.');
      await access.setDefaults({ returns: true });
      await expect(threads.list(sellerCaller('owner-b'), { kind: 'return', caseId: ret.id })).rejects.toThrow('Request not found.');
      await expect(threads.list(sellerCaller('owner-a'), { kind: 'return', caseId: ret.id })).resolves.toEqual([]);
      // only the section that is on: exchanges are still off
      const ex = await ds.getRepository(Exchange).save(ds.getRepository(Exchange).create({ reference: 'EXC-1', orderId: 'o', orderReference: 'SOM-9', customerId: 'c', customerName: 'x', sellerId: storeA.id, fromSku: 'a', fromName: 'A', toSku: 'b', toName: 'B' }));
      await expect(threads.list(sellerCaller('owner-a'), { kind: 'exchange', caseId: ex.id })).rejects.toThrow('This section is turned off for your store.');
    });

    it('goes both ways, translated, with unread counts, notices and live pushes; the customer and other staff are refused', async () => {
      await access.setDefaults({ returns: true });
      const m1 = await threads.send(sellerCaller('owner-a'), { kind: 'return', caseId: ret.id, text: 'Where is the parcel?' });
      expect(m1).toMatchObject({ authorSide: 'seller', text: 'Where is the parcel?', caseKind: 'return' });
      expect(roleNotices).toEqual([{ role: 'admin_support', title: `Seller message on ${ret.reference}`, body: `${ret.reference} · SOM-1`, type: 'return', entityId: ret.id }]);
      expect(emitter.sent.some((e) => e.event === 'caseThread:message' && e.to.includes('admin_support'))).toBe(true);
      // support sees one unread case, replies, and the store hears it
      expect(await threads.unread(staff('admin_support'))).toMatchObject({ count: 1, cases: [{ kind: 'return', caseId: ret.id, unread: 1 }] });
      const m2 = await threads.send(staff('admin_support'), { kind: 'return', caseId: ret.id, text: 'We are checking.' });
      expect(m2.authorSide).toBe('support');
      expect(notices.at(-1)).toMatchObject({ to: 'owner-a', title: 'Message from KOMORIKO support', type: 'seller_return', entityId: ret.id });
      expect(emitter.sent.some((e) => e.event === 'caseThread:message' && e.to === 'user:owner-a')).toBe(true);
      // the French twin is stored with the message
      expect((await threads.list(sellerCaller('owner-a'), { kind: 'return', caseId: ret.id })).map((m) => m.textI18n?.fr)).toEqual(expect.arrayContaining([expect.any(String)]));
      expect(await threads.unread(sellerCaller('owner-a'))).toEqual({ returns: 1, exchanges: 0, replacements: 0, total: 1 });
      await threads.markRead(sellerCaller('owner-a'), { kind: 'return', caseId: ret.id });
      expect(await threads.unread(sellerCaller('owner-a'))).toMatchObject({ total: 0 });
      await threads.markRead(staff('admin_operations'), { kind: 'return', caseId: ret.id });
      expect(await threads.unread(staff('admin_support'))).toMatchObject({ count: 0 });
      // who may not
      await expect(threads.list({ id: 'cust-1', role: 'customer', name: 'c' }, { kind: 'return', caseId: ret.id })).rejects.toThrow('Not allowed.');
      await expect(threads.send(staff('admin_marketing'), { kind: 'return', caseId: ret.id, text: 'hi' })).rejects.toThrow('Not allowed.');
      // finance reads but never writes
      await expect(threads.list(staff('admin_finance'), { kind: 'return', caseId: ret.id })).resolves.toHaveLength(2);
      await expect(threads.send(staff('admin_finance'), { kind: 'return', caseId: ret.id, text: 'hi' })).rejects.toThrow('Not allowed.');
    });

    it('validates the text and the case; support can write even when the store\'s section is off (no push, no notice to the store)', async () => {
      await access.setDefaults({ returns: true });
      await expect(threads.send(sellerCaller('owner-a'), { kind: 'return', caseId: ret.id, text: '  ' })).rejects.toThrow('Write a message first.');
      await expect(threads.send(sellerCaller('owner-a'), { kind: 'return', caseId: ret.id, text: 'x'.repeat(2001) })).rejects.toThrow('Messages are at most 2000 characters.');
      await expect(threads.list(sellerCaller('owner-a'), { kind: 'dispute', caseId: ret.id })).rejects.toThrow('Request not found.');
      await expect(threads.list(sellerCaller('owner-a'), { kind: 'return', caseId: 'nope' })).rejects.toThrow('Request not found.');
      await access.setStoreAccess({ sellerId: storeA.id, returns: false });
      emitter.sent.length = 0;
      await threads.send(staff('admin_support'), { kind: 'return', caseId: ret.id, text: 'Heads up.' });
      expect(notices.filter((n) => n.title === 'Message from KOMORIKO support')).toEqual([]);
      expect(emitter.sent.some((e) => e.to === 'user:owner-a')).toBe(false);
    });

    it('the customer-facing dispute thread is a different table: nothing written here is in dispute_messages', async () => {
      await access.setDefaults({ returns: true });
      await threads.send(sellerCaller('owner-a'), { kind: 'return', caseId: ret.id, text: 'private words' });
      expect(await ds.query('SELECT COUNT(*) AS n FROM dispute_messages')).toEqual([{ n: 0 }]);
      expect(await ds.getRepository(CaseSellerMessage).count()).toBe(1);
    });
  });
});
