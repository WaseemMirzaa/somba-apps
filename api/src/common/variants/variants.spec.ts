import { BadRequestException } from '@nestjs/common';
import { checkVariant, parseVariantGroups, storedVariantGroups } from './variants';

const GROUPS = [
  { name: 'Size', options: ['39', '40', '42'] },
  { name: 'Colour', options: ['Black', 'White'] },
];

describe('product variants', () => {
  it('normalises seller input (JSON string or array, whitespace, empty rows)', () => {
    expect(parseVariantGroups(JSON.stringify([{ name: ' Size ', options: [' 39', '40 '] }, { name: '', options: [] }]))).toEqual([{ name: 'Size', options: ['39', '40'] }]);
    expect(parseVariantGroups(null)).toEqual([]);
  });
  it.each([
    [[{ name: 'A', options: ['1'] }, { name: 'B', options: ['1'] }, { name: 'C', options: ['1'] }], 'At most 2'],
    [[{ name: 'Size', options: [] }], 'at least one value'],
    [[{ name: '', options: ['x'] }], 'name'],
    [[{ name: 'Size', options: ['40', '40'] }], 'same value twice'],
    [[{ name: 'Size', options: ['40'] }, { name: 'size', options: ['41'] }], 'listed twice'],
    [[{ name: 'Size: EU', options: ['40'] }], '":"'],
    ['not json', 'not valid'],
  ])('rejects %j', (input, msg) => {
    expect(() => parseVariantGroups(input)).toThrow(msg);
  });
  it('a broken stored value reads as no options', () => {
    expect(storedVariantGroups('{oops')).toEqual([]);
  });
  it('accepts a complete choice and returns the canonical label', () => {
    expect(checkVariant(GROUPS, 'colour: black · size: 42', 'Shoe')).toBe('Size: 42 · Colour: Black');
  });
  it('refuses a missing or unknown choice with a readable message', () => {
    expect(() => checkVariant(GROUPS, 'Size: 42', 'Shoe')).toThrow('Choose a colour for "Shoe".');
    expect(() => checkVariant(GROUPS, 'Size: 50 · Colour: Black', 'Shoe')).toThrow(BadRequestException);
    expect(() => checkVariant(GROUPS, 'Default', 'Shoe')).toThrow('Choose a size');
  });
  it('products without options always use "Default"', () => {
    expect(checkVariant([], 'Size: 42', 'Mug')).toBe('Default');
  });
});
