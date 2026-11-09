import { RealtimeGateway } from './realtime.gateway';

/**
 * A-04 at the socket: `orders:cancel` is the customer's own path (the service decides ownership and never takes the
 * operator branch from it); staff cancel through `orders:adminCancel` / `orders:updateStatus`, refund through
 * `orders:refund`, and every staff cancel or refund leaves an audit entry. Built without the constructor, like
 * `admin-audit.spec.ts`.
 */
describe('order cancel and refund at the gateway', () => {
  let audit: { record: jest.Mock };
  let orders: { cancel: jest.Mock; adminCancel: jest.Mock; updateStatus: jest.Mock; refund: jest.Mock };
  let gw: RealtimeGateway;
  const as = (role: string, id = `${role}-1`) => ({ data: { user: { id, role, name: `${role} name` } } }) as never;
  const order = { id: 'o1', reference: 'SOM-1', status: 'cancelled' };

  beforeEach(() => {
    audit = { record: jest.fn(async () => undefined) };
    orders = {
      cancel: jest.fn(async () => order),
      adminCancel: jest.fn(async () => order),
      updateStatus: jest.fn(async () => ({ ...order, status: 'processing' })),
      refund: jest.fn(async () => ({ orderReference: 'SOM-1', refund: { amountUsd: 25, refundTo: 'wallet' } })),
    };
    gw = Object.assign(Object.create(RealtimeGateway.prototype), { audit, orders });
  });

  it('orders:cancel never asks for the operator path, whatever the caller’s role', async () => {
    for (const role of ['customer', 'admin', 'admin_operations', 'admin_marketing', 'admin_support', 'admin_finance', 'admin_moderation']) {
      await gw.ordersCancel(as(role), { orderId: 'o1' });
    }
    for (const call of orders.cancel.mock.calls) expect(call[2]).toBeUndefined();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each(['admin_marketing', 'admin_support', 'admin_finance', 'admin_moderation', 'warehouse_staff', 'customer'])(
    '%s cannot cancel through the operator events',
    async (role) => {
      expect(await gw.ordersAdminCancel(as(role), { orderId: 'o1', reason: 'Because' })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.ordersUpdateStatus(as(role), { orderId: 'o1', status: 'cancelled' })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(orders.cancel).not.toHaveBeenCalled();
      expect(orders.adminCancel).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    },
  );

  it('an operator cancel by reason is audited', async () => {
    expect(await gw.ordersAdminCancel(as('admin_operations'), { orderId: 'o1', reason: 'Customer called' })).toMatchObject({ ok: true });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'order.cancelled', role: 'admin_operations', entity: 'order', entityId: 'o1' }));
  });

  it('a cancel through orders:updateStatus takes the operator path and is audited too', async () => {
    expect(await gw.ordersUpdateStatus(as('admin'), { orderId: 'o1', status: 'cancelled' })).toMatchObject({ ok: true });
    expect(orders.cancel).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }), 'o1', { asOperator: true });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'order.cancelled', role: 'admin', entity: 'order', entityId: 'o1' }));
  });

  it('refunds are finance (and the super admin) only, and audited', async () => {
    for (const role of ['admin_operations', 'admin_support', 'admin_marketing', 'admin_moderation', 'customer']) {
      expect(await gw.ordersRefund(as(role), { orderId: 'o1' })).toEqual({ ok: false, error: 'Only admin/finance can issue refunds.' });
    }
    expect(orders.refund).not.toHaveBeenCalled();
    for (const role of ['admin_finance', 'admin']) expect(await gw.ordersRefund(as(role), { orderId: 'o1' })).toMatchObject({ ok: true });
    expect(audit.record.mock.calls.map(([e]) => `${e.action}|${e.role}|${e.entityId}`)).toEqual(['orders:refund|admin_finance|o1', 'orders:refund|admin|o1']);
  });
});
