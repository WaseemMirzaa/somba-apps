import { DisputesService } from './disputes.service';

function make() {
  const emits: [string, string, string][] = [];
  const notices: { to: string; type?: string; title: string }[] = [];
  const order = {
    id: 'o1',
    reference: 'SOM-1',
    customerId: 'c1',
    status: 'delivered',
    items: [
      { productId: 'p1', sellerId: 's1', fulfilment: 'open', qty: 1 },
      { productId: 'p2', sellerId: 's2', fulfilment: 'cancelled', qty: 1 },
    ],
  };
  const saved: Record<string, unknown>[] = [];
  const disputes = {
    count: async () => 0,
    create: (x: object) => ({ id: 'd1', ...x }),
    save: async (x: Record<string, unknown>) => (saved.push(x), x),
  };
  const orders = { findOne: async () => order };
  const sellers = { findOne: async ({ where }: { where: { id: string } }) => ({ id: where.id, userId: `user-${where.id}` }) };
  const notifications = {
    toRole: async (role: string, n: { type?: string; title: string }) => void notices.push({ to: `role:${role}`, ...n }),
    toUsers: async (ids: string[], n: { type?: string; title: string }) => void ids.forEach((id) => notices.push({ to: id, ...n })),
    toUser: async (id: string, n: { type?: string; title: string }) => void notices.push({ to: id, ...n }),
  };
  const emitter = {
    toUser: (id: string, ev: string) => emits.push(['user', id, ev]),
    toRoles: (roles: string[], ev: string) => roles.forEach((r) => emits.push(['role', r, ev])),
  };
  const products = { getRaw: async () => null };
  const svc = new DisputesService(disputes as never, orders as never, sellers as never, notifications as never, {} as never, products as never, emitter as never);
  return { svc, emits, notices };
}

describe('DisputesService tells the sellers', () => {
  it('a return reaches every seller on the order, the warehouse and admin support', async () => {
    const { svc, emits, notices } = make();
    await svc.open({ id: 'c1', name: 'Marie' }, { orderId: 'o1', type: 'return', reason: 'Broken screen on arrival' });
    expect(notices).toContainEqual(expect.objectContaining({ to: 'role:admin_support', type: 'return', title: 'Return requested' }));
    expect(notices).toContainEqual(expect.objectContaining({ to: 'user-s1', type: 'return', title: 'Return requested on your order' }));
    expect(notices).toContainEqual(expect.objectContaining({ to: 'user-s2', type: 'return' }));
    expect(emits).toContainEqual(['user', 'user-s1', 'dispute:created']);
    expect(emits).toContainEqual(['role', 'warehouse_staff', 'dispute:created']);
  });

  it('a dispute is not sent to the warehouse', async () => {
    const { svc, emits, notices } = make();
    await svc.open({ id: 'c1', name: 'Marie' }, { orderId: 'o1', type: 'dispute', reason: 'Wrong colour was sent' });
    expect(emits.some(([, r]) => r === 'warehouse_staff')).toBe(false);
    expect(notices).toContainEqual(expect.objectContaining({ to: 'user-s1', type: 'dispute', title: 'Dispute opened on your order' }));
  });
});
