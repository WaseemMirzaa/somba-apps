import { assertProductionConfig } from './assert-production';

const GOOD = {
  'jwt.secret': 'a'.repeat(64),
  'jwt.refreshSecret': 'b'.repeat(64),
  dataEncryptionKey: 'c'.repeat(64),
  'db.type': 'mysql',
  'db.synchronize': false,
};
const cfg = (over: Record<string, unknown> = {}) => ({
  get: (k: string) => ({ ...GOOD, ...over })[k],
}) as never;

describe('assertProductionConfig', () => {
  const old = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = old; });

  it('is a no-op outside production', () => {
    process.env.NODE_ENV = 'development';
    expect(() => assertProductionConfig(cfg({ 'jwt.secret': 'dev-insecure-jwt-secret-change-me' }))).not.toThrow();
  });

  it('accepts a safe production config', () => {
    process.env.NODE_ENV = 'production';
    expect(() => assertProductionConfig(cfg())).not.toThrow();
  });

  it.each([
    ['default JWT secret', { 'jwt.secret': 'dev-insecure-jwt-secret-change-me' }],
    ['default refresh secret', { 'jwt.refreshSecret': 'dev-insecure-refresh-secret-change-me' }],
    ['all-zero encryption key', { dataEncryptionKey: '0'.repeat(64) }],
    ['short encryption key', { dataEncryptionKey: 'abc' }],
    ['non-hex encryption key', { dataEncryptionKey: 'z'.repeat(64) }],
    ['sqlite', { 'db.type': 'sqlite' }],
    ['synchronize on', { 'db.synchronize': true }],
  ])('refuses to boot with %s', (_name, over) => {
    process.env.NODE_ENV = 'production';
    expect(() => assertProductionConfig(cfg(over))).toThrow(/Refusing to start/);
  });
});
