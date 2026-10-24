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

const build = (provider: TranslatorProvider) => {
  translations = testTranslations(ds, provider);
  notices = [];
  const notifications = { toRole: async (role: string, n: never) => void notices.push({ role, n }) };
  svc = new BroadcastsService(ds.getRepository(Broadcast), ds.getRepository(User), notifications as never, recordingEmitter() as never, translations);
};

beforeEach(async () => {
  ds = await testDb();
  fake = new FakeTranslator();
  build(fake);
});
afterEach(async () => ds.destroy());

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

  it('audience "all" goes to customers; list() serves both languages', async () => {
    await svc.send('Admin', { title: 'Hello', body: 'World wide', audience: 'all' });
    expect(notices[0].role).toBe('customer');
    expect((await svc.list())[0]).toMatchObject({ titleFr: '[fr] Hello', bodyFr: '[fr] World wide' });
    expect(await ds.getRepository(Translation).count({ where: { entityType: 'broadcast' } })).toBe(2);
  });
});
