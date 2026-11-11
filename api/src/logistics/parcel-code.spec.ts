import { MAX_BOXES, PARCEL_CODE_ALPHABET, cleanBoxCount, normalizeParcelCode, randomParcelCode, uniqueParcelCode } from './parcel-code';

describe('parcel codes', () => {
  it('are PKG- plus 8 characters of an alphabet without 0, O, 1 and I', () => {
    expect(PARCEL_CODE_ALPHABET).not.toMatch(/[01OI]/);
    for (let i = 0; i < 500; i++) expect(randomParcelCode()).toMatch(/^PKG-[2-9A-HJ-NP-Z]{8}$/);
  });

  it('are random: 1000 codes are all different', () => {
    expect(new Set(Array.from({ length: 1000 }, () => randomParcelCode())).size).toBe(1000);
  });

  it('are collision checked: a taken code is skipped, and an exhausted generator fails loudly', async () => {
    const seq = ['PKG-AAAAAAAA', 'PKG-AAAAAAAA', 'PKG-BBBBBBBB'];
    const taken = new Set(['PKG-AAAAAAAA']);
    expect(await uniqueParcelCode(async (c) => taken.has(c), () => seq.shift() as string)).toBe('PKG-BBBBBBBB');
    await expect(uniqueParcelCode(async () => true, randomParcelCode, 3)).rejects.toThrow(/unique parcel code/);
  });

  it('are read from what a camera or a keyboard gives: case, spaces and a missing dash do not matter', () => {
    expect(normalizeParcelCode(' pkg-7kq2m9xa ')).toBe('PKG-7KQ2M9XA');
    expect(normalizeParcelCode('PKG7KQ2M9XA')).toBe('PKG-7KQ2M9XA');
    expect(normalizeParcelCode('PKG-7KQ2M9X')).toBeNull(); // 7 characters
    expect(normalizeParcelCode('PKG-0KQ2M9XA')).toBeNull(); // a zero is not in the alphabet
    expect(normalizeParcelCode('PKG-A1B2C3')).toBeNull(); // the old per-leg code is not a parcel code
    expect(normalizeParcelCode('')).toBeNull();
    expect(normalizeParcelCode(undefined)).toBeNull();
  });
});

describe('box count', () => {
  it('defaults to 1 and accepts 1 to 20', () => {
    expect(cleanBoxCount(undefined)).toBe(1);
    expect(cleanBoxCount('')).toBe(1);
    expect(cleanBoxCount(3)).toBe(3);
    expect(cleanBoxCount(MAX_BOXES)).toBe(20);
  });
  it('refuses 0, 21, fractions and text', () => {
    for (const bad of [0, 21, 1.5, 'two', -1]) expect(() => cleanBoxCount(bad)).toThrow(/1 to 20/);
  });
});
