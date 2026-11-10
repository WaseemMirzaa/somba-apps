import { PUBLIC_SETTINGS, SettingsService } from './settings.service';

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

describe('delivery time and express settings', () => {
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

  it('accepts every key inside its range and stores the normalised value', async () => {
    await svc.set('localDeliveryDays', 0);
    await svc.set('splitDeliveryAfterHours', '720');
    await svc.set('expressDeliveryEnabled', 'true');
    await svc.set('expressDeliveryDays', 30);
    await svc.set('expressBaseUsd', 2);
    await svc.set('expressPerKmUsd', '0.5');
    await svc.set('expressMaxUsd', 500);
    await svc.set('expressMaxKm', 100);
    expect(rows).toEqual({
      localDeliveryDays: '0',
      splitDeliveryAfterHours: '720',
      expressDeliveryEnabled: 'true',
      expressDeliveryDays: '30',
      expressBaseUsd: '2',
      expressPerKmUsd: '0.5',
      expressMaxUsd: '500',
      expressMaxKm: '100',
    });
    await svc.set('splitDeliveryAfterHours', 0); // 0 = never split
    expect(rows.splitDeliveryAfterHours).toBe('0');
  });

  it('refuses out-of-range, fractional and non-numeric values with the error text', async () => {
    await expect(svc.set('localDeliveryDays', 31)).rejects.toThrow('Local delivery days must be a whole number between 0 and 30.');
    await expect(svc.set('localDeliveryDays', 1.5)).rejects.toThrow('Local delivery days must be a whole number between 0 and 30.');
    await expect(svc.set('localDeliveryDays', -1)).rejects.toThrow();
    await expect(svc.set('splitDeliveryAfterHours', 721)).rejects.toThrow('Split delivery hours must be a whole number between 0 and 720.');
    await expect(svc.set('splitDeliveryAfterHours', 1.5)).rejects.toThrow();
    await expect(svc.set('expressDeliveryDays', 31)).rejects.toThrow('Express delivery days must be a whole number between 0 and 30.');
    await expect(svc.set('expressBaseUsd', 101)).rejects.toThrow('Express base fee must be a number between 0 and 100.');
    await expect(svc.set('expressPerKmUsd', 51)).rejects.toThrow('Express fee per km must be a number between 0 and 50.');
    await expect(svc.set('expressMaxUsd', 501)).rejects.toThrow('Maximum express fee must be a number between 0 and 500.');
    await expect(svc.set('expressMaxKm', 101)).rejects.toThrow('Express maximum distance must be a number between 0 and 100.');
    await expect(svc.set('expressMaxKm', 'far')).rejects.toThrow();
    await expect(svc.set('expressBaseUsd', -1)).rejects.toThrow();
    expect(rows).toEqual({});
  });

  it('the express switch is a true/false flag', async () => {
    await svc.set('expressDeliveryEnabled', 'false');
    await expect(svc.set('expressDeliveryEnabled', 'maybe')).rejects.toThrow('Express delivery flag must be one of: true, false.');
    await expect(svc.set('expressDeliveryEnabled', true)).resolves.toBeDefined(); // String(true) = 'true'
  });

  it('every key is public (shoppers and apps read it) and writable by admins', async () => {
    for (const [k, v] of [['localDeliveryDays', '1'], ['splitDeliveryAfterHours', '24'], ['expressDeliveryEnabled', 'false'], ['expressDeliveryDays', '0'], ['expressBaseUsd', '2'], ['expressPerKmUsd', '0.5'], ['expressMaxUsd', '15'], ['expressMaxKm', '0']] as const) {
      await svc.set(k, v);
    }
    await svc.set('commissionPct', 12); // not public
    const pub = await svc.publicView();
    expect(Object.keys(pub).sort()).toEqual(['expressBaseUsd', 'expressDeliveryDays', 'expressDeliveryEnabled', 'expressMaxKm', 'expressMaxUsd', 'expressPerKmUsd', 'localDeliveryDays', 'splitDeliveryAfterHours']);
    expect(PUBLIC_SETTINGS).toEqual(expect.arrayContaining(Object.keys(pub)));
  });
});
