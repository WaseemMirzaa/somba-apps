import { DataSource } from 'typeorm';
import { DeviceToken, User } from '../database/entities';
import { PushService } from './push.service';

/** The real device query (one join of device tokens to users' language) on an in-memory database. */
describe('PushService device query', () => {
  let ds: DataSource;
  let svc: PushService;
  const sent: { tokens: string[]; notification: { title: string } }[] = [];

  beforeAll(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [User, DeviceToken], synchronize: true });
    await ds.initialize();
    const users = ds.getRepository(User);
    const mk = (id: string, role: string, locale: 'en' | 'fr') =>
      users.save(users.create({ id, email: `${id}@x.cd`, emailHash: id, passwordHash: 'x', name: id, role: role as never, locale }));
    await mk('a1', 'admin', 'fr');
    await mk('a2', 'admin', 'en');
    await mk('r1', 'rider', 'fr');
    const tokens = ds.getRepository(DeviceToken);
    const dev = (token: string, userId: string, role: string, app: 'web' | 'customer' | 'rider') =>
      tokens.save(tokens.create({ token, userId, role, app, platform: 'web' }));
    await dev('A1-web', 'a1', 'admin', 'web');
    await dev('A1-phone', 'a1', 'admin', 'customer');
    await dev('A2-web', 'a2', 'admin', 'web');
    await dev('ORPHAN', 'ghost', 'admin', 'web'); // its user no longer exists
    await dev('R1', 'r1', 'rider', 'rider');
    svc = new PushService(tokens);
    (svc as never as { messaging: unknown }).messaging = {
      sendEachForMulticast: async (m: (typeof sent)[number]) => {
        sent.push(m);
        return { successCount: m.tokens.length, responses: m.tokens.map(() => ({ success: true })) };
      },
    };
  });

  afterAll(() => ds.destroy());
  beforeEach(() => void (sent.length = 0));

  const en = { title: 'Order placed', body: 'We received SOM-1.' };
  const fr = { title: 'Commande enregistrée', body: 'Nous avons reçu SOM-1.' };

  it('serves each device of a role in its owner’s language', async () => {
    expect(await svc.sendToRole('admin', { ...en, fr })).toBe(4);
    const byTitle = Object.fromEntries(sent.map((m) => [m.notification.title, m.tokens.sort()]));
    expect(byTitle[fr.title]).toEqual(['A1-phone', 'A1-web']);
    expect(byTitle[en.title]).toEqual(['A2-web', 'ORPHAN']);
  });

  it('applies the app scope and the user selector', async () => {
    await svc.sendToRole('admin', { ...en, fr }, { apps: ['web'] });
    expect(sent.flatMap((m) => m.tokens).sort()).toEqual(['A1-web', 'A2-web', 'ORPHAN']);
    sent.length = 0;
    await svc.sendToUsers(['a1', 'r1'], { ...en, fr });
    expect(sent.flatMap((m) => m.tokens).sort()).toEqual(['A1-phone', 'A1-web', 'R1']);
    expect(sent.every((m) => m.notification.title === fr.title)).toBe(true);
  });

  it('reaches every device in one multicast when there is no French version', async () => {
    await svc.sendToUser('a1', en);
    expect(sent).toHaveLength(1);
    expect(sent[0].tokens.sort()).toEqual(['A1-phone', 'A1-web']);
  });
});
