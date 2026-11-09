import { DataSource } from 'typeorm';
import { Broadcast, Translation, TranslationJob, User } from '../database/entities';
import { recordingEmitter, testDb, testTranslations } from '../testing/test-db';
import { FakeTranslator, OffTranslator } from '../translation/fake.translator';
import type { TranslatorProvider } from '../translation/translator.provider';
import type { TranslationService } from '../translation/translation.service';
import { BroadcastsService } from './broadcasts.service';

let ds: DataSource;
let fake: FakeTranslator;
let translations: TranslationService;
let notices: { role: string; n: { title: string; body: string; type?: string; fr?: { title: string; body: string } } }[];
let svc: BroadcastsService;
let emitter: ReturnType<typeof recordingEmitter>;

const build = (provider: TranslatorProvider) => {
  translations = testTranslations(ds, provider);
  notices = [];
  emitter = recordingEmitter();
  const notifications = { toRole: async (role: string, n: never) => void notices.push({ role, n }) };
  svc = new BroadcastsService(ds.getRepository(Broadcast), ds.getRepository(User), notifications as never, emitter as never, translations);
};

beforeEach(async () => {
  ds = await testDb();
  fake = new FakeTranslator();
  build(fake);
});
afterEach(async () => ds.destroy());

describe('who follows a new broadcast live', () => {
  it('broadcast:created goes to the super admin and Marketing only (the Broadcasts page is Marketing\'s)', async () => {
    await svc.send('Admin', { title: 'Big sale', body: 'Free delivery this weekend' });
    expect(emitter.sent.filter((e) => e.event === 'broadcast:created').map((e) => e.to)).toEqual(['admin,admin_marketing']);
  });
});

