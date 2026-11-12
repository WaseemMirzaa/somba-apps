import { DataSource } from 'typeorm';
import { SupportMessage, SupportTicket, Translation, User, Order } from '../database/entities';
import { FakeTranslator } from '../translation/fake.translator';
import type { TranslationService } from '../translation/translation.service';
import type { TranslatorProvider } from '../translation/translator.provider';
import { recordingEmitter, testDb, testTranslations } from '../testing/test-db';
import { SupportService } from './support.service';

/** Support tickets: the subject and every message are translated before they are stored; both languages are served. */

let ds: DataSource;
let emitter: ReturnType<typeof recordingEmitter>;
let fake: FakeTranslator;
let tr: TranslationService;
let svc: SupportService;
let notices: { to: string; title: string; body: string; fr?: { title: string; body: string } }[];

const customer = { id: 'c1', name: 'Marie', role: 'customer' };
const other = { id: 'c2', name: 'Paul', role: 'customer' };
const seller = { id: 's1', name: 'Shop', role: 'seller' };
const agent = { id: 'a1', name: 'Agent', role: 'admin_support' };
const marketing = { id: 'a9', name: 'Marketing', role: 'admin_marketing' };
const broken: TranslatorProvider = { name: 'fake', enabled: true, translate: async () => { throw new Error('503'); }, detect: async () => { throw new Error('503'); } };
const NOTHING = 'Nothing to translate.';
const thread = (t: SupportTicket) => JSON.parse(t.messages) as { id: string; text: string; textI18n?: unknown }[];

function build(provider: TranslatorProvider) {
  tr = testTranslations(ds, provider);
  const record = (to: string) => async (...args: unknown[]) => {
    const n = args[args.length - 1] as { title: string; body: string; fr?: { title: string; body: string } };
    notices.push({ to: `${to}${args.length === 2 ? args[0] : ''}`, ...n });
  };
  const notifications = { toUser: record('user:'), toRole: record('role:'), toAdmins: async (n: { title: string; body: string; fr?: { title: string; body: string } }, audience?: string) => void notices.push({ to: `admins:${audience ?? ''}`, ...n }) };
  svc = new SupportService(ds.getRepository(SupportTicket), ds.getRepository(SupportMessage), ds.getRepository(Order), ds.getRepository(User), notifications as never, emitter as never, tr);
}
const rowsOf = (id: string) => ds.getRepository(Translation).find({ where: { entityId: id }, order: { entityType: 'ASC', locale: 'ASC' } });

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  notices = [];
  fake = new FakeTranslator();
  for (const [id, role, name, locale] of [['a1', 'admin_support', 'Agent', 'en'], ['c1', 'customer', 'Marie', 'fr'], ['c2', 'customer', 'Paul', 'en'], ['s1', 'seller', 'Shop', 'en']] as const) {
    await ds.getRepository(User).save(ds.getRepository(User).create({ id, emailHash: id, email: `${id}@x.y`, passwordHash: 'x', name, role, locale }));
  }
  build(fake);
});
afterEach(async () => ds.destroy());

describe('opening a ticket', () => {
  it('translates the subject and the message first; the ticket, its messages and the live events carry both languages', async () => {
    const t = await svc.open(customer, { subject: 'Livraison très lente', message: 'Ma commande est en retard pour la livraison' });
    expect(t.subject).toBe('Livraison très lente');
    expect(t.subjectI18n).toEqual({ sourceLang: 'fr', fr: 'Livraison très lente', en: '[en] Livraison très lente' });
    expect(thread(t)[0].textI18n).toEqual({ sourceLang: 'fr', fr: 'Ma commande est en retard pour la livraison', en: '[en] Ma commande est en retard pour la livraison' });
    expect((await rowsOf(t.id)).map((r) => [r.entityType, r.field, r.locale])).toEqual([['support_ticket', 'subject', 'en']]);
    const events = emitter.sent.filter((e) => e.event === 'support:updated');
    expect(events.map((e) => e.to)).toEqual(expect.arrayContaining([`user:${customer.id}`]));
    for (const e of events) {
      expect(e.payload.subjectI18n?.en).toBe('[en] Livraison très lente');
      expect(JSON.parse(e.payload.messages)[0].textI18n.en).toContain('[en] Ma commande');
    }
    // the sender's account language (fr) is the hint: one provider call per text, not two
    expect(fake.calls).toHaveLength(2);
    // the agents' notice quotes the subject in both languages
    const n = notices.find((x) => x.title === 'New support ticket')!;
    expect(n.body).toContain('[en] Livraison très lente');
    expect(n.fr?.body).toContain('· Livraison très lente');
  });

  it('a failing translator still opens the ticket: no error, no i18n field, the original in the notice', async () => {
    build(broken);
    const t = await svc.open(customer, { subject: 'Livraison très lente', message: 'Ma commande est en retard' });
    expect(t.id).toBeTruthy();
    expect('subjectI18n' in t).toBe(false);
    expect('textI18n' in thread(t)[0]).toBe(false);
    expect(await rowsOf(t.id)).toHaveLength(0);
    expect(notices.find((x) => x.title === 'New support ticket')).toMatchObject({ body: expect.stringContaining('Livraison très lente') });
  });

  it('translation off: stored as written, no field', async () => {
    build({ name: 'off', enabled: false, translate: async (t: string[]) => t, detect: async (t: string[]) => t.map((text) => ({ text, sourceLang: 'und' })) } as never);
    const t = await svc.open(customer, { subject: 'Slow charger', message: 'It takes 8 hours' });
    expect('subjectI18n' in t).toBe(false);
    expect('textI18n' in thread(t)[0]).toBe(false);
  });
});

