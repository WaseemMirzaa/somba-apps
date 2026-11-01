import { OrdersService } from './orders.service';

// A multi-seller order: each seller's package has its own status, derived from THEIR lines.
describe('seller package status', () => {
  const lines = (...f: ('open' | 'ready' | 'received' | 'cancelled')[]) => f.map((fulfilment) => ({ fulfilment }));
  const paid = { status: 'confirmed' as const, paymentMethod: 'wallet' as const };

  it('follows the slowest of the seller lines', () => {
    expect(OrdersService.packageStatus(paid, lines('open', 'ready'))).toBe('to_pack');
    expect(OrdersService.packageStatus(paid, lines('ready', 'ready'))).toBe('ready');
    expect(OrdersService.packageStatus(paid, lines('received', 'cancelled'))).toBe('at_hub');
  });

  it('a package whose lines were all cancelled is cancelled, whatever the order does', () => {
    expect(OrdersService.packageStatus(paid, lines('cancelled', 'cancelled'))).toBe('cancelled');
  });

  it("'shipped' means every parcel is at a warehouse: the package is still at the hub until the delivery rider is on the road", () => {
    expect(OrdersService.packageStatus({ ...paid, status: 'shipped' }, lines('received'))).toBe('at_hub');
  });

  it('after the hub, the package follows the last-mile delivery', () => {
    expect(OrdersService.packageStatus({ ...paid, status: 'out_for_delivery' }, lines('received'))).toBe('out_for_delivery');
    expect(OrdersService.packageStatus({ ...paid, status: 'delivered' }, lines('received'))).toBe('delivered');
  });

  it('an unpaid order is not packed yet, but cash on delivery is', () => {
    expect(OrdersService.packageStatus({ status: 'pending', paymentMethod: 'airtel_money' }, lines('open'))).toBe('pending');
    expect(OrdersService.packageStatus({ status: 'pending', paymentMethod: 'cod' }, lines('open'))).toBe('to_pack');
    expect(OrdersService.fulfillable({ status: 'pending', paymentMethod: 'cod' })).toBe(true);
    expect(OrdersService.fulfillable({ status: 'pending', paymentMethod: 'orange_money' })).toBe(false);
    expect(OrdersService.fulfillable({ status: 'shipped', paymentMethod: 'wallet' })).toBe(false);
  });
});
