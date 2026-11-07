import { ShiftGateway } from './shift.gateway';

/** The socket layer: who may call what, and that a rider can only ever reach their own shifts (the id never comes from the body). */
const as = (role: string, id = 'u1') => ({ data: { user: { id, role, name: `${role} name` } } }) as never;
const guest = { data: {} } as never;

function gateway(users: Record<string, { hubId: string | null; warehouseTier: string | null; active?: boolean }> = {}) {
  const calls: string[] = [];
  const sum = (id: string) => ({ status: 'on', id });
  const shifts = {
    mine: jest.fn(async (id: string) => (calls.push(`mine:${id}`), sum(id))),
    clockIn: jest.fn(async (id: string) => (calls.push(`in:${id}`), sum(id))),
    clockOut: jest.fn(async (id: string) => (calls.push(`out:${id}`), sum(id))),
    startBreak: jest.fn(async (id: string) => (calls.push(`bs:${id}`), sum(id))),
    endBreak: jest.fn(async (id: string) => (calls.push(`be:${id}`), sum(id))),
    forStaff: jest.fn(async (actor: unknown, riderId: unknown) => ({ actor, riderId })),
  };
  const repo = { findOne: jest.fn(async ({ where }: { where: { id: string } }) => users[where.id] ?? null) };
  return { gw: new ShiftGateway(shifts as never, repo as never), shifts, calls };
}

describe('ShiftGateway', () => {
  it('the rider events use the id from the socket and ignore anything in a body', async () => {
    const { gw, calls } = gateway();
    const me = as('rider', 'rider-1');
    expect(await gw.mine(me)).toEqual({ ok: true, data: { status: 'on', id: 'rider-1' } });
    await gw.clockIn(me);
    await gw.breakStart(me);
    await gw.breakEnd(me);
    await gw.clockOut(me);
    expect(calls).toEqual(['mine:rider-1', 'in:rider-1', 'bs:rider-1', 'be:rider-1', 'out:rider-1']);
  });

  it('only riders: customers, sellers, staff, admins and guests get "Riders only."', async () => {
    const { gw, shifts } = gateway();
    for (const c of [as('customer'), as('seller'), as('warehouse_staff'), as('admin'), as('admin_operations'), guest]) {
      for (const f of [gw.mine, gw.clockIn, gw.clockOut, gw.breakStart, gw.breakEnd]) {
        expect(await f.call(gw, c)).toEqual({ ok: false, error: 'Riders only.' });
      }
    }
    expect(shifts.clockIn).not.toHaveBeenCalled();
  });

  it('a service error comes back as { ok: false, error } and not as a crash', async () => {
    const { gw, shifts } = gateway();
    shifts.startBreak.mockRejectedValueOnce(new Error('Start your shift first.'));
    expect(await gw.breakStart(as('rider'))).toEqual({ ok: false, error: 'Start your shift first.' });
  });

  describe('attendance:rider', () => {
    it('an admin is passed through with no warehouse, to the service that checks the role', async () => {
      const { gw, shifts } = gateway();
      const r = await gw.attendance(as('admin_operations', 'a1'), { riderId: 'r1' });
      expect(r.ok).toBe(true);
      expect(shifts.forStaff).toHaveBeenCalledWith({ id: 'a1', role: 'admin_operations', name: 'admin_operations name', hubId: null, tier: null }, 'r1');
    });

    it('warehouse staff are passed with the warehouse and tier from the database, not the socket', async () => {
      const { gw, shifts } = gateway({ sup: { hubId: 'h1', warehouseTier: 'supervisor' }, none: { hubId: 'h1', warehouseTier: null } });
      await gw.attendance(as('warehouse_staff', 'sup'), { riderId: 'r1' });
      expect(shifts.forStaff).toHaveBeenLastCalledWith(expect.objectContaining({ hubId: 'h1', tier: 'supervisor' }), 'r1');
      await gw.attendance(as('warehouse_staff', 'none'), { riderId: 'r1' });
      expect(shifts.forStaff).toHaveBeenLastCalledWith(expect.objectContaining({ tier: 'operator' }), 'r1');
    });

    it('staff with no warehouse, or switched off, are refused', async () => {
      const { gw, shifts } = gateway({ nohub: { hubId: null, warehouseTier: 'manager' }, off: { hubId: 'h1', warehouseTier: 'manager', active: false } });
      for (const id of ['nohub', 'off', 'missing']) {
        expect(await gw.attendance(as('warehouse_staff', id), { riderId: 'r1' })).toEqual({ ok: false, error: 'Your account is not linked to a warehouse. Ask an administrator.' });
      }
      expect(shifts.forStaff).not.toHaveBeenCalled();
    });

    it('riders, customers, sellers and guests are refused before anything is read', async () => {
      const { gw, shifts } = gateway();
      expect(await gw.attendance(as('rider'), { riderId: 'r1' })).toEqual({ ok: false, error: 'Staff only.' });
      expect(await gw.attendance(as('customer'), { riderId: 'r1' })).toEqual({ ok: false, error: 'Staff only.' });
      expect(await gw.attendance(as('seller'), { riderId: 'r1' })).toEqual({ ok: false, error: 'Staff only.' });
      expect(await gw.attendance(guest, { riderId: 'r1' })).toEqual({ ok: false, error: 'Sign in to continue.' });
      expect(shifts.forStaff).not.toHaveBeenCalled();
    });
  });
});
