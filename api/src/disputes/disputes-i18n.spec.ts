import { DataSource } from 'typeorm';
import { DeliveryTask, Dispute, DisputeItem, DisputeMessage, Order, OrderItem, Seller, Translation } from '../database/entities';
import { FakeTranslator } from '../translation/fake.translator';
import type { TranslationService } from '../translation/translation.service';
import type { TranslatorProvider } from '../translation/translator.provider';
import { recordingEmitter, testDb, testTranslations } from '../testing/test-db';
import { DisputesService } from './disputes.service';

/** Returns and disputes: what people write is translated before it is stored, and both languages are served. */

let ds: DataSource;
let emitter: ReturnType<typeof recordingEmitter>;
let fake: FakeTranslator;
let tr: TranslationService;
let svc: DisputesService;
let notices: { to: string; title: string; body: string; fr?: { title: string; body: string } }[];
let s1: Seller;

const customer = { id: 'c1', name: 'Marie Dubois', role: 'customer' };
const otherCustomer = { id: 'c2', name: 'Paul Martin', role: 'customer' };
const sellerOne = { id: 'su1', role: 'seller', name: 'Seller One' };
const sellerTwo = { id: 'su2', role: 'seller', name: 'Seller Two' };
const agent = { id: 'a1', role: 'admin_support', name: 'Agent' };
const marketing = { id: 'a2', role: 'admin_marketing', name: 'Marketing' };
const warehouse = { id: 'w1', role: 'warehouse_staff', name: 'Desk', hubId: 'hub-k' };
const otherWarehouse = { id: 'w2', role: 'warehouse_staff', name: 'Other desk', hubId: 'hub-l' };
const broken: TranslatorProvider = { name: 'fake', enabled: true, translate: async () => { throw new Error('503'); }, detect: async () => { throw new Error('503'); } };
const NOTHING = 'Nothing to translate.';

function build(provider: TranslatorProvider) {
  tr = testTranslations(ds, provider);
  const record = (to: string) => async (...args: unknown[]) => {
    const n = args[args.length - 1] as { title: string; body: string; fr?: { title: string; body: string } };
    const target = args.length === 2 ? args[0] : '';
    for (const t of Array.isArray(target) ? target : [target]) notices.push({ to: `${to}${t}`, ...n });
  };
  const notifications = { toUser: record('user:'), toUsers: record('user:'), toRole: record('role:') };
  svc = new DisputesService(
    ds.getRepository(Dispute),
    ds.getRepository(DisputeItem),
    ds.getRepository(DisputeMessage),
    ds.getRepository(Order),
    ds.getRepository(DeliveryTask),
    notifications as never,
    { refund: async () => ({ refund: { amountUsd: 0 } }) } as never,
    { outstanding: async () => 100, refund: async (i: { amountUsd: number }) => ({ refundedUsd: i.amountUsd, to: 'wallet' }) } as never,
    { getRaw: async () => null, idsBySeller: async () => [], restock: async () => undefined } as never,
    { get: async () => null } as never,
    emitter as never,
    { returnPickup: async () => ({ id: 'task-1' }) } as never,
    { createFromDispute: async () => [] } as never,
    tr,
  );
}

async function order(): Promise<Order> {
  const repo = ds.getRepository(Order);
  return repo.save(
    repo.create({
      reference: `SOM-${Math.floor(Math.random() * 1e8)}`,
      customerId: customer.id,
      customerName: customer.name,
      status: 'delivered',
      destinationHubId: 'hub-k',
      totalUsd: 13,
      subtotalUsd: 10,
      deliveryFeeUsd: 3,
      items: [{ productId: 'p1', productName: 'P1', variant: 'Default', qty: 1, priceUsd: 10, sellerId: s1.id }] as OrderItem[],
    }),
  );
}
const rowsOf = (id: string) => ds.getRepository(Translation).find({ where: { entityId: id }, order: { entityType: 'ASC', locale: 'ASC' } });
const sent = (event: string) => emitter.sent.filter((e) => e.event === event);

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  notices = [];
  fake = new FakeTranslator();
  s1 = await ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: 'One', userId: sellerOne.id, status: 'approved' }));
  await ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: 'Two', userId: sellerTwo.id, status: 'approved' }));
  build(fake);
});
afterEach(async () => ds.destroy());

