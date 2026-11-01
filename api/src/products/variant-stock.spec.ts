import { BadRequestException } from '@nestjs/common';
import { allLabels, availableFor, cleanVariantStock, deriveStock, planChange, poolOf, pruneEntries, sumEntries } from './variant-stock';

const groups = [
  { name: 'Size', options: ['S', 'M'] },
  { name: 'Colour', options: ['Black', 'White'] },
];
const BLACK_S = 'Size: S · Colour: Black';
const WHITE_M = 'Size: M · Colour: White';

describe('stock per option', () => {
  it('without a split, everything is the pool', () => {
    expect(availableFor(7, null, BLACK_S)).toBe(7);
    expect(poolOf(7, null)).toBe(7);
  });

  it('an option with an entry sells from it; one without sells from what the entries left over', () => {
    const entries = { [BLACK_S]: 3 };
    expect(availableFor(10, entries, BLACK_S)).toBe(3);
    expect(availableFor(10, entries, WHITE_M)).toBe(7);
    expect(sumEntries(entries)).toBe(3);
  });

  describe('planChange', () => {
    it('taking from an entry moves the entry and the total', () => {
      expect(planChange(10, { [BLACK_S]: 3 }, BLACK_S, -2)).toEqual({ ok: true, stock: 8, entries: { [BLACK_S]: 1 }, touchedEntry: true });
    });
    it('taking from the pool moves only the total', () => {
      expect(planChange(10, { [BLACK_S]: 3 }, WHITE_M, -7)).toEqual({ ok: true, stock: 3, entries: { [BLACK_S]: 3 }, touchedEntry: false });
    });
    it('refuses more than the option has and reports what is left', () => {
      expect(planChange(10, { [BLACK_S]: 3 }, BLACK_S, -4)).toEqual({ ok: false, available: 3 });
      expect(planChange(10, { [BLACK_S]: 3 }, WHITE_M, -8)).toEqual({ ok: false, available: 7 });
      expect(planChange(2, null, null, -3)).toEqual({ ok: false, available: 2 });
    });
    it('adding goes to the entry or to the pool', () => {
      expect(planChange(10, { [BLACK_S]: 3 }, BLACK_S, 5)).toMatchObject({ ok: true, stock: 15, entries: { [BLACK_S]: 8 } });
      expect(planChange(10, { [BLACK_S]: 3 }, WHITE_M, 5)).toMatchObject({ ok: true, stock: 15, entries: { [BLACK_S]: 3 } });
    });
  });

  it('lists every combination of the options', () => {
    expect(allLabels(groups)).toEqual([BLACK_S, 'Size: S · Colour: White', 'Size: M · Colour: Black', WHITE_M]);
    expect(allLabels([])).toEqual(['Default']);
  });

  describe('cleanVariantStock', () => {
    it('accepts real combinations in any case and stores the canonical label', () => {
      expect(cleanVariantStock({ 'size: s · colour: black': 4, [WHITE_M]: '2' }, groups)).toEqual({ [BLACK_S]: 4, [WHITE_M]: 2 });
    });
    it('null or empty clears the split', () => {
      expect(cleanVariantStock(null, groups)).toBeNull();
      expect(cleanVariantStock({}, groups)).toBeNull();
    });
    it('refuses unknown options, bad numbers, and a split on a product without options', () => {
      expect(() => cleanVariantStock({ 'Size: XL · Colour: Black': 1 }, groups)).toThrow(BadRequestException);
      expect(() => cleanVariantStock({ [BLACK_S]: -1 }, groups)).toThrow('whole number');
      expect(() => cleanVariantStock({ [BLACK_S]: 1.5 }, groups)).toThrow('whole number');
      expect(() => cleanVariantStock({ [BLACK_S]: '' }, groups)).toThrow('whole number');
      expect(() => cleanVariantStock({ [BLACK_S]: 1 }, [])).toThrow('Add product options');
      expect(() => cleanVariantStock([1], groups)).toThrow('not valid');
    });
    it('refuses the same option twice', () => {
      expect(() => cleanVariantStock({ [BLACK_S]: 1, 'size: s · colour: black': 2 }, groups)).toThrow('listed twice');
    });
  });

  it('prunes entries of options that no longer exist', () => {
    expect(pruneEntries({ [BLACK_S]: 3, 'Size: XL · Colour: Black': 2 }, groups)).toEqual({ [BLACK_S]: 3 });
    expect(pruneEntries({ [BLACK_S]: 3 }, [])).toBeNull();
    expect(pruneEntries(null, groups)).toBeNull();
  });

  describe('deriveStock', () => {
    it('keeps the pool on top of new entries', () => {
      expect(deriveStock({ oldStock: 10, oldEntries: { [BLACK_S]: 3 }, entries: { [BLACK_S]: 5 } })).toBe(12); // pool was 7
      expect(deriveStock({ oldStock: 10, oldEntries: null, entries: { [BLACK_S]: 4 } })).toBe(14); // pool was 10
    });
    it('an explicit total wins but must cover the entries', () => {
      expect(deriveStock({ oldStock: 10, oldEntries: null, entries: { [BLACK_S]: 4 }, explicit: 6 })).toBe(6);
      expect(() => deriveStock({ oldStock: 10, oldEntries: null, entries: { [BLACK_S]: 4 }, explicit: 3 })).toThrow('below the stock set per option');
    });
    it('clearing the split leaves the total alone', () => {
      expect(deriveStock({ oldStock: 10, oldEntries: { [BLACK_S]: 3 }, entries: null })).toBe(10);
      expect(deriveStock({ oldStock: 10, oldEntries: { [BLACK_S]: 3 }, entries: null, explicit: 4 })).toBe(4);
    });
  });
});
