import { CashGateway } from '../warehouse/cash.gateway';
import { GeoGateway } from '../geo/geo.gateway';
import { InventoryGateway } from '../inventory/inventory.gateway';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RiderComplianceGateway } from '../rider-compliance/rider-compliance.gateway';
import { ShiftGateway } from '../shifts/shift.gateway';
import { AUDIT_ROLES, ROLE_GROUPS, inRoleGroup } from './role-groups';

/**
 * Least privilege, part 2: the gateways that used to let EVERY admin role through (`role.startsWith('admin')`) now hold each
 * feature to the department that owns it (`web/src/lib/admin-access.ts`). A role that must be refused gets the sentence the
 * neighbouring code already uses and nothing is read or written; the owning departments and the Super Admin still work.
 * The disputes, replacements, exchanges and Q&A gateways are covered in `after-sale/gateways.spec.ts`.
 */
const as = (role: string, id = 'u1') => ({ data: { user: { id, role, name: `${role} name` } } }) as never;
const ALL_ADMINS = ['admin', 'admin_operations', 'admin_finance', 'admin_support', 'admin_marketing', 'admin_moderation'];
const refused = (allowed: readonly string[]) => ALL_ADMINS.filter((r) => !allowed.includes(r));

describe('the role groups', () => {
  it('every group holds the super admin and only admin roles; the audit and desk groups are what the sockets use', () => {
    for (const [name, roles] of Object.entries(ROLE_GROUPS)) {
      expect(roles).toContain(name === 'orderAmounts' ? 'admin_finance' : 'admin');
      for (const r of roles) expect(ALL_ADMINS).toContain(r);
    }
    expect(AUDIT_ROLES).toEqual(['admin', 'admin_operations']);
    expect(inRoleGroup('admin_marketing', 'disputeDesk')).toBe(false);
    expect(inRoleGroup('admin_finance', 'disputeDesk')).toBe(true);
    expect(inRoleGroup(null, 'audit')).toBe(false);
  });
});

describe('InventoryGateway: correcting any store’s stock is the super admin’s and Operations’', () => {
  const inventory = () => ({
    adjust: jest.fn(async () => ({ ok: 1 })),
    movements: jest.fn(async () => []),
    settings: jest.fn(async () => ({ lowStockThreshold: 10 })),
    overview: jest.fn(async () => ({ rows: [] })),
  });

  it('refuses the other departments on every inventory event and touches nothing', async () => {
    const inv = inventory();
    const gw = new InventoryGateway(inv as never);
    for (const role of refused(ROLE_GROUPS.logisticsDesk)) {
      expect(await gw.adjust(as(role), { productId: 'p', delta: 1 })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.movements(as(role), { productId: 'p' })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.settings(as(role), { lowStockThreshold: 3 })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.overview(as(role), {})).toEqual({ ok: false, error: 'Not allowed.' });
    }
    expect(inv.adjust).not.toHaveBeenCalled();
    expect(inv.movements).not.toHaveBeenCalled();
    expect(inv.settings).not.toHaveBeenCalled();
    expect(inv.overview).not.toHaveBeenCalled();
  });

  it('the super admin and Operations still work, as themselves', async () => {
    const inv = inventory();
    const gw = new InventoryGateway(inv as never);
    for (const role of ROLE_GROUPS.logisticsDesk) {
      expect((await gw.adjust(as(role, 'a1'), { productId: 'p', delta: 2 })).ok).toBe(true);
      expect((await gw.overview(as(role, 'a1'), {})).ok).toBe(true);
    }
    expect(inv.adjust).toHaveBeenCalledWith({ id: 'a1', role: 'admin_operations', name: 'admin_operations name' }, { productId: 'p', delta: 2 }, 'a1');
  });

  it('customers and riders keep "Sellers only."', async () => {
    const gw = new InventoryGateway(inventory() as never);
    expect(await gw.adjust(as('customer'), {})).toEqual({ ok: false, error: 'Sellers only.' });
    expect(await gw.overview(as('rider'), {})).toEqual({ ok: false, error: 'Sellers only.' });
  });
});