describe('the customer’s reason', () => {
  it('is translated before it is stored; the view and every event carry both languages, and the seller hears nothing', async () => {
    const o = await order();
    const d = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Le produit est cassé, très déçu' });
    const both = { sourceLang: 'fr', fr: 'Le produit est cassé, très déçu', en: '[en] Le produit est cassé, très déçu' };
    expect(d.reason).toBe('Le produit est cassé, très déçu');
    expect(d.reasonI18n).toEqual(both);
    expect((await rowsOf(d.id)).map((r) => [r.entityType, r.field, r.locale, r.origin])).toEqual([['dispute_reason', 'reason', 'en', 'machine']]);
    const events = sent('dispute:created');
    expect(events.length).toBeGreaterThanOrEqual(2); // the customer and the desk
    for (const e of events) expect(e.payload.reasonI18n).toEqual(both);
    // the seller takes no part: no push, no notice
    expect(events.some((e) => e.to === `user:${sellerOne.id}`)).toBe(false);
    expect(notices.some((x) => x.to === `user:${sellerOne.id}`)).toBe(false);
    expect(notices.some((x) => x.to === 'role:admin_support' && x.title === 'Return requested')).toBe(true);
  });

  it('a failing translator still opens the request: no error, no i18n field', async () => {
    build(broken);
    const o = await order();
    const d = await svc.open(customer, { orderId: o.id, type: 'dispute', reason: 'Le produit est cassé' });
    expect(d.id).toBeTruthy();
    expect('reasonI18n' in d).toBe(false);
    expect(await rowsOf(d.id)).toHaveLength(0);
    expect(sent('dispute:created').every((e) => !('reasonI18n' in e.payload))).toBe(true);
    expect(notices.some((x) => x.to === 'role:admin_support' && x.title === 'Dispute opened')).toBe(true);
  });

  it('translation off (the original is stored, no field)', async () => {
    build({ name: 'off', enabled: false, translate: async (t: string[]) => t, detect: async (t: string[]) => t.map((text) => ({ text, sourceLang: 'und' })) } as never);
    const o = await order();
    const d = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Broken on arrival' });
    expect('reasonI18n' in d).toBe(false);
    expect(notices.some((x) => x.to === 'role:admin_support' && x.title === 'Return requested')).toBe(true);
  });
});

describe('the thread', () => {
  it('a message is translated before it is stored; the dispute:message event and the thread carry both languages', async () => {
    const o = await order();
    const d = await svc.open(customer, { orderId: o.id, type: 'dispute', reason: 'Not received at all' });
    fake.calls.length = 0;
    const m = await svc.reply({ ...customer }, d.id, 'Je n’ai toujours rien reçu, merci de vérifier');
    const both = { sourceLang: 'fr', fr: 'Je n’ai toujours rien reçu, merci de vérifier', en: '[en] Je n’ai toujours rien reçu, merci de vérifier' };
    expect(m.textI18n).toEqual(both);
    expect(sent('dispute:message').every((e) => e.payload.message.textI18n?.en === both.en)).toBe(true);
    expect((await svc.get(customer, d.id)).messages?.[0].textI18n).toEqual(both);
    fake.calls.length = 0;
    await svc.get(agent, d.id);
    expect(fake.calls).toHaveLength(0); // read from the saved rows: no provider call
  });

  it('support’s reply and the customer’s answer are thread messages in both languages', async () => {
    const o = await order();
    const d = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Broken on arrival' });
    await svc.reply(agent, d.id, 'Pouvez-vous envoyer une photo ?');
    await svc.reply(customer, d.id, 'Le produit est cassé, voir la photo');
    const thread = (await svc.get(agent, d.id)).messages!;
    expect(thread).toHaveLength(2);
    expect(thread[0].textI18n).toEqual({ sourceLang: 'fr', fr: 'Pouvez-vous envoyer une photo ?', en: '[en] Pouvez-vous envoyer une photo ?' });
    expect(thread[1].textI18n).toEqual({ sourceLang: 'fr', fr: 'Le produit est cassé, voir la photo', en: '[en] Le produit est cassé, voir la photo' });
  });

  it('a photo-only message has nothing to translate: no provider call', async () => {
    const o = await order();
    const d = await svc.open(customer, { orderId: o.id, type: 'dispute', reason: 'Not received at all' });
    fake.calls.length = 0;
    const UP = 'http://x/uploads/00000000-0000-4000-8000-000000000001.png';
    const m = await svc.reply(customer, d.id, '', [UP]);
    expect('textI18n' in m).toBe(false);
    expect(fake.calls).toHaveLength(0);
  });

  it('notices quote the message in each recipient’s language', async () => {
    const o = await order();
    const d = await svc.open(customer, { orderId: o.id, type: 'dispute', reason: 'Not received at all' });
    notices.length = 0;
    await svc.reply(agent, d.id, 'Nous vérifions avec le transporteur');
    const toCustomer = notices.find((n) => n.to === `user:${customer.id}`)!;
    expect(toCustomer.body).toContain('[en] Nous vérifions avec le transporteur');
    expect(toCustomer.fr?.body).toContain(': Nous vérifions avec le transporteur');
  });
});

