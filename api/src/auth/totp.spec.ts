import {
  base32Decode,
  base32Encode,
  hashRecovery,
  hotp,
  looksLikeRecovery,
  newRecoveryCodes,
  newTotpSecret,
  normalizeRecovery,
  otpauthUrl,
  totpCode,
  totpStep,
  verifyTotp,
} from './totp';

/** RFC 6238 appendix B: SHA-1, secret "12345678901234567890"; the RFC shows 8 digits, we use the last 6. */
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));
const VECTORS: [seconds: number, code: string][] = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
];

describe('TOTP (RFC 6238)', () => {
  it.each(VECTORS)('matches the RFC test vector at t=%i', (seconds, code) => {
    expect(totpCode(RFC_SECRET, seconds * 1000)).toBe(code);
  });

  it('HOTP matches the RFC 4226 vectors', () => {
    const key = Buffer.from('12345678901234567890');
    expect(['755224', '287082', '359152', '969429', '338314'].map((_, i) => hotp(key, i))).toEqual(['755224', '287082', '359152', '969429', '338314']);
  });

  it('base32 round-trips and tolerates spaces, dashes and lowercase', () => {
    const buf = Buffer.from([1, 2, 3, 250, 251, 252, 0, 99]);
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
    expect(base32Decode('gezd gnbv-GY3TQOJQ')).toEqual(Buffer.from('1234567890'));
    expect(() => base32Decode('not*base32')).toThrow();
  });

  it('makes a 160-bit secret in base32 (32 characters)', () => {
    const s = newTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(newTotpSecret()).not.toBe(s);
  });

  describe('verifyTotp', () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    it('accepts the current code and returns its step', () => {
      expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now), { nowMs: now })).toBe(step);
    });
    it('accepts one step either side (a phone clock a few seconds off) but not two', () => {
      expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 30_000), { nowMs: now })).toBe(step - 1);
      expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now + 30_000), { nowMs: now })).toBe(step + 1);
      expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 90_000), { nowMs: now })).toBeNull();
      expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now + 90_000), { nowMs: now })).toBeNull();
    });
    it('refuses a step that was already used (replay) but accepts a later one', () => {
      const code = totpCode(RFC_SECRET, now);
      expect(verifyTotp(RFC_SECRET, code, { nowMs: now, lastStep: step })).toBeNull();
      expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now + 30_000), { nowMs: now, lastStep: step })).toBe(step + 1);
    });
    it('refuses wrong, short, long and non-numeric codes; ignores spaces', () => {
      const code = totpCode(RFC_SECRET, now);
      const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
      expect(verifyTotp(RFC_SECRET, wrong, { nowMs: now })).toBeNull();
      expect(verifyTotp(RFC_SECRET, code.slice(0, 5), { nowMs: now })).toBeNull();
      expect(verifyTotp(RFC_SECRET, `${code}0`, { nowMs: now })).toBeNull();
      expect(verifyTotp(RFC_SECRET, 'abcdef', { nowMs: now })).toBeNull();
      expect(verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, { nowMs: now })).toBe(step);
    });
    it('a code of another secret does not verify', () => {
      expect(verifyTotp(newTotpSecret(), totpCode(RFC_SECRET, now), { nowMs: now })).toBeNull();
    });
  });

  it('builds the otpauth link authenticator apps read', () => {
    const url = new URL(otpauthUrl('ABCDEFGH', 'amina@example.com'));
    expect(url.protocol).toBe('otpauth:');
    expect(url.host).toBe('totp');
    expect(decodeURIComponent(url.pathname)).toBe('/Somba&Teka:amina@example.com');
    expect(url.searchParams.get('secret')).toBe('ABCDEFGH');
    expect(url.searchParams.get('digits')).toBe('6');
    expect(url.searchParams.get('period')).toBe('30');
    expect(url.searchParams.get('algorithm')).toBe('SHA1');
  });

  describe('recovery codes', () => {
    it('makes ten xxxx-xxxx codes without look-alike characters, all different', () => {
      const codes = newRecoveryCodes();
      expect(codes).toHaveLength(10);
      expect(new Set(codes).size).toBe(10);
      for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    });
    it('hashes case- and dash-insensitively, and never stores the code itself', () => {
      expect(hashRecovery('abcd-efgh')).toBe(hashRecovery('ABCDEFGH'));
      expect(hashRecovery('ABCD-EFGH')).not.toContain('ABCD');
      expect(normalizeRecovery(' ab-cd ef ')).toBe('ABCDEF');
    });
    it('tells a recovery code from a 6-digit code', () => {
      expect(looksLikeRecovery('ABCD-EFGH')).toBe(true);
      expect(looksLikeRecovery('abcdefgh')).toBe(true);
      expect(looksLikeRecovery('123456')).toBe(false);
      expect(looksLikeRecovery('123 456')).toBe(false);
      expect(looksLikeRecovery('12345678')).toBe(true);
    });
  });
});
