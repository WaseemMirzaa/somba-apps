import { StaffTierService } from './staff-tier.service';

const ROWS: Record<string, { id: string; hubId: string | null; warehouseTier: string | null }> = {
  op: { id: 'op', hubId: 'h1', warehouseTier: 'operator' },
  sup: { id: 'sup', hubId: 'h1', warehouseTier: 'supervisor' },
  mgr: { id: 'mgr', hubId: 'h2', warehouseTier: 'manager' },
  none: { id: 'none', hubId: null, warehouseTier: 'manager' },
};
const svc = () => new StaffTierService({ findOne: jest.fn(async ({ where }: { where: { id: string } }) => ROWS[where.id] ?? null) } as never);

describe('StaffTierService', () => {
  it('hubOf: the warehouse of a staff member as the database holds it; null for admins, riders, unlinked staff and unknown ids', async () => {
    const s = svc();
    expect(await s.hubOf({ id: 'op', role: 'warehouse_staff' })).toBe('h1');
    expect(await s.hubOf({ id: 'mgr', role: 'warehouse_staff' })).toBe('h2');
    expect(await s.hubOf({ id: 'none', role: 'warehouse_staff' })).toBeNull();
    expect(await s.hubOf({ id: 'ghost', role: 'warehouse_staff' })).toBeNull();
    expect(await s.hubOf({ id: 'op', role: 'admin' })).toBeNull();
    expect(await s.hubOf({ id: 'op', role: 'rider' })).toBeNull();
  });

  it('allows: admins everything, staff by tier, everyone else nothing', async () => {
    const s = svc();
    expect(await s.allows({ id: 'x', role: 'admin_support' }, 'oversee')).toBe(true);
    expect(await s.allows({ id: 'op', role: 'warehouse_staff' }, 'oversee')).toBe(false);
    expect(await s.allows({ id: 'sup', role: 'warehouse_staff' }, 'oversee')).toBe(true);
    expect(await s.allows({ id: 'sup', role: 'warehouse_staff' }, 'manage')).toBe(false);
    expect(await s.allows({ id: 'mgr', role: 'warehouse_staff' }, 'manage')).toBe(true);
    expect(await s.allows({ id: 'sup', role: 'rider' }, 'scan')).toBe(false);
  });
});