describe('the resolution', () => {
  it('an agent’s own words become resolutionI18n; a stock phrase has none and costs no provider call', async () => {
    const o = await order();
    const d = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Broken on arrival' });
    const refused = await svc.adminDecideReturn(agent, d.id, false, 'Photos insuffisantes pour prouver le défaut');
    expect(refused.resolutionI18n).toEqual({ sourceLang: 'fr', fr: 'Photos insuffisantes pour prouver le défaut', en: '[en] Photos insuffisantes pour prouver le défaut' });
    const o2 = await order();
    const d2 = await svc.open(customer, { orderId: o2.id, type: 'return', reason: 'Broken on arrival' });
    fake.calls.length = 0;
    const cancelled = await svc.cancel(customer, d2.id);
    expect(cancelled.resolution).toBe('Cancelled by the customer');
    expect('resolutionI18n' in cancelled).toBe(false);
    expect(fake.calls).toHaveLength(0);
  });
});

describe('translate:text on a private dispute text', () => {
  async function thread() {
    const o = await order();
    const d = await svc.open(customer, { orderId: o.id, type: 'dispute', reason: 'Not received at all' });
    const m = await svc.reply(customer, d.id, 'Je n’ai rien reçu du tout');
    return { d, m };
  }

  it('the customer, the desk and the warehouse of a return may; the cached row is reused', async () => {
    const { d, m } = await thread();
    fake.calls.length = 0;
    for (const viewer of [customer, agent]) {
      expect(await svc.translate(viewer, 'dispute_message', m.id, 'en')).toMatchObject({ text: '[en] Je n’ai rien reçu du tout', same: false });
      expect(await svc.translate(viewer, 'dispute_reason', d.id, 'en')).toMatchObject({ same: true });
    }
    expect(fake.calls).toHaveLength(0); // both languages were saved with the text
    const o = await order();
    const ret = await svc.open(customer, { orderId: o.id, type: 'return', reason: 'Le produit est cassé' });
    expect(await svc.translate(warehouse, 'dispute_reason', ret.id, 'en')).toMatchObject({ text: '[en] Le produit est cassé' });
  });

  it.each([
    ['another customer', otherCustomer],
    ['the seller of the order (sellers take no part)', sellerOne],
    ['another store’s seller', sellerTwo],
    ['a marketing admin (not on the returns desk)', marketing],
    ['a warehouse of another hub', otherWarehouse],
  ])('%s gets "Nothing to translate." and the provider is never called', async (_who, viewer) => {
    const { d, m } = await thread();
    fake.calls.length = 0;
    for (const [kind, id] of [['dispute_message', m.id], ['dispute_reason', d.id], ['dispute_reply', d.id], ['dispute_resolution', d.id]] as const) {
      await expect(svc.translate(viewer, kind, id, 'en')).rejects.toThrow(NOTHING);
    }
    expect(fake.calls).toHaveLength(0);
  });

  it('a warehouse sees a dispute (not a return) of nobody: same refusal; a made-up id and a wrong kind too', async () => {
    const { d, m } = await thread();
    await expect(svc.translate(warehouse, 'dispute_message', m.id, 'en')).rejects.toThrow(NOTHING);
    await expect(svc.translate(customer, 'dispute_message', '00000000-0000-4000-8000-000000000000', 'en')).rejects.toThrow(NOTHING);
    await expect(svc.translate(customer, 'dispute_message', 'not-an-id', 'en')).rejects.toThrow(NOTHING);
    await expect(svc.translate(customer, 'support_message', m.id, 'en')).rejects.toThrow(NOTHING);
    await expect(svc.translate(customer, 'review', d.id, 'en')).rejects.toThrow(NOTHING);
  });

  it('the general translate:text path never serves a private kind (the owning service did not vouch for the reader)', async () => {
    const { d, m } = await thread();
    for (const kind of ['dispute_message', 'dispute_reason', 'dispute_reply', 'dispute_resolution', 'support_ticket', 'support_message', 'exchange_reason', 'exchange_reply', 'replacement_reason', 'replacement_reply'] as const) {
      await expect(tr.translateStored(kind, kind === 'dispute_message' ? m.id : d.id, 'en', { staff: true })).rejects.toThrow(NOTHING);
    }
  });
});
