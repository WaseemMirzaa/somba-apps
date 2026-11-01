import { RealtimeGateway } from './realtime.gateway';
import { RealtimeEmitter } from './realtime-emitter';

/** `staff:setActive { userId, active }`: who may call it, what it audits, and that it drops the person's open sockets. */
describe('staff:setActive (gateway)', () => {
  const done = { id: 'u1', name: 'Marc Rider', email: 'marc@somba.app', role: 'rider', active: false, hubId: 'h1', warehouseTier: null, openTasks: 2 };
  let roles: { setStaffActive: jest.Mock };
  let audit: { record: jest.Mock };
  let disconnectSockets: jest.Mock;
  let room: jest.Mock;
  let gw: RealtimeGateway;
  const as = (role: string, id = 'a1') => ({ data: { user: { id, role, name: `${role} name` } } }) as never;

  beforeEach(() => {
    roles = { setStaffActive: jest.fn(async (id: string, active: boolean) => ({ ...done, id, active })) };
    audit = { record: jest.fn(async () => undefined) };
    disconnectSockets = jest.fn();
    room = jest.fn(() => ({ disconnectSockets }));
    // The gateway has dozens of collaborators; this event uses three, so build it without its constructor.
    gw = Object.assign(Object.create(RealtimeGateway.prototype), { roles, audit, server: { in: room } });
  });

  it('is for the super admin only: other admin roles, staff, riders, customers and guests are refused and nothing changes', async () => {
    for (const role of ['admin_operations', 'admin_support', 'warehouse_staff', 'rider', 'customer', 'seller']) {
      expect(await gw.staffSetActive(as(role), { userId: 'u1', active: false })).toEqual({ ok: false, error: 'Super admin only.' });
    }
    expect(await gw.staffSetActive({ data: { user: { id: 'guest', role: 'guest', name: 'Guest' } } } as never, { userId: 'u1', active: false })).toEqual({ ok: false, error: 'Sign in to continue.' });
    expect(roles.setStaffActive).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(disconnectSockets).not.toHaveBeenCalled();
  });

  it('wants a real true or false', async () => {
    for (const active of ['false', 0, null, undefined]) {
      expect(await gw.staffSetActive(as('admin'), { userId: 'u1', active } as never)).toEqual({ ok: false, error: 'Active must be true or false.' });
    }
    expect(roles.setStaffActive).not.toHaveBeenCalled();
  });

  it('switching off: replies with the person, audits it, and kicks every open socket of theirs', async () => {
    const res = await gw.staffSetActive(as('admin'), { userId: 'u1', active: false });
    expect(res).toEqual({ ok: true, data: { ...done, id: 'u1', active: false } });
    expect(roles.setStaffActive).toHaveBeenCalledWith('u1', false);
    expect(audit.record).toHaveBeenCalledWith({ actor: 'admin name', role: 'admin', action: 'staff.deactivate', entity: 'user', entityId: 'u1', detail: 'rider marc@somba.app' });
    expect(room).toHaveBeenCalledWith(RealtimeEmitter.userRoom('u1'));
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });

  it('switching on: audited as a reactivation, nobody is kicked', async () => {
    const res = await gw.staffSetActive(as('admin'), { userId: 'u1', active: true });
    expect(res).toMatchObject({ ok: true, data: { id: 'u1', active: true } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'staff.reactivate', entityId: 'u1' }));
    expect(disconnectSockets).not.toHaveBeenCalled();
  });

  it('a refusal from the service is the ack error, with no audit and no kick', async () => {
    roles.setStaffActive.mockRejectedValueOnce(new Error('Only riders and warehouse staff can be switched on or off here.'));
    expect(await gw.staffSetActive(as('admin'), { userId: 'c1', active: false })).toEqual({ ok: false, error: 'Only riders and warehouse staff can be switched on or off here.' });
    expect(audit.record).not.toHaveBeenCalled();
    expect(disconnectSockets).not.toHaveBeenCalled();
  });
});
