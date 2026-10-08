import { createHmac } from 'crypto';
import {
  SandboxMobileMoneyProvider,
  createMobileMoneyProvider,
  isMobileMoney,
} from './mobile-money.provider';

const sign = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest('hex');

describe('SandboxMobileMoneyProvider webhook', () => {
  const p = new SandboxMobileMoneyProvider('s3cret');
  const body = JSON.stringify({ reference: 'PAY-1', status: 'succeeded', providerRef: 'x', amountUsd: 12.5 });

  it('accepts a correctly signed body', () => {
    const ev = p.parseWebhook(Buffer.from(body), { 'x-sandbox-signature': sign('s3cret', body) });
    expect(ev).toMatchObject({ reference: 'PAY-1', outcome: 'succeeded', amountUsd: 12.5 });
  });
  it('rejects a wrong, missing or length-mismatched signature', () => {
    expect(() => p.parseWebhook(Buffer.from(body), { 'x-sandbox-signature': sign('other', body) })).toThrow();
    expect(() => p.parseWebhook(Buffer.from(body), {})).toThrow();
    expect(() => p.parseWebhook(Buffer.from(body), { 'x-sandbox-signature': 'abc' })).toThrow();
  });
  it('rejects a body tampered after signing', () => {
    const sig = sign('s3cret', body);
    expect(() => p.parseWebhook(Buffer.from(body.replace('12.5', '0.01')), { 'x-sandbox-signature': sig })).toThrow();
  });
  it('treats anything but "succeeded" as failed', () => {
    const b = JSON.stringify({ reference: 'PAY-2', status: 'pending' });
    expect(p.parseWebhook(Buffer.from(b), { 'x-sandbox-signature': sign('s3cret', b) }).outcome).toBe('failed');
  });
});

describe('createMobileMoneyProvider', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it('defaults to the sandbox outside production', () => {
    delete process.env.MM_PROVIDER; process.env.NODE_ENV = 'development';
    expect(createMobileMoneyProvider()?.name).toBe('sandbox');
  });
  it('fails closed in production (no provider)', () => {
    delete process.env.MM_PROVIDER; process.env.NODE_ENV = 'production';
    expect(createMobileMoneyProvider()).toBeNull();
  });
  it('refuses the sandbox in production', () => {
    process.env.MM_PROVIDER = 'sandbox'; process.env.NODE_ENV = 'production';
    expect(() => createMobileMoneyProvider()).toThrow(/not allowed in production/);
  });
  it('knows the three mobile-money networks', () => {
    expect(['airtel_money', 'orange_money', 'vodacom_mpesa'].every(isMobileMoney)).toBe(true);
    expect(isMobileMoney('wallet')).toBe(false);
  });
});
