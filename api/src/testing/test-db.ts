import { DataSource } from 'typeorm';
import { ENTITIES, Category, Product, Seller, Translation, TranslationJob } from '../database/entities';
import { FakeTranslator } from '../translation/fake.translator';
import { TranslationService } from '../translation/translation.service';
import type { TranslatorProvider } from '../translation/translator.provider';

/** Test support (jest only, not built): the real entity set on an in-memory SQLite database. */
export async function testDb(): Promise<DataSource> {
  const ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
  await ds.initialize();
  return ds;
}

/** A TranslationService on the given database; `autoRun` is off so tests decide when a job runs. */
export function testTranslations(ds: DataSource, provider: TranslatorProvider = new FakeTranslator()): TranslationService {
  const svc = new TranslationService(ds.getRepository(Translation), ds.getRepository(TranslationJob), provider, ds);
  svc.autoRun = false;
  return svc;
}

/** An emitter that records what it was asked to send. */
export function recordingEmitter() {
  const sent: { to: string; event: string; payload: any }[] = [];
  return {
    sent,
    registerFanout: () => undefined,
    registerUserView: () => undefined,
    toRoles: (roles: string[], event: string, payload: unknown) => void sent.push({ to: roles.join(','), event, payload }),
    toRole: (role: string, event: string, payload: unknown) => void sent.push({ to: role, event, payload }),
    toHub: (hubId: string, event: string, payload: unknown) => void sent.push({ to: `hub:${hubId}`, event, payload }),
    toUser: (id: string, event: string, payload: unknown) => void sent.push({ to: `user:${id}`, event, payload }),
  };
}

export async function addSeller(ds: DataSource, over: Partial<Seller> = {}): Promise<Seller> {
  return ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: 'Shop', status: 'approved', ...over }));
}

export async function addCategory(ds: DataSource, name: string, nameFr?: string): Promise<Category> {
  const cat = await ds.getRepository(Category).save(ds.getRepository(Category).create({ name }));
  if (nameFr) {
    await ds.getRepository(Translation).insert(
      ds.getRepository(Translation).create({ entityType: 'category', entityId: cat.id, field: 'name', locale: 'fr', value: nameFr, origin: 'author', sourceLang: 'en', sourceHash: null }),
    );
  }
  return cat;
}

export async function addProduct(ds: DataSource, over: Partial<Product> = {}): Promise<Product> {
  return ds.getRepository(Product).save(ds.getRepository(Product).create({ name: 'Phone', price: 10, status: 'live', ...over }));
}
