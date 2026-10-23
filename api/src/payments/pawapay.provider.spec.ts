import { createHash, generateKeyPairSync, sign } from 'crypto';
import { InitiationUncertainError } from './mobile-money.provider';
import { PawapayClient, PawapayMobileMoneyProvider, PawapayRejectedError, PAWAPAY_PROVIDERS } from './pawapay.provider';
import { phoneIn } from '../payouts/payouts.service';

type Call = { method: string; url: string; body?: Record<string, unknown> };

/** A fake pawaPay: canned answers per "METHOD path", every request recorded. */
function fakeApi(routes: Record<string, (body?: Record<string, unknown>) => { status?: number; json: unknown } | 'down'>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ method: String(init.method), url: path, body });
    const key = Object.keys(routes).find((k) => {
      const [m, p] = k.split(' ');
      return m === init.method && (p.endsWith('*') ? path.startsWith(p.slice(0, -1)) : p === path);
    });
    const answer = key ? routes[key](body) : { status: 404, json: {} };
    if (answer === 'down') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(answer.json), { status: answer.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const client = (fetchImpl: typeof fetch, extra: Partial<ConstructorParameters<typeof PawapayClient>[0]> = {}) =>
  new PawapayClient({ token: 't0k', fetchImpl, ...extra });

describe('pawaPay client', () => {
  it('formats amounts the way pawaPay accepts them (no trailing zeros; CDF whole)', () => {
    const c = client(fakeApi({}).fetchImpl);
    expect(c.formatAmount(12.5)).toBe('12.5');
    expect(c.formatAmount(12)).toBe('12');
    expect(c.formatAmount(0.75)).toBe('0.75');
    expect(c.formatAmount(19.999)).toBe('20');
    const cdf = client(fakeApi({}).fetchImpl, { currency: 'CDF', fxRate: 2850 });
    expect(cdf.formatAmount(10)).toBe('28500');
    expect(cdf.toUsd('28500', 'CDF')).toBe(10);
    expect(() => client(fakeApi({}).fetchImpl, { currency: 'CDF' })).toThrow(/FX_RATE/);
  });

  it('turns DRC numbers into MSISDNs', () => {
    expect(PawapayClient.msisdn('+243 81 234 5678')).toBe('243812345678');
    expect(PawapayClient.msisdn('0812345678')).toBe('243812345678');
    expect(PawapayClient.msisdn('812345678')).toBe('243812345678');
    expect(PawapayClient.msisdn('00243812345678')).toBe('243812345678');
  });

  it('starts a deposit with our reference and the DRC provider code', async () => {
    const api = fakeApi({ 'POST /v2/deposits': () => ({ json: { status: 'ACCEPTED' } }) });
    const mm = new PawapayMobileMoneyProvider(client(api.fetchImpl));
    const { providerRef } = await mm.initiate({ reference: 'PAY-1', amountUsd: 23.5, phone: '+243971234567', network: 'airtel_money' });
    expect(providerRef).toMatch(/^[0-9a-f-]{36}$/);
    expect(api.calls[0].body).toMatchObject({
      depositId: providerRef,
      amount: '23.5',
      currency: 'USD',
      payer: { type: 'MMO', accountDetails: { phoneNumber: '243971234567', provider: 'AIRTEL_COD' } },
      clientReferenceId: 'PAY-1',
    });
    expect(PAWAPAY_PROVIDERS.vodacom_mpesa).toBe('VODACOM_MPESA_COD');
  });

  it('a rejected deposit fails with pawaPay\'s reason; no answer keeps it pending', async () => {
    const rejected = fakeApi({ 'POST /v2/deposits': () => ({ json: { status: 'REJECTED', failureReason: { failureCode: 'INVALID_PHONE_NUMBER', failureMessage: 'Bad number' } } }) });
    await expect(new PawapayMobileMoneyProvider(client(rejected.fetchImpl)).initiate({ reference: 'P', amountUsd: 1, phone: '1', network: 'orange_money' })).rejects.toBeInstanceOf(PawapayRejectedError);
    const down = fakeApi({ 'POST /v2/deposits': () => 'down' });
    const err = await new PawapayMobileMoneyProvider(client(down.fetchImpl)).initiate({ reference: 'P', amountUsd: 1, phone: '243971234567', network: 'orange_money' }).catch((e) => e);
    expect(err).toBeInstanceOf(InitiationUncertainError);
    expect((err as InitiationUncertainError).providerRef).toMatch(/^[0-9a-f-]{36}$/);
    const fiveHundred = fakeApi({ 'POST /v2/deposits': () => ({ status: 503, json: {} }) });
    await expect(new PawapayMobileMoneyProvider(client(fiveHundred.fetchImpl)).initiate({ reference: 'P', amountUsd: 1, phone: '243971234567', network: 'orange_money' })).rejects.toBeInstanceOf(InitiationUncertainError);
  });

  it('a retry pawaPay already has (DUPLICATE_IGNORED) counts as accepted', async () => {
    const api = fakeApi({ 'POST /v2/payouts': () => ({ json: { status: 'DUPLICATE_IGNORED' } }) });
    await expect(client(api.fetchImpl).payout({ payoutId: 'x', amountUsd: 5, phone: '0971234567', provider: 'AIRTEL_COD', reference: 'PO-1' })).resolves.toBeUndefined();
  });

  it('reads final results from the status check', async () => {
    const api = fakeApi({
      'GET /v2/deposits/*': () => ({
        json: { status: 'FOUND', data: { depositId: 'd', status: 'COMPLETED', amount: '23.5', currency: 'USD', clientReferenceId: 'PAY-1', providerTransactionId: 'TX9' } },
      }),
    });
    const mm = new PawapayMobileMoneyProvider(client(api.fetchImpl));
    await expect(mm.checkStatus({ reference: 'PAY-1', providerRef: 'd' })).resolves.toMatchObject({
      reference: 'PAY-1',
      outcome: 'succeeded',
      amountUsd: 23.5,
      providerTransactionId: 'TX9',
    });
    const processing = fakeApi({ 'GET /v2/deposits/*': () => ({ json: { status: 'FOUND', data: { status: 'PROCESSING', amount: '1', currency: 'USD' } } }) });
    await expect(new PawapayMobileMoneyProvider(client(processing.fetchImpl)).checkStatus({ reference: 'P', providerRef: 'd' })).resolves.toBeNull();
    const failed = fakeApi({ 'GET /v2/deposits/*': () => ({ json: { status: 'FOUND', data: { status: 'FAILED', amount: '1', currency: 'USD', failureReason: { failureCode: 'INSUFFICIENT_BALANCE', failureMessage: 'Not enough money' } } } }) });
    await expect(new PawapayMobileMoneyProvider(client(failed.fetchImpl)).checkStatus({ reference: 'P', providerRef: 'd' })).resolves.toMatchObject({ outcome: 'failed', reason: 'Not enough money' });
  });

  it('tells which operation a callback is about', () => {
    const id = '8917c345-4791-4285-a416-62f24b6982db';
    expect(PawapayClient.callbackTarget(Buffer.from(JSON.stringify({ depositId: id, status: 'COMPLETED' })))).toEqual({ kind: 'deposits', id });
    expect(PawapayClient.callbackTarget(Buffer.from(JSON.stringify({ refundId: id })))).toEqual({ kind: 'refunds', id });
    expect(PawapayClient.callbackTarget(Buffer.from(JSON.stringify({ data: { payoutId: id } })))).toEqual({ kind: 'payouts', id });
    expect(() => PawapayClient.callbackTarget(Buffer.from('{"depositId":"nope"}'))).toThrow();
  });

  describe('signed callbacks (RFC 9421, ecdsa-p256-sha256)', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const now = 1_792_700_000_000;
    const req = { method: 'POST', authority: 'api.somba.example', path: '/api/v1/payments/webhook/pawapay' };

    function signed(body: string, opts: { tamper?: boolean; expires?: number } = {}) {
      const digest = `sha-512=:${createHash('sha512').update(body).digest('base64')}:`;
      const created = Math.floor(now / 1000);
      const params = `("@method" "@authority" "@path" "signature-date" "content-digest" "content-type");alg="ecdsa-p256-sha256";keyid="HTTP_EC_P256_KEY:1";created=${created};expires=${opts.expires ?? created + 60}`;
      const date = new Date(now).toISOString();
      const base = [
        `"@method": POST`,
        `"@authority": ${req.authority}`,
        `"@path": ${req.path}`,
        `"signature-date": ${date}`,
        `"content-digest": ${digest}`,
        `"content-type": application/json`,
        `"@signature-params": ${params}`,
      ].join('\n');
      const sig = sign('sha256', Buffer.from(base), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64');
      return {
        raw: Buffer.from(opts.tamper ? body.replace('COMPLETED', 'FAILED') : body),
        headers: {
          'content-digest': digest,
          'content-type': 'application/json',
          'signature-date': date,
          'signature-input': `sig-pp=${params}`,
          signature: `sig-pp=:${sig}:`,
        },
      };
    }

    const keys = () => fakeApi({ 'GET /v2/public-key/http': () => ({ json: [{ id: 'HTTP_EC_P256_KEY:1', key: pem }] }) });
    const body = JSON.stringify({ depositId: '8917c345-4791-4285-a416-62f24b6982db', status: 'COMPLETED' });

    it('accepts a callback pawaPay signed', async () => {
      const c = client(keys().fetchImpl, { now: () => now });
      const { raw, headers } = signed(body);
      await expect(c.verifyCallback(raw, headers, req)).resolves.toBeUndefined();
    });

    it('refuses a changed body, a wrong path, an expired signature and a missing one', async () => {
      const c = client(keys().fetchImpl, { now: () => now });
      const t = signed(body, { tamper: true });
      await expect(c.verifyCallback(t.raw, t.headers, req)).rejects.toThrow(/Content-Digest/);
      const ok = signed(body);
      await expect(c.verifyCallback(ok.raw, ok.headers, { ...req, path: '/other' })).rejects.toThrow(/does not verify/);
      const old = signed(body, { expires: Math.floor(now / 1000) - 120 });
      await expect(c.verifyCallback(old.raw, old.headers, req)).rejects.toThrow(/expired/);
      await expect(c.verifyCallback(ok.raw, { ...ok.headers, signature: undefined }, req)).rejects.toThrow(/Signature/);
    });

    it('with signatures on, an unsigned callback is refused before any status check', async () => {
      const api = keys();
      const mm = new PawapayMobileMoneyProvider(client(api.fetchImpl, { verifySignatures: true, now: () => now }));
      await expect(mm.parseWebhook(Buffer.from(body), {}, req)).rejects.toThrow();
      expect(api.calls.some((x) => x.url.startsWith('/v2/deposits'))).toBe(false);
    });
  });
});

describe('payout phone number', () => {
  it('finds the number in what the seller typed', () => {
    expect(phoneIn('Airtel +243 97 123 4567, J. Mukendi')).toBe('+243971234567');
    expect(phoneIn('0812345678')).toBe('0812345678');
    expect(phoneIn('IBAN only')).toBeNull();
    expect(phoneIn(null)).toBeNull();
  });
});
