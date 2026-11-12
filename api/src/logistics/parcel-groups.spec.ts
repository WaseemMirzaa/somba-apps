import { addressKeyOf, areaOf, groupHint, planFor, variantLabel } from './parcel-groups';

const base = {
  id: 'o1',
  customerId: 'c1',
  createdAt: new Date('2026-11-12T08:00:00Z'),
  shippingAddress: JSON.stringify({ line1: '12 Avenue du Commerce', commune: 'Gombe', city: 'Kinshasa', geo: { lat: -4.3031, lng: 15.3033 }, phone: '+243 1' }),
  deliveryMode: 'standard',
  destinationHubId: 'hubD',
  originBySeller: { s1: 'hubO' },
};

describe('the parcel group key', () => {
  it('is the same for two orders of one seller, customer, Kinshasa day, address, mode and hubs', () => {
    const a = planFor(base, 's1');
    const b = planFor({ ...base, id: 'o2', createdAt: new Date('2026-11-12T16:30:00Z') }, 's1');
    expect(b.groupKey).toBe(a.groupKey);
    expect(a.dayKey).toBe('2026-11-12');
  });
  it('uses the KINSHASA day: 23:30 UTC is already tomorrow there', () => {
    expect(planFor({ ...base, createdAt: new Date('2026-11-12T23:30:00Z') }, 's1').dayKey).toBe('2026-11-13');
    expect(planFor({ ...base, createdAt: new Date('2026-11-12T23:30:00Z') }, 's1').groupKey).not.toBe(planFor(base, 's1').groupKey);
  });
  it.each([
    ['another seller', () => planFor(base, 's2')],
    ['another customer', () => planFor({ ...base, customerId: 'c2' }, 's1')],
    ['another day', () => planFor({ ...base, createdAt: new Date('2026-11-14T08:00:00Z') }, 's1')],
    ['another street', () => planFor({ ...base, shippingAddress: JSON.stringify({ ...JSON.parse(base.shippingAddress), line1: '99 Boulevard 30 Juin' }) }, 's1')],
    ['another commune', () => planFor({ ...base, shippingAddress: JSON.stringify({ ...JSON.parse(base.shippingAddress), commune: 'Limete' }) }, 's1')],
    ['a pin 500 m away', () => planFor({ ...base, shippingAddress: JSON.stringify({ ...JSON.parse(base.shippingAddress), geo: { lat: -4.3081, lng: 15.3033 } }) }, 's1')],
    ['express delivery', () => planFor({ ...base, deliveryMode: 'express' }, 's1')],
    ['another destination warehouse', () => planFor({ ...base, destinationHubId: 'hubX' }, 's1')],
    ['another origin warehouse', () => planFor({ ...base, originBySeller: { s1: 'hubZ' } }, 's1')],
  ])('differs for %s', (_n, make) => {
    expect(make().groupKey).not.toBe(planFor(base, 's1').groupKey);
  });
  it('ignores case, accents, punctuation and "Av." / "avenue" and a pin a few metres off', () => {
    const a = planFor(base, 's1');
    const b = planFor({ ...base, shippingAddress: JSON.stringify({ line1: '12, AVENUE du commerce!', commune: 'gombé', city: 'KINSHASA', geo: { lat: -4.30312, lng: 15.30328 } }) }, 's1');
    expect(b.groupKey).toBe(a.groupKey);
    expect(addressKeyOf(JSON.stringify({ line1: 'N° 12 Av. du Commerce', commune: 'Gombe', city: 'Kinshasa' }))).toBe(addressKeyOf(JSON.stringify({ line1: '12 du commerce', commune: 'Gombe', city: 'Kinshasa' })));
  });
  it('never merges a multi-seller order (its key carries its own id) and free-text addresses still key', () => {
    expect(planFor(base, null).groupKey).not.toBe(planFor({ ...base, id: 'o2' }, null).groupKey);
    expect(planFor(base, null).sellerKey).toBeNull();
    expect(addressKeyOf('12 Avenue du Commerce, Gombe')).toBe(addressKeyOf('12 avenue DU commerce Gombe'));
    expect(addressKeyOf(null)).toBe('t:');
  });
  it('prints only the area (commune and city), never the street or phone', () => {
    expect(areaOf(base.shippingAddress)).toBe('Gombe, Kinshasa');
    expect(areaOf(JSON.stringify({ line1: 'x', city: 'Goma' }))).toBe('Goma');
    expect(areaOf('free text')).toBeNull();
    expect(areaOf(null)).toBeNull();
  });
  it('names a cluster with a hash that hides the address, and "Default" is no option', () => {
    const k = planFor(base, 's1').groupKey;
    expect(groupHint(k, 'secret')).toMatch(/^[0-9a-f]{16}$/);
    expect(groupHint(k, 'secret')).not.toBe(groupHint(k, 'other'));
    expect(variantLabel('Default')).toBeNull();
    expect(variantLabel(' L / Blue ')).toBe('L / Blue');
    expect(variantLabel(null)).toBeNull();
  });
});
