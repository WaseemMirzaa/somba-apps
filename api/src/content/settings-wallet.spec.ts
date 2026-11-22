import { PUBLIC_SETTINGS, SettingsService } from './settings.service';

/** The wallet switch: public (apps and shop hide every wallet entry from it), validated, on when never stored, live via settings:updated. */
describe('walletEnabled setting', () => {
  const rows: Record<string, string> = {};
  const toRoles: { roles: string[]; event: string; payload: Record<string, string> }[] = [];
  const repo = {
    find: async () => Object.entries(rows).map(([key, value]) => ({ key, value })),
    findOne: async ({ where }: { where: { key: string } }) => (rows[where.key] !== undefined ? { key: where.key, value: rows[where.key] } : null),
    create: (r: { key: string; value: string }) => r,
    save: async (r: { key: string; value: string }) => ((rows[r.key] = r.value), r),
  };
  const svc = new SettingsService(repo as never, { toRoles: (roles: string[], event: string, payload: Record<string, string>) => void toRoles.push({ roles, event, payload }) } as never);
  beforeEach(() => {
    Object.keys(rows).forEach((k) => delete rows[k]);
    toRoles.length = 0;
  });

  it('a server that never stored it says: wallet on', async () => {
    expect(await svc.clientView()).toMatchObject({ walletEnabled: 'true' });
  });

  it('is public and an admin can switch it off and on; customers hear it live (settings:updated)', async () => {
    expect(PUBLIC_SETTINGS).toContain('walletEnabled');
    await svc.set('walletEnabled', 'false');
    expect(await svc.publicView()).toMatchObject({ walletEnabled: 'false' });
    const toShoppers = toRoles.find((e) => e.roles.includes('customer'));
    expect(toShoppers).toMatchObject({ event: 'settings:updated', payload: { walletEnabled: 'false' } });
    await svc.set('walletEnabled', 'true');
    expect(await svc.clientView()).toMatchObject({ walletEnabled: 'true' });
  });

  it('refuses nonsense', async () => {
    await expect(svc.set('walletEnabled', 'maybe')).rejects.toThrow();
    await expect(svc.set('walletEnabled', '1')).rejects.toThrow();
  });
});
