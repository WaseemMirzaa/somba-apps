import { normalizePhone, phoneHash } from './phone-hash';

describe('phone hash', () => {
  it('normalises the usual ways of writing a DRC number to one value', () => {
    for (const v of ['+243 81 234 5678', '00243812345678', '0812345678', '+243-812-345-678', '(+243) 812 345 678']) {
      expect(normalizePhone(v)).toBe('243812345678');
    }
    expect(new Set(['+243 81 234 5678', '0812345678'].map(phoneHash)).size).toBe(1);
  });
  it('keeps other international numbers as digits', () => {
    expect(normalizePhone('+33 6 12 34 56 78')).toBe('33612345678');
  });
  it('rejects junk', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
    expect(phoneHash(null)).toBeNull();
  });
});
