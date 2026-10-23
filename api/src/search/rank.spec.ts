import { near, score, words } from './rank';

const speaker = { id: '1', name: 'Wireless Bluetooth Speaker', nameFr: 'Enceinte Bluetooth sans fil', category: 'Electronics', categoryFr: 'Électronique', sellerName: 'Kinshasa Traders', description: '12-hour battery' };
const blender = { id: '2', name: 'Kitchen Blender 1.5L', nameFr: 'Blender de cuisine', category: 'Home & Living', sellerName: 'Kinshasa Traders', description: 'glass jar' };

describe('search ranking', () => {
  it('normalises accents and punctuation', () => {
    expect(words('Électronique Sans-fil')).toEqual(['electronique', 'sans', 'fil']);
  });
  it('one typo is tolerated', () => {
    expect(near('speaker', 'speeker')).toBe(true);
    expect(near('speaker', 'sneaker')).toBe(true);
    expect(near('speaker', 'spk')).toBe(false);
  });
  it('matches English, French, category and prefixes; every word must match', () => {
    expect(score(speaker, 'speaker')).toBeGreaterThan(0);
    expect(score(speaker, 'enceinte')).toBeGreaterThan(0);
    expect(score(speaker, 'electronique')).toBeGreaterThan(0);
    expect(score(speaker, 'blue')).toBeGreaterThan(0);
    expect(score(speaker, 'speaker blender')).toBe(0);
    expect(score(blender, 'speaker')).toBe(0);
  });
  it('a name match outranks a description match', () => {
    expect(score(blender, 'blender')).toBeGreaterThan(score({ ...speaker, description: 'works with a blender' }, 'blender'));
  });
  it('typos still find the product', () => {
    expect(score(speaker, 'bluetoth')).toBeGreaterThan(0);
  });
});