describe('sending a broadcast', () => {
  it('English: the French is translated while sending and handed to notifications as NoticeInput.fr', async () => {
    const b = await svc.send('Admin', { title: 'Big sale', body: 'Free delivery this weekend' });
    expect(b).toMatchObject({ title: 'Big sale', titleFr: '[fr] Big sale', body: 'Free delivery this weekend', bodyFr: '[fr] Free delivery this weekend', sourceLang: 'en', audience: 'customer' });
    expect(b.machineTranslated.sort()).toEqual(['bodyFr', 'titleFr']);
    expect(notices).toEqual([{ role: 'customer', n: { title: 'Big sale', body: 'Free delivery this weekend', type: 'marketing', fr: { title: '[fr] Big sale', body: '[fr] Free delivery this weekend' } } }]);
    expect(await ds.getRepository(TranslationJob).count()).toBe(0); // nothing left for the queue
  });

  it('French: sourceLang fr, the English is translated, the French source goes out as the French version', async () => {
    const b = await svc.send('Admin', { titleFr: 'Grands soldes', bodyFr: 'Livraison gratuite ce week-end' });
    expect(b).toMatchObject({ sourceLang: 'fr', title: '[en] Grands soldes', titleFr: 'Grands soldes', body: '[en] Livraison gratuite ce week-end' });
    expect(notices[0].n).toMatchObject({ title: '[en] Grands soldes', body: '[en] Livraison gratuite ce week-end', fr: { title: 'Grands soldes', body: 'Livraison gratuite ce week-end' } });
  });

  it('both languages written by the admin: no translation at all', async () => {
    const b = await svc.send('Admin', { title: 'Sale', body: 'All 20% off', titleFr: 'Soldes', bodyFr: 'Tout à -20 %' });
    expect(fake.calls).toHaveLength(0);
    expect(b).toMatchObject({ title: 'Sale', titleFr: 'Soldes', bodyFr: 'Tout à -20 %', machineTranslated: [] });
    expect(notices[0].n.fr).toEqual({ title: 'Soldes', body: 'Tout à -20 %' });
  });

  it('a translator that is too slow (5 s) or down: the source text goes out, no French is claimed, and a job finishes it later', async () => {
    const down: TranslatorProvider = { name: 'fake', enabled: true, translate: async () => { throw new Error('503'); }, detect: async () => [] };
    build(down);
    const b = await svc.send('Admin', { title: 'Big sale', body: 'Free delivery' });
    expect(notices[0].n).toMatchObject({ title: 'Big sale', body: 'Free delivery' });
    expect(notices[0].n.fr).toBeUndefined();
    expect(b.translationStatus).toBe('pending');
    expect(await ds.getRepository(TranslationJob).count({ where: { entityType: 'broadcast', entityId: b.id } })).toBe(1);
  });

  it('with translation off the broadcast still goes out', async () => {
    build(new OffTranslator());
    const b = await svc.send('Admin', { title: 'Big sale', body: 'Free delivery' });
    expect(notices[0].n.fr).toBeUndefined();
    expect(b.translationStatus).toBe('off');
  });

  it('needs a title and a message in at least one language', async () => {
    await expect(svc.send('Admin', { body: 'No title' })).rejects.toThrow('Enter a title in English or French.');
    await expect(svc.send('Admin', { title: 'No message' })).rejects.toThrow('Enter a message in English or French.');
    expect(notices).toHaveLength(0);
  });

  it('list() serves both languages', async () => {
    await svc.send('Admin', { title: 'Hello', body: 'World wide' });
    expect((await svc.list())[0]).toMatchObject({ titleFr: '[fr] Hello', bodyFr: '[fr] World wide' });
    expect(await ds.getRepository(Translation).count({ where: { entityType: 'broadcast' } })).toBe(2);
  });

  describe('audience: the recipient count, the saved audience and the notification name the same people', () => {
    beforeEach(async () => {
      const users = ds.getRepository(User);
      const add = (role: string, n: number) =>
        users.save(Array.from({ length: n }, (_, i) => users.create({ emailHash: `${role}-${i}`, email: `${role}${i}@x.y`, passwordHash: 'x', name: `${role} ${i}`, role: role as never })));
      await add('customer', 3);
      await add('seller', 2);
      await add('rider', 1);
      await add('warehouse_staff', 4);
      await add('admin', 1);
    });

    it('"all" is every CUSTOMER: delivered to the customer room only, counted as customers only (not sellers, riders, staff or admins)', async () => {
      const b = await svc.send('Admin', { title: 'Hello', body: 'World wide', audience: 'all' });
      expect(notices.map((n) => n.role)).toEqual(['customer']);
      expect(b.recipients).toBe(3); // was 11, the count of every user
      expect(b.audience).toBe('all');
    });

    it('"customer" (and no audience) is the same people as "all"', async () => {
      expect((await svc.send('Admin', { title: 'A', body: 'a', audience: 'customer' })).recipients).toBe(3);
      expect((await svc.send('Admin', { title: 'B', body: 'b' })).recipients).toBe(3);
      expect(notices.map((n) => n.role)).toEqual(['customer', 'customer']);
    });

    it.each([
      ['seller', 2],
      ['rider', 1],
      ['warehouse_staff', 4],
    ])('"%s" is delivered to that role and counted as that role', async (audience, count) => {
      const b = await svc.send('Admin', { title: 'Hi', body: 'there', audience });
      expect(notices.map((n) => n.role)).toEqual([audience]);
      expect(b).toMatchObject({ recipients: count, audience });
    });

    it('an audience that is not offered (an admin role, a typo) is refused before anything is translated, saved or sent', async () => {
      for (const audience of ['admin', 'admin_finance', 'everyone', 'Customer', 7 as never]) {
        await expect(svc.send('Admin', { title: 'Hi', body: 'there', audience })).rejects.toThrow('Choose who receives it');
      }
      expect(notices).toEqual([]);
      expect(fake.calls).toHaveLength(0);
      expect(await ds.getRepository(Broadcast).count()).toBe(0);
    });
  });
});
