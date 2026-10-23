import { BadRequestException } from '@nestjs/common';
import { cleanLines } from './cart.service';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('cart lines', () => {
  it('merges duplicates (same product + variant) and clamps quantities', () => {
    expect(
      cleanLines(
        [
          { productId: A, qty: 2, priceWhenAdded: 10 },
          { productId: A, variant: 'Default', qty: 3 },
          { productId: A, variant: 'Size: 42', qty: 500 },
          { productId: B, qty: 0 },
        ],
        'Cart',
      ),
    ).toEqual([
      { productId: A, variant: 'Default', qty: 5, priceWhenAdded: 10 },
      { productId: A, variant: 'Size: 42', qty: 99, priceWhenAdded: null },
      { productId: B, variant: 'Default', qty: 1, priceWhenAdded: null },
    ]);
  });
  it('drops garbage ids instead of failing the whole cart', () => {
    expect(cleanLines([{ productId: "x'; drop table", qty: 1 }, { productId: A, qty: 1 }], 'Cart')).toHaveLength(1);
  });
  it('refuses non-lists and oversized carts', () => {
    expect(() => cleanLines('nope', 'Cart')).toThrow(BadRequestException);
    expect(() => cleanLines(Array.from({ length: 101 }, () => ({ productId: A, qty: 1 })), 'Cart')).toThrow('At most 100');
    expect(cleanLines(undefined, 'Cart')).toEqual([]);
  });
});
