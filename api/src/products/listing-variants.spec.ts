import { cleanListing } from './products.service';

const base = { name: 'Shoe', price: 10, category: 'Fashion' };

describe('cleanListing variants', () => {
  it('stores normalised groups as JSON text', () => {
    const out = cleanListing({ ...base, variants: [{ name: ' Size ', options: ['40', ' 41 ', ''] }, { name: 'Colour', options: ['Black'] }] }, { partial: false, allowStatus: false });
    expect(JSON.parse(out.variants as string)).toEqual([
      { name: 'Size', options: ['40', '41'] },
      { name: 'Colour', options: ['Black'] },
    ]);
  });

  it('accepts the JSON text a client may send', () => {
    const out = cleanListing({ variants: '[{"name":"Size","options":["S","M"]}]' }, { partial: true, allowStatus: false });
    expect(JSON.parse(out.variants as string)).toEqual([{ name: 'Size', options: ['S', 'M'] }]);
  });

  it('clears the options with an empty list or null', () => {
    expect(cleanListing({ variants: [] }, { partial: true, allowStatus: false }).variants).toBeNull();
    expect(cleanListing({ variants: null }, { partial: true, allowStatus: false }).variants).toBeNull();
  });

  it('leaves them alone when not sent', () => {
    expect('variants' in cleanListing({ name: 'x' }, { partial: true, allowStatus: false })).toBe(false);
  });

  it('refuses invalid options with a readable message', () => {
    expect(() => cleanListing({ ...base, variants: [{ name: 'Size', options: [] }] }, { partial: false, allowStatus: false })).toThrow(/at least one value/);
    expect(() => cleanListing({ ...base, variants: 'nope' }, { partial: false, allowStatus: false })).toThrow(/not valid/);
    expect(() => cleanListing({ ...base, variants: [{ name: 'A', options: ['1'] }, { name: 'B', options: ['1'] }, { name: 'C', options: ['1'] }] }, { partial: false, allowStatus: false })).toThrow(/At most 2/);
  });
});

describe('cleanListing delivery time', () => {
  it('takes the seller\'s delivery time in whole days from 1 to 30', () => {
    expect(cleanListing({ ...base, deliveryDays: 4 }, { partial: false, allowStatus: false }).deliveryDays).toBe(4);
    expect(cleanListing({ deliveryDays: '2' }, { partial: true, allowStatus: false }).deliveryDays).toBe(2);
    expect(cleanListing({ name: 'x' }, { partial: true, allowStatus: false })).not.toHaveProperty('deliveryDays');
  });

  it('refuses 0, more than 30 and fractions', () => {
    for (const bad of [0, 31, 2.5, 'soon']) {
      expect(() => cleanListing({ ...base, deliveryDays: bad }, { partial: false, allowStatus: false })).toThrow(/Delivery time/);
    }
  });
});
