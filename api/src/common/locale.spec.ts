import { asLocale, callerLocale } from './locale';

const users = (row: { locale?: string } | null, boom = false) => ({
  findOne: async () => {
    if (boom) throw new Error('db down');
    return row;
  },
}) as never;

describe('callerLocale', () => {
  it('knows en and fr only', () => {
    expect(asLocale('fr')).toBe('fr');
    expect(asLocale('en')).toBe('en');
    for (const v of ['de', 'FR', '', null, undefined, 3]) expect(asLocale(v)).toBeNull();
  });

  it('a language named in the request wins, else the saved language, else English', async () => {
    expect(await callerLocale(users({ locale: 'fr' }), 'u1', 'en')).toBe('en');
    expect(await callerLocale(users({ locale: 'en' }), 'u1', 'fr')).toBe('fr');
    expect(await callerLocale(users({ locale: 'fr' }), 'u1')).toBe('fr');
    expect(await callerLocale(users({ locale: 'fr' }), 'u1', 'klingon')).toBe('fr');
    expect(await callerLocale(users({ locale: 'xx' }), 'u1')).toBe('en');
    expect(await callerLocale(users(null), 'u1')).toBe('en');
    expect(await callerLocale(users({ locale: 'fr' }), undefined)).toBe('en');
  });

  it('never throws', async () => {
    expect(await callerLocale(users(null, true), 'u1')).toBe('en');
  });
});
