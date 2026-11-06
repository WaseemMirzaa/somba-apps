import { FRAUD_THRESHOLDS } from '../ops/fraud-rules.config';
import { SettingsService } from './settings.service';

/** The staff two-factor switch and the fraud thresholds are validated, admin-only settings. */
describe('staff two-factor and fraud settings', () => {
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

  it('requireStaffTwoFactor is a true/false flag and is never public', async () => {
    await svc.set('requireStaffTwoFactor', 'true');
    await svc.set('requireStaffTwoFactor', false);
    expect(rows.requireStaffTwoFactor).toBe('false');
    await expect(svc.set('requireStaffTwoFactor', 'maybe')).rejects.toThrow();
    await svc.set('requireStaffTwoFactor', 'true');
    expect(await svc.publicView()).toEqual({});
    expect(Object.keys(await svc.clientView())).not.toContain('requireStaffTwoFactor');
  });

  it.each(Object.values(FRAUD_THRESHOLDS))('$key accepts whole numbers from $min to $max and refuses the rest', async (t) => {
    await svc.set(t.key, t.min);
    await svc.set(t.key, String(t.max));
    expect(rows[t.key]).toBe(String(t.max));
    await expect(svc.set(t.key, t.min - 1)).rejects.toThrow(/whole number/);
    await expect(svc.set(t.key, t.max + 1)).rejects.toThrow(/whole number/);
    await expect(svc.set(t.key, 3.5)).rejects.toThrow(/whole number/);
    await expect(svc.set(t.key, 'many')).rejects.toThrow();
    await expect(svc.set(t.key, '')).rejects.toThrow();
  });

  it('the thresholds are admin-only: shoppers and guests never receive them', async () => {
    for (const t of Object.values(FRAUD_THRESHOLDS)) await svc.set(t.key, t.default);
    expect(await svc.publicView()).toEqual({});
    expect(Object.keys(await svc.all())).toHaveLength(Object.keys(FRAUD_THRESHOLDS).length);
  });

  it('documents the defaults the plan asks for', () => {
    expect(Object.fromEntries(Object.entries(FRAUD_THRESHOLDS).map(([k, t]) => [k, t.default]))).toEqual({
      failedPayments: 5, newAccountOrders: 3, newAccountDays: 7, sharedAccounts: 3, returnRatePct: 50, returnMinOrders: 3, addressChanges: 3,
    });
  });
});
