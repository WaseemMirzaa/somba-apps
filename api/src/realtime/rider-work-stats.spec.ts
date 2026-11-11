import { RealtimeGateway } from './realtime.gateway';

/** `rider:workStats` (and its deprecated alias `rider:earnings`): riders only, same answer on both names. */
describe('rider:workStats (gateway)', () => {
  const stats = { totalTasks: 3, completed: 2, active: 0, failed: 1, completedToday: 1, completedLast7Days: 2, successRate: 67, byKind: [{ kind: 'delivery', count: 2 }], delivered: 2 };
  let rider: { workStats: jest.Mock };
  let gw: RealtimeGateway;
  const as = (role: string, id = 'r1') => ({ data: { user: { id, role, name: `${role} name` } } }) as never;
  const anonymous = { data: {} } as never;
  const guest = { data: { user: { id: 'g', role: 'guest', name: 'Guest' } } } as never;

  beforeEach(() => {
    rider = { workStats: jest.fn(async () => stats) };
    gw = Object.assign(Object.create(RealtimeGateway.prototype), { rider });
  });

  it('answers a rider with their own stats', async () => {
    expect(await gw.riderWorkStats(as('rider', 'r9'))).toEqual({ ok: true, data: stats });
    expect(rider.workStats).toHaveBeenCalledWith('r9');
  });

  it('the old rider:earnings name returns exactly the same payload', async () => {
    expect(await gw.riderEarnings(as('rider'))).toEqual(await gw.riderWorkStats(as('rider')));
  });

  it('refuses everyone who is not a rider, on both names, and reads nothing', async () => {
    for (const role of ['customer', 'seller', 'admin', 'warehouse_staff', 'admin_operations']) {
      expect(await gw.riderWorkStats(as(role))).toEqual({ ok: false, error: 'Riders only.' });
      expect(await gw.riderEarnings(as(role))).toEqual({ ok: false, error: 'Riders only.' });
    }
    for (const client of [anonymous, guest]) {
      expect(await gw.riderWorkStats(client)).toEqual({ ok: false, error: 'Sign in to continue.' });
      expect(await gw.riderEarnings(client)).toEqual({ ok: false, error: 'Sign in to continue.' });
    }
    expect(rider.workStats).not.toHaveBeenCalled();
  });

  it('a failure in the service is the ack error', async () => {
    rider.workStats.mockRejectedValueOnce(new Error('boom'));
    expect(await gw.riderWorkStats(as('rider'))).toEqual({ ok: false, error: 'boom' });
  });
});
