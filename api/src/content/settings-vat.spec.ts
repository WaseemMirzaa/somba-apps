import { PUBLIC_SETTINGS, SettingsService } from './settings.service';

/** VAT and fee-payer settings: public (clients compute the cart from them), validated, defaulted when never stored. */
describe('VAT and fee payer settings', () => {
  const rows: Record<string, string> = {};
  const repo = {
    find: async () => Object.entries(rows).map(([key, value]) => ({ key, value })),
    findOne: async ({ where }: { where: { key: string } }) => (rows[where.key] !== undefined ? { key: where.key, value: rows[where.key] } : null),
    create: (r: { key: string; value: string }) => r,
    save: async (r: { key: string; value: string }) => {
      rows[r.key] = r.value;
      return r;
    },
  };
  const svc = new SettingsService(repo as never, { toRoles: () => undefined } as never);
  beforeEach(() => Object.keys(rows).forEach((k) => delete rows[k]));

  it('a server that never stored them says: VAT off, 16%, customer pays, fee shown', async () => {
    expect(await svc.clientView()).toMatchObject({ vatEnabled: 'false', vatPct: '16', deliveryFeePaidBy: 'customer', showPlatformFee: 'true' });
  });

  it('stores each within its range and shows it to shoppers', async () => {
    await svc.set('vatEnabled', 'true');
    await svc.set('vatPct', 18.5);
    await svc.set('deliveryFeePaidBy', 'seller');
    await svc.set('showPlatformFee', 'false');
    expect(await svc.publicView()).toMatchObject({ vatEnabled: 'true', vatPct: '18.5', deliveryFeePaidBy: 'seller', showPlatformFee: 'false' });
    for (const k of ['vatEnabled', 'vatPct', 'deliveryFeePaidBy', 'showPlatformFee']) expect(PUBLIC_SETTINGS).toContain(k);
  });

  it('refuses nonsense', async () => {
    await expect(svc.set('vatEnabled', 'yes')).rejects.toThrow();
    await expect(svc.set('showPlatformFee', '1')).rejects.toThrow();
    await expect(svc.set('vatPct', 51)).rejects.toThrow('VAT must be a number between 0 and 50.');
    await expect(svc.set('vatPct', -1)).rejects.toThrow();
    await expect(svc.set('deliveryFeePaidBy', 'rider')).rejects.toThrow();
  });
});