describe('CashGateway, ShiftGateway, RiderComplianceGateway: the desk checks happen at the door too', () => {
  const users = { findOne: jest.fn(async () => null) };

  it('rider cash: the super admin, finance and Operations; support, marketing and moderation are refused', async () => {
    const cash = { history: jest.fn(async () => []), handOver: jest.fn(async () => ({ ok: 1 })) };
    const gw = new CashGateway(cash as never, users as never);
    for (const role of ['admin_support', 'admin_marketing', 'admin_moderation']) {
      expect(await gw.history(as(role), {})).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.handover(as(role), { riderId: 'r', amountUsd: 5 })).toEqual({ ok: false, error: 'Not allowed.' });
    }
    expect(cash.history).not.toHaveBeenCalled();
    expect(cash.handOver).not.toHaveBeenCalled();
    for (const role of ['admin', 'admin_finance', 'admin_operations']) expect((await gw.history(as(role), {})).ok).toBe(true);
    expect(cash.history).toHaveBeenCalledTimes(3);
  });

  it('rider attendance: the super admin and Operations; every other department is refused', async () => {
    const shifts = { forStaff: jest.fn(async () => ({ ok: 1 })) };
    const gw = new ShiftGateway(shifts as never, users as never);
    for (const role of refused(['admin', 'admin_operations'])) expect(await gw.attendance(as(role), { riderId: 'r' })).toEqual({ ok: false, error: 'Not allowed.' });
    expect(shifts.forStaff).not.toHaveBeenCalled();
    for (const role of ['admin', 'admin_operations']) expect((await gw.attendance(as(role), { riderId: 'r' })).ok).toBe(true);
  });

  it('rider vehicle and documents: the super admin and Operations; every other department is refused', async () => {
    const svc = { staffView: jest.fn(async () => ({ ok: 1 })), updateVehicle: jest.fn(async () => ({ ok: 1 })), review: jest.fn(async () => ({ ok: 1 })) };
    const gw = new RiderComplianceGateway(svc as never, users as never);
    for (const role of refused(['admin', 'admin_operations'])) {
      expect(await gw.get(as(role), { riderId: 'r' })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.updateVehicle(as(role), { riderId: 'r', plate: 'X' })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.review(as(role), { id: 'd', decision: 'approve' })).toEqual({ ok: false, error: 'Not allowed.' });
    }
    expect(svc.staffView).not.toHaveBeenCalled();
    expect(svc.updateVehicle).not.toHaveBeenCalled();
    expect(svc.review).not.toHaveBeenCalled();
    for (const role of ['admin', 'admin_operations']) expect((await gw.get(as(role), { riderId: 'r' })).ok).toBe(true);
  });
});

describe('GeoGateway: the coverage map', () => {
  it('coverage:map is the geography desk’s (super admin, Operations) and the warehouses’; the other admin departments are refused', async () => {
    const coverage = { map: jest.fn(async () => ({ tree: [] })), gaps: jest.fn(async () => []) };
    const gw = Object.assign(Object.create(GeoGateway.prototype), { coverage }) as GeoGateway;
    for (const role of refused(['admin', 'admin_operations'])) {
      expect(await gw.map(as(role), {})).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.gaps(as(role), {})).toEqual({ ok: false, error: 'Not allowed.' });
    }
    for (const role of ['customer', 'seller', 'rider', 'guest']) expect(await gw.map(as(role), {})).toEqual({ ok: false, error: 'Not allowed.' });
    expect(coverage.map).not.toHaveBeenCalled();
    for (const role of ['admin', 'admin_operations', 'warehouse_staff']) expect((await gw.map(as(role), {})).ok).toBe(true);
    expect(coverage.map).toHaveBeenCalledTimes(3);
    expect((await gw.gaps(as('admin'), {})).ok).toBe(true);
  });
});

describe('RealtimeGateway: campaigns:list', () => {
  const campaigns = () => ({ list: jest.fn(async () => [{ id: 'c1' }]) });
  const gateway = (c: ReturnType<typeof campaigns>) =>
    Object.assign(Object.create(RealtimeGateway.prototype), {
      campaigns: c,
      kit: { ctx: { resolve: jest.fn(async () => ({ seller: { id: 's1' }, actor: { id: 'owner', name: 'Shop', role: 'seller' } })) } },
    }) as RealtimeGateway;

  it('the platform’s campaign list is the super admin’s and Marketing’s; the other admin departments are refused', async () => {
    const c = campaigns();
    const gw = gateway(c);
    for (const role of refused(ROLE_GROUPS.campaignDecisions)) expect(await gw.campaignsList(as(role))).toEqual({ ok: false, error: 'Not allowed.' });
    expect(c.list).not.toHaveBeenCalled();
    for (const role of ROLE_GROUPS.campaignDecisions) expect(await gw.campaignsList(as(role))).toEqual({ ok: true, data: [{ id: 'c1' }] });
  });
});
