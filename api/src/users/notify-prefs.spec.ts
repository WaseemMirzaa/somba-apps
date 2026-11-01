import { DataSource } from 'typeorm';
import { User } from '../database/entities';
import { testDb } from '../testing/test-db';
import { DEFAULT_NOTIFY, NOTIFY_CATEGORIES } from './notify-prefs';
import { UsersService } from './users.service';

let ds: DataSource;
let users: UsersService;
beforeEach(async () => {
  ds = await testDb();
  users = new UsersService(ds.getRepository(User));
});
afterEach(() => ds.destroy());

describe('UsersService.setPrefs: notification switches', () => {
  async function seller() {
    return users.create({ email: 's@x.test', passwordHash: 'x', name: 'S', role: 'seller' });
  }

  it('every kind is on by default and is part of the public prefs', async () => {
    const u = await seller();
    expect(UsersService.toPublic(u).prefs.notify).toEqual(DEFAULT_NOTIFY);
    expect(NOTIFY_CATEGORIES).toEqual(['order', 'payout', 'stock', 'review', 'question', 'message', 'product', 'promo']);
  });

  it('merges switches without touching the others, and keeps them across saves', async () => {
    const u = await seller();
    const first = await users.setPrefs(u.id, { notify: { order: false } } as never);
    expect(first.notify).toEqual({ ...DEFAULT_NOTIFY, order: false });
    const second = await users.setPrefs(u.id, { notify: { review: false }, push: false } as never);
    expect(second.notify).toEqual({ ...DEFAULT_NOTIFY, order: false, review: false });
    expect(second.push).toBe(false);
    const third = await users.setPrefs(u.id, { notify: { order: true } } as never);
    expect(third.notify.order).toBe(true);
    expect(UsersService.parsePrefs((await users.findById(u.id))!.prefs).notify).toEqual({ ...DEFAULT_NOTIFY, review: false });
  });

  it('still takes the old preferences on their own', async () => {
    const u = await seller();
    const out = await users.setPrefs(u.id, { sms: true, market: 'FR' });
    expect(out).toMatchObject({ sms: true, market: 'FR', push: true });
    expect(out.notify).toEqual(DEFAULT_NOTIFY);
  });

  it('refuses unknown kinds, non-boolean values and non-objects, saving nothing', async () => {
    const u = await seller();
    await expect(users.setPrefs(u.id, { notify: { nonsense: true } } as never)).rejects.toThrow('Unknown notification kind: nonsense.');
    await expect(users.setPrefs(u.id, { notify: { order: 'no' } } as never)).rejects.toThrow('order must be true or false.');
    await expect(users.setPrefs(u.id, { notify: [] } as never)).rejects.toThrow(/switches/);
    await expect(users.setPrefs(u.id, { notify: null } as never)).rejects.toThrow(/switches/);
    expect(UsersService.parsePrefs((await users.findById(u.id))!.prefs).notify).toEqual(DEFAULT_NOTIFY);
  });
});
