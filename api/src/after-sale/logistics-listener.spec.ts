import { AfterSaleLogisticsListener } from './logistics-listener';

function make() {
  const calls: string[] = [];
  let registered: ((e: unknown) => unknown) | null = null;
  const logistics = { registerListener: (fn: (e: unknown) => unknown) => void (registered = fn) };
  const disputes = {
    onReturnReceived: jest.fn(async (id: string) => {
      calls.push(`received:${id}`);
      if (id === 'already') throw new Error('These goods were already marked as received.');
    }),
  };
  const replacements = { syncFromDelivery: jest.fn(async (id: string, s: string) => void calls.push(`rep:${id}:${s}`)) };
  const exchanges = { syncFromDelivery: jest.fn(async (id: string, s: string) => void calls.push(`exc:${id}:${s}`)) };
  const l = new AfterSaleLogisticsListener(logistics as never, disputes as never, replacements as never, exchanges as never);
  l.onModuleInit();
  const fire = (type: string, task: object) => registered!({ type, task });
  return { calls, fire, disputes };
}

describe('AfterSaleLogisticsListener', () => {
  it('registers itself with logistics', () => {
    const { fire } = make();
    expect(fire).toBeDefined();
  });

  it('the return pickup scanned in (or delivered) receives the return', async () => {
    const { calls, fire } = make();
    await fire('scanned_in', { kind: 'return_pickup', disputeId: 'd1' });
    await fire('delivered', { kind: 'return_pickup', disputeId: 'd2' });
    await fire('picked_up', { kind: 'return_pickup', disputeId: 'd3' });
    expect(calls).toEqual(['received:d1', 'received:d2']);
  });

  it('later return legs and legs of other flows are ignored', async () => {
    const { calls, fire } = make();
    await fire('scanned_in', { kind: 'return_transfer', disputeId: 'd1' });
    await fire('delivered', { kind: 'return_to_seller', disputeId: 'd1' });
    await fire('delivered', { kind: 'delivery', orderId: 'o1' });
    await fire('scanned_in', { kind: 'pickup', replacementId: 'r1' });
    expect(calls).toEqual([]);
  });

  it('the last leg of a replacement or exchange moves it: picked up, in transit, delivered', async () => {
    const { calls, fire } = make();
    await fire('picked_up', { kind: 'replacement_delivery', replacementId: 'r1' });
    await fire('in_transit', { kind: 'replacement_delivery', exchangeId: 'e1' });
    await fire('delivered', { kind: 'replacement_delivery', replacementId: 'r1' });
    await fire('failed', { kind: 'replacement_delivery', replacementId: 'r1' });
    expect(calls).toEqual(['rep:r1:picked_up', 'exc:e1:in_transit', 'rep:r1:delivered']);
  });

  it('an error (goods already received) never escapes the listener', async () => {
    const { fire } = make();
    await expect(fire('scanned_in', { kind: 'return_pickup', disputeId: 'already' })).resolves.toBeUndefined();
  });
});
