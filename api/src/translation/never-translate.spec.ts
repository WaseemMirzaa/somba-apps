import { shouldTranslate } from './never-translate';

describe('shouldTranslate (what is never sent to a translator)', () => {
  it.each(['', '   ', '123', '12.5', '—', '$$', '2026-10-24', '+243 81 234 5678', '0812345678'])('copies text with no letters: %j', (t) => {
    expect(shouldTranslate(t)).toBe(false);
  });

  it.each(['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'xl', 'EU 42', 'US 9', 'UK 8', 'EU42', 'One size'])('copies sizes: %s', (t) => {
    expect(shouldTranslate(t)).toBe(false);
  });

  it.each(['128GB', '128 GB', '5000 mAh', '25 W', '1.5L', '20cm', '1TB', '60Hz', 'A15', 'XM5', 'S24', 'RTX4090', 'iPhone 15', 'Galaxy S24'])('copies codes and model names: %s', (t) => {
    expect(shouldTranslate(t)).toBe(false);
  });

  it.each(['shop@example.com', 'https://somba.example/x', 'www.example.com'])('copies emails and links: %s', (t) => {
    expect(shouldTranslate(t)).toBe(false);
  });

  it.each(['Black', 'White', 'Colour', 'Size', 'Wireless Earbuds', 'Noise reduction and 24 hours of battery.', 'Chaussures de sport', 'Leather wallet 2 pockets', 'Free delivery over $50'])(
    'translates words and sentences: %s',
    (t) => {
      expect(shouldTranslate(t)).toBe(true);
    },
  );

  it('copes with null and undefined', () => {
    expect(shouldTranslate(null)).toBe(false);
    expect(shouldTranslate(undefined)).toBe(false);
  });
});
