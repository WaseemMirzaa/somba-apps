import { cargoMatches, scanEveryParcel, scanRequired } from './parcel-rules';

const task = (over: Record<string, unknown>) => ({ kind: 'pickup', sellerId: null, sellerIds: null, disputeId: null, replacementId: null, exchangeId: null, ...over }) as never;
const parcel = (sellerId: string | null, returnId: string | null = null) => ({ sellerId, returnId });

describe('what a leg carries', () => {
  it('a pickup, an express leg and a transfer carry their seller package', () => {
    for (const kind of ['pickup', 'express', 'transfer']) {
      expect(cargoMatches(task({ kind, sellerId: 's1' }), parcel('s1'))).toBe(true);
      expect(cargoMatches(task({ kind, sellerId: 's1' }), parcel('s2'))).toBe(false);
    }
  });
  it('a delivery carries the parcels of its sellers; a legacy delivery (no sellers) carries every seller parcel', () => {
    expect(cargoMatches(task({ kind: 'delivery', sellerIds: ['s1', 's3'] }), parcel('s3'))).toBe(true);
    expect(cargoMatches(task({ kind: 'delivery', sellerIds: ['s1'] }), parcel('s2'))).toBe(false);
    expect(cargoMatches(task({ kind: 'delivery', sellerIds: null }), parcel('s2'))).toBe(true);
  });
  it('a return leg carries the return parcel and nothing else; an order leg never carries a return parcel', () => {
    for (const kind of ['return_pickup', 'return_transfer', 'return_to_seller']) {
      expect(cargoMatches(task({ kind, disputeId: 'd1', sellerId: 's1' }), parcel(null, 'd1'))).toBe(true);
      expect(cargoMatches(task({ kind, disputeId: 'd1' }), parcel(null, 'd2'))).toBe(false);
      expect(cargoMatches(task({ kind, disputeId: 'd1' }), parcel('s1'))).toBe(false);
    }
    expect(cargoMatches(task({ kind: 'delivery', sellerIds: null }), parcel(null, 'd1'))).toBe(false);
  });
  it('a replacement or exchange leg carries no labelled parcel', () => {
    expect(cargoMatches(task({ kind: 'pickup', sellerId: 's1', replacementId: 'r1' }), parcel('s1'))).toBe(false);
    expect(cargoMatches(task({ kind: 'replacement_delivery' }), parcel('s1'))).toBe(false);
  });
});

describe('the rule setting', () => {
  it('is on unless it is the text "false"', () => {
    expect(scanRequired(null)).toBe(true);
    expect(scanRequired('true')).toBe(true);
    expect(scanRequired('false')).toBe(false);
  });
  it('words the refusal with the numbers', () => {
    expect(scanEveryParcel(2, 3)).toBe('Scan every parcel first: 2 of 3 scanned.');
  });
});
