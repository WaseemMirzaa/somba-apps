import { SettingsService } from './settings.service';

/** The delivery fee numbers are public, validated settings; zones are no longer writable. */
describe('delivery settings', () => {
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

  it('accepts the four fee numbers within their ranges', async () => {
    await svc.set('deliveryBaseUsd', 2);
    await svc.set('deliveryPerKmUsd', '0.5');
    await svc.set('deliveryMaxUsd', 15);
    await svc.set('deliveryTransferUsd', 1.5);
    expect(rows).toMatchObject({ deliveryBaseUsd: '2', deliveryPerKmUsd: '0.5', deliveryMaxUsd: '15', deliveryTransferUsd: '1.5' });
  });

  it('refuses negative, absurd or non-numeric fees', async () => {
    await expect(svc.set('deliveryBaseUsd', -1)).rejects.toThrow();
    await expect(svc.set('deliveryPerKmUsd', 51)).rejects.toThrow();
    await expect(svc.set('deliveryMaxUsd', 'lots')).rejects.toThrow();
    await expect(svc.set('deliveryTransferUsd', 101)).rejects.toThrow();
  });

  it('makes them public to shoppers while the zones key can no longer be written', async () => {
    await svc.set('deliveryBaseUsd', 3);
    await svc.set('commissionPct', 12);
    expect(await svc.publicView()).toEqual({ deliveryBaseUsd: '3' });
    await expect(svc.set('deliveryZones', '[]')).rejects.toThrow('Unknown setting.');
  });

  it('the pin switches are true/false flags', async () => {
    await svc.set('requirePinnedAddress', 'true');
    await svc.set('requireSellerPickupPin', 'false');
    await expect(svc.set('requirePinnedAddress', 'maybe')).rejects.toThrow();
  });
});

describe('inter-city delivery settings', () => {
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

  it('the switch is a true/false flag and the days a whole number up to 30; both are public', async () => {
    await svc.set('allowInterCityDelivery', 'false');
    await svc.set('interCityTransferDays', 5);
    expect(await svc.publicView()).toEqual({ allowInterCityDelivery: 'false', interCityTransferDays: '5' });
    await expect(svc.set('allowInterCityDelivery', 'maybe')).rejects.toThrow();
    await expect(svc.set('interCityTransferDays', 31)).rejects.toThrow();
    await expect(svc.set('interCityTransferDays', 1.5)).rejects.toThrow();
    await expect(svc.set('interCityTransferDays', -1)).rejects.toThrow();
  });
});
