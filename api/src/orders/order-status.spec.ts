import { OrdersService, nextOrderStatus } from './orders.service';

describe('nextOrderStatus', () => {
  it('allows exactly one forward step', () => {
    expect(nextOrderStatus('pending')).toBe('confirmed');
    expect(nextOrderStatus('confirmed')).toBe('processing');
    expect(nextOrderStatus('processing')).toBe('shipped');
    expect(nextOrderStatus('shipped')).toBe('out_for_delivery');
    expect(nextOrderStatus('out_for_delivery')).toBe('delivered');
    expect(nextOrderStatus('delivered')).toBe('returned');
  });

  it('cancelled and returned orders are final', () => {
    expect(nextOrderStatus('cancelled')).toBeNull();
    expect(nextOrderStatus('returned')).toBeNull();
  });
});

describe('OrdersService.updateStatus', () => {
  const make = (status: string) => {
    const order = { id: 'o1', status, paymentMethod: 'wallet', items: [] };
    const orders = { findOne: async () => order };
    const noop = { registerFanout: () => undefined, registerUserView: () => undefined, registerOrderSettledHandler: () => undefined, registerFailedHandler: () => undefined };
    return new OrdersService(orders as never, {} as never, {} as never, noop as never, {} as never, {} as never, noop as never, noop as never, {} as never, {} as never, {} as never);
  };

  it.each([
    ['pending', 'shipped'],
    ['confirmed', 'delivered'],
    ['processing', 'confirmed'],
    ['delivered', 'processing'],
    ['cancelled', 'confirmed'],
    ['returned', 'delivered'],
  ])('refuses %s -> %s', async (from, to) => {
    await expect(make(from).updateStatus('o1', to as never)).rejects.toThrow(`Cannot move an order from ${from} to ${to}.`);
  });

  it('refuses an unknown status and a hand-made cancellation', async () => {
    await expect(make('confirmed').updateStatus('o1', 'banana' as never)).rejects.toThrow(/Unknown order status/);
    await expect(make('confirmed').updateStatus('o1', 'cancelled')).rejects.toThrow(/Use cancel/);
  });
});
