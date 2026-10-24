import { cleanListing } from './products.service';

const base = { name: 'Shoe', price: 10, category: 'Fashion' };
const create = { partial: false, allowStatus: false };
const patch = { partial: true, allowStatus: false };

describe('cleanListing variants', () => {
  it('keeps normalised option groups', () => {
    const out = cleanListing({ ...base, variants: [{ name: ' Size ', options: ['40', ' 41 ', ''] }, { name: 'Colour', options: ['Black'] }] }, create);
    expect(out.text.variants).toEqual([
      { name: 'Size', options: ['40', '41'] },
      { name: 'Colour', options: ['Black'] },
    ]);
  });

  it('accepts the JSON text a client may send', () => {
    expect(cleanListing({ variants: '[{"name":"Size","options":["S","M"]}]' }, patch).text.variants).toEqual([{ name: 'Size', options: ['S', 'M'] }]);
  });

  it('clears the options with an empty list or null', () => {
    expect(cleanListing({ variants: [] }, patch).text.variants).toEqual([]);
    expect(cleanListing({ variants: null }, patch).text.variants).toEqual([]);
  });

  it('leaves them alone when not sent', () => {
    expect(cleanListing({ name: 'x' }, patch).text.variants).toBeUndefined();
  });

  it('refuses invalid options with a readable message', () => {
    expect(() => cleanListing({ ...base, variants: [{ name: 'Size', options: [] }] }, create)).toThrow(/at least one value/);
    expect(() => cleanListing({ ...base, variants: 'nope' }, create)).toThrow(/not valid/);
    expect(() => cleanListing({ ...base, variants: [{ name: 'A', options: ['1'] }, { name: 'B', options: ['1'] }, { name: 'C', options: ['1'] }] }, create)).toThrow(/At most 2/);
  });

  it('keeps display labels in the shape of the options, and silently drops unreadable ones (C-I4)', () => {
    const out = cleanListing({ ...base, variants: [{ name: 'Colour', options: ['Black'] }], variantLabels: { fr: [{ name: 'Couleur', options: ['Noir'] }], en: 'garbage' } }, create);
    expect(out.text.variantLabels).toEqual({ fr: [{ name: 'Couleur', options: ['Noir'] }] });
  });
});

describe('cleanListing delivery time', () => {
  it('takes the seller\'s delivery time in whole days from 1 to 30', () => {
    expect(cleanListing({ ...base, deliveryDays: 4 }, create).columns.deliveryDays).toBe(4);
    expect(cleanListing({ deliveryDays: '2' }, patch).columns.deliveryDays).toBe(2);
    expect(cleanListing({ name: 'x' }, patch).columns).not.toHaveProperty('deliveryDays');
  });

  it('refuses 0, more than 30 and fractions', () => {
    for (const bad of [0, 31, 2.5, 'soon']) {
      expect(() => cleanListing({ ...base, deliveryDays: bad }, create)).toThrow(/Delivery time/);
    }
  });
});

describe('cleanListing words and category', () => {
  it('reads English and French words; blank means cleared, absent means untouched', () => {
    const out = cleanListing({ name: ' Phone ', nameFr: '', description: undefined, descriptionFr: '   ' }, patch);
    expect(out.text).toMatchObject({ name: 'Phone', nameFr: null, descriptionFr: null });
    expect(out.text.description).toBeUndefined();
  });

  it('takes the category by id, or by name in either language', () => {
    expect(cleanListing({ ...base, categoryId: ' c1 ' }, create).category).toEqual({ id: 'c1', name: 'Fashion' });
    expect(cleanListing({ name: 'x' }, patch).category).toBeUndefined();
  });

  it('only accepts en or fr as the source language', () => {
    expect(cleanListing({ ...base, sourceLang: 'fr' }, create).text.sourceLang).toBe('fr');
    expect(cleanListing({ ...base, sourceLang: 'de' }, create).text.sourceLang).toBeUndefined();
  });
});
