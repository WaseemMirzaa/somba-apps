import { BadRequestException } from '@nestjs/common';
import { EXCHANGE_NEXT, REPLACEMENT_NEXT, assertStep, sellerForItem, sellerKeys } from './after-sale';

const sellers = (rows: { id: string; userId: string }[]) => ({
  findOne: async ({ where }: { where: { id?: string; userId?: string } }) =>
    rows.find((r) => (where.id ? r.id === where.id : r.userId === where.userId)) ?? null,
});
const products = { getRaw: async () => null };
const order = (items: { productId: string; sellerId: string | null }[]) => ({ items }) as never;

describe('after-sale helpers', () => {
  it('only allows the next sensible step', () => {
    expect(() => assertStep(REPLACEMENT_NEXT, 'requested', 'approved')).not.toThrow();
    expect(() => assertStep(REPLACEMENT_NEXT, 'requested', 'dispatched')).toThrow(BadRequestException);
    expect(() => assertStep(REPLACEMENT_NEXT, 'dispatched', 'requested')).toThrow("Can't move from dispatched to requested.");
    expect(() => assertStep(EXCHANGE_NEXT, 'received', 'ready')).not.toThrow();
    expect(() => assertStep(EXCHANGE_NEXT, 'received', 'allocated' as never)).toThrow();
  });

  it('finds the seller of the item by product id', async () => {
    const o = order([
      { productId: 'p1', sellerId: 's1' },
      { productId: 'p2', sellerId: 's2' },
    ]);
    const repo = sellers([{ id: 's2', userId: 'u2' }]);
    expect(await sellerForItem(o, 'p2', products, repo as never)).toEqual({ sellerId: 's2', userId: 'u2' });
  });

  it('falls back to the only seller, else gives up', async () => {
    const repo = sellers([{ id: 's1', userId: 'u1' }]);
    expect(await sellerForItem(order([{ productId: 'p1', sellerId: 's1' }]), 'whatever', products, repo as never)).toEqual({
      sellerId: 's1',
      userId: 'u1',
    });
    const two = order([
      { productId: 'p1', sellerId: 's1' },
      { productId: 'p2', sellerId: 's2' },
    ]);
    expect(await sellerForItem(two, 'whatever', products, repo as never)).toBeNull();
  });

  it('lists the ids a seller account can own rows under', async () => {
    expect(await sellerKeys('u1', sellers([{ id: 's1', userId: 'u1' }]) as never)).toEqual(['s1', 'u1']);
    expect(await sellerKeys('u9', sellers([]) as never)).toEqual(['u9']);
  });
});