describe('replying', () => {
  it('an agent’s English reply gets its French; the customer notice quotes it in each language and the list serves it', async () => {
    const t = await svc.open(customer, { subject: 'Livraison très lente', message: 'Ma commande est en retard' });
    notices.length = 0;
    const out = await svc.reply(t.id, agent, 'We are checking with the carrier');
    expect(thread(out)[1].textI18n).toEqual({ sourceLang: 'en', en: 'We are checking with the carrier', fr: '[fr] We are checking with the carrier' });
    const n = notices.find((x) => x.to === `user:${customer.id}` && x.title === 'Support reply')!;
    expect(n.body).toBe(`${t.reference}: We are checking with the carrier`);
    expect(n.fr?.body).toBe(`${t.reference}: [fr] We are checking with the carrier`);
    fake.calls.length = 0;
    const mine = await svc.list(customer);
    expect(thread(mine[0])[1].textI18n).toMatchObject({ fr: '[fr] We are checking with the carrier' });
    expect(mine[0].subjectI18n).toMatchObject({ en: '[en] Livraison très lente' });
    expect(fake.calls).toHaveLength(0); // read from the saved rows
    // a photo-only reply has nothing to translate
    const UP = 'http://x/uploads/00000000-0000-4000-8000-000000000001.png';
    const photo = await svc.reply(t.id, customer, '', [UP]);
    expect('textI18n' in thread(photo)[2]).toBe(false);
  });

  it('a failing translator still saves the reply', async () => {
    const t = await svc.open(customer, { subject: 'Livraison très lente', message: 'Ma commande est en retard' });
    build(broken);
    const out = await svc.reply(t.id, agent, 'We are checking with the carrier');
    expect(thread(out)).toHaveLength(2);
    expect('textI18n' in thread(out)[1]).toBe(false);
  });
});

describe('translate:text on a private ticket', () => {
  async function ticket() {
    const t = await svc.open(customer, { subject: 'Livraison très lente', message: 'Ma commande est en retard' });
    return { t, messageId: thread(t)[0].id };
  }

  it('the ticket’s owner and the support agents may (rows saved with the text answer without the provider)', async () => {
    const { t, messageId } = await ticket();
    fake.calls.length = 0;
    for (const viewer of [customer, agent]) {
      expect(await svc.translate(viewer, 'support_message', messageId, 'en')).toMatchObject({ text: '[en] Ma commande est en retard', same: false });
      expect(await svc.translate(viewer, 'support_ticket', t.id, 'fr')).toMatchObject({ text: 'Livraison très lente', same: true });
    }
    expect(fake.calls).toHaveLength(0);
  });

  it.each([
    ['another customer', other],
    ['a seller who is not the owner', seller],
    ['an admin outside the support desk', marketing],
  ])('%s gets "Nothing to translate." and the provider is never called', async (_who, viewer) => {
    const { t, messageId } = await ticket();
    fake.calls.length = 0;
    await expect(svc.translate(viewer, 'support_message', messageId, 'en')).rejects.toThrow(NOTHING);
    await expect(svc.translate(viewer, 'support_ticket', t.id, 'en')).rejects.toThrow(NOTHING);
    expect(fake.calls).toHaveLength(0);
  });

  it('a made-up id, a malformed id and a kind that is not a support kind get the same answer; the general path never serves it', async () => {
    const { t, messageId } = await ticket();
    await expect(svc.translate(customer, 'support_message', '00000000-0000-4000-8000-000000000000', 'en')).rejects.toThrow(NOTHING);
    await expect(svc.translate(customer, 'support_message', 'x', 'en')).rejects.toThrow(NOTHING);
    await expect(svc.translate(customer, 'review', t.id, 'en')).rejects.toThrow(NOTHING);
    await expect(tr.translateStored('support_message', messageId, 'en', { staff: true })).rejects.toThrow(NOTHING);
    await expect(tr.translateStored('support_ticket', t.id, 'en')).rejects.toThrow(NOTHING);
  });

  it('a text that was never translated (translator failed at save) is translated on demand for an allowed reader, then cached', async () => {
    build(broken);
    const t = await svc.open(customer, { subject: 'Livraison très lente', message: 'Ma commande est en retard' });
    build(fake);
    const id = thread(t)[0].id;
    expect(await svc.translate(customer, 'support_message', id, 'en')).toMatchObject({ text: '[en] Ma commande est en retard' });
    fake.calls.length = 0;
    await svc.translate(agent, 'support_message', id, 'en');
    expect(fake.calls).toHaveLength(0);
  });
});
