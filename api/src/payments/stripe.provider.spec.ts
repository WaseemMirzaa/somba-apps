import Stripe from 'stripe';
import { cardPaymentsMode, readStripeConfig, scrubSecrets } from './stripe.config';
import { GOOD_ENV, PK, RK, SK, STRIPE_CFG, WHSEC } from '../testing/stripe-fake';
import { StripeRejectedError, StripeSdkClient, StripeUnavailableError, createStripeClient } from './stripe.provider';

const cfg = STRIPE_CFG;

const secretsIn = (text: string) => [SK, RK, PK, WHSEC, 'sk_' + 'live_', 'FAKEsecretKEY', 'FAKEwebhookSECRET'].filter((s) => text.includes(s));

describe('Stripe configuration', () => {
  it('is on only when all three values are present, well formed and in the same mode', () => {
    expect(readStripeConfig(GOOD_ENV)).toEqual({ ok: true, config: { secretKey: SK, publishableKey: PK, webhookSecret: WHSEC, mode: 'test' } });
    expect(readStripeConfig({ ...GOOD_ENV, STRIPE_SECRET_KEY: RK })).toMatchObject({ ok: true }); // a restricted key is welcome
    const live = { STRIPE_SECRET_KEY: 'sk_' + 'live_FAKEsecretKEY0123456789abcd', STRIPE_PUBLISHABLE_KEY: 'pk_' + 'live_FAKEpublishableKEY0123456789', STRIPE_WEBHOOK_SECRET: WHSEC };
    expect(readStripeConfig(live)).toMatchObject({ ok: true, config: { mode: 'live' } });
    expect(cardPaymentsMode(GOOD_ENV)).toBe('stripe');
  });

  it('is off, naming the variable (never the value), when something is missing', () => {
    for (const name of ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET']) {
      const env = { ...GOOD_ENV, [name]: '' };
      const r = readStripeConfig(env);
      expect(r).toEqual({ ok: false, problems: [`${name} is missing`] });
      expect(cardPaymentsMode(env)).toBe('off');
    }
    expect(readStripeConfig({})).toMatchObject({ ok: false });
    expect(cardPaymentsMode({})).toBe('off');
  });

  it('is off for malformed values', () => {
    const bad = [
      { STRIPE_SECRET_KEY: 'pk_' + 'test_FAKEpublishableKEY0123456789efgh' }, // a publishable key where the secret goes
      { STRIPE_SECRET_KEY: 'sk_prod_FAKEsecretKEY0123456789abcd' },
      { STRIPE_SECRET_KEY: 'sk_' + 'test_short' },
      { STRIPE_PUBLISHABLE_KEY: SK }, // a SECRET key where the public one goes
      { STRIPE_PUBLISHABLE_KEY: 'pk_' + 'test_has space in it 1234' },
      { STRIPE_WEBHOOK_SECRET: SK },
      { STRIPE_WEBHOOK_SECRET: 'whsec_x' },
    ];
    for (const patch of bad) {
      const r = readStripeConfig({ ...GOOD_ENV, ...patch });
      expect(r.ok).toBe(false);
      expect(JSON.stringify(r)).not.toMatch(/FAKE|whsec_x|has space/); // the problems never echo a value
    }
  });

  it('is off when the keys are in different modes (test vs live)', () => {
    const r = readStripeConfig({ ...GOOD_ENV, STRIPE_PUBLISHABLE_KEY: 'pk_' + 'live_FAKEpublishableKEY0123456789' });
    expect(r).toEqual({ ok: false, problems: ['STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY are in different modes (test vs live)'] });
    expect(cardPaymentsMode({ ...GOOD_ENV, STRIPE_SECRET_KEY: 'sk_' + 'live_FAKEsecretKEY0123456789abcd' })).toBe('off');
  });

  it('tolerates the whitespace a pasted value tends to carry', () => {
    expect(readStripeConfig({ STRIPE_SECRET_KEY: ` ${SK}\n`, STRIPE_PUBLISHABLE_KEY: PK, STRIPE_WEBHOOK_SECRET: `${WHSEC} ` })).toMatchObject({ ok: true });
  });
});

describe('createStripeClient', () => {
  const logger = () => {
    const lines: string[] = [];
    return { lines, log: (m: string) => void lines.push(`log: ${m}`), warn: (m: string) => void lines.push(`warn: ${m}`) };
  };

  it('returns null and warns clearly when the keys are not all there', () => {
    const l = logger();
    expect(createStripeClient({}, l as never)).toBeNull();
    expect(createStripeClient({ ...GOOD_ENV, STRIPE_WEBHOOK_SECRET: '' }, l as never)).toBeNull();
    expect(createStripeClient({ ...GOOD_ENV, STRIPE_PUBLISHABLE_KEY: 'pk_' + 'live_FAKEpublishableKEY0123456789' }, l as never)).toBeNull();
    expect(l.lines).toHaveLength(3);
    expect(l.lines.every((x) => x.startsWith('warn: Card payments are OFF'))).toBe(true);
    expect(l.lines[1]).toContain('STRIPE_WEBHOOK_SECRET is missing');
    expect(l.lines[2]).toContain('different modes');
  });

  it('logs the mode and the last 4 characters only', () => {
    const l = logger();
    const client = createStripeClient(GOOD_ENV, l as never);
    expect(client).toBeInstanceOf(StripeSdkClient);
    expect(client!.mode).toBe('test');
    expect(client!.publishableKey).toBe(PK);
    expect(l.lines).toEqual(['log: Card payments are ON (Stripe test mode, secret key …abcd).']);
    expect(secretsIn(l.lines.join('\n'))).toEqual([]);
  });

  it('shouts when a production server runs on test keys, still without a key', () => {
    const l = logger();
    createStripeClient({ ...GOOD_ENV, NODE_ENV: 'production' }, l as never);
    expect(l.lines.some((x) => x.startsWith('warn: Stripe is in TEST mode on a production server'))).toBe(true);
    expect(secretsIn(l.lines.join('\n'))).toEqual([]);
  });

  it('no boot log of any case contains a key', () => {
    const l = logger();
    for (const env of [{}, GOOD_ENV, { ...GOOD_ENV, STRIPE_SECRET_KEY: 'sk_' + 'test_short' }, { ...GOOD_ENV, STRIPE_PUBLISHABLE_KEY: 'pk_' + 'live_FAKEpublishableKEY0123456789' }]) createStripeClient(env, l as never);
    expect(secretsIn(l.lines.join('\n'))).toEqual([]);
  });
});

describe('scrubSecrets', () => {
  it('removes anything shaped like a Stripe key, and any exact secret', () => {
    const text = `Invalid API Key provided: ${SK}; webhook ${WHSEC}; pk ${PK}; rk ${RK}; sk_${'live_'}51Habc***def`;
    const clean = scrubSecrets(text);
    expect(secretsIn(clean)).toEqual([]);
    expect(clean).not.toMatch(/sk_live_|FAKE/);
    expect(scrubSecrets('token abcdefgh1234 leaked', ['abcdefgh1234'])).toBe('token [redacted] leaked');
  });
});

describe('StripeSdkClient', () => {
  /** An SDK stand-in: records what it is called with. Nothing here touches the network. */
  function fakeSdk(over: Record<string, unknown> = {}) {
    const calls: { fn: string; args: unknown[] }[] = [];
    const rec = (fn: string, result: unknown) => async (...args: unknown[]) => {
      calls.push({ fn, args });
      if (result instanceof Error) throw result;
      return result;
    };
    const pi = { id: 'pi_1', status: 'requires_payment_method', amount: 1234, amount_received: 0, currency: 'USD', client_secret: 'pi_1_secret_FAKE', metadata: { reference: 'PAY-1' }, last_payment_error: { message: 'Your card was declined.' }, cancellation_reason: null };
    const re = { id: 're_1', status: 'pending', amount: 500, currency: 'usd', payment_intent: 'pi_1', failure_reason: null, metadata: { refundRef: 'rfd_1' } };
    const sdk = {
      paymentIntents: { create: rec('pi.create', over.create ?? pi), retrieve: rec('pi.retrieve', over.retrieve ?? pi), cancel: rec('pi.cancel', over.cancel ?? { ...pi, status: 'canceled', cancellation_reason: 'abandoned' }) },
      refunds: { create: rec('re.create', over.refund ?? re), retrieve: rec('re.retrieve', over.refund ?? re) },
      webhooks: new Stripe(SK).webhooks,
    };
    return { sdk: sdk as unknown as Stripe, calls };
  }

  it('creates a card PaymentIntent in cents with the idempotency key, and maps the answer', async () => {
    const { sdk, calls } = fakeSdk();
    const client = new StripeSdkClient(cfg, sdk);
    const pi = await client.createPaymentIntent({ amountCents: 1234, currency: 'usd', metadata: { reference: 'PAY-1' }, description: 'KOMORIKO order SOM-1', idempotencyKey: 'pi-PAY-1' });
    expect(calls[0]).toEqual({
      fn: 'pi.create',
      args: [{ amount: 1234, currency: 'usd', payment_method_types: ['card'], metadata: { reference: 'PAY-1' }, description: 'KOMORIKO order SOM-1' }, { idempotencyKey: 'pi-PAY-1' }],
    });
    expect(pi).toEqual({
      id: 'pi_1', status: 'requires_payment_method', amount: 1234, amountReceived: 0, currency: 'usd', clientSecret: 'pi_1_secret_FAKE',
      metadata: { reference: 'PAY-1' }, lastError: 'Your card was declined.', cancellationReason: null,
    });
    expect((await client.cancelPaymentIntent('pi_1')).status).toBe('canceled');
    expect((await client.retrievePaymentIntent('pi_1')).id).toBe('pi_1');
  });

  it('creates a refund with its idempotency key and maps it', async () => {
    const { sdk, calls } = fakeSdk();
    const client = new StripeSdkClient(cfg, sdk);
    const r = await client.createRefund({ paymentIntentId: 'pi_1', amountCents: 500, metadata: { refundRef: 'rfd_1' }, idempotencyKey: 'rfd_1' });
    expect(calls[0]).toEqual({ fn: 're.create', args: [{ payment_intent: 'pi_1', amount: 500, metadata: { refundRef: 'rfd_1' } }, { idempotencyKey: 'rfd_1' }] });
    expect(r).toEqual({ id: 're_1', status: 'pending', amount: 500, currency: 'usd', paymentIntentId: 'pi_1', failureReason: null, metadata: { refundRef: 'rfd_1' } });
    expect((await client.retrieveRefund('re_1')).paymentIntentId).toBe('pi_1');
  });

  it('turns SDK errors into ours, and no error can carry a key', async () => {
    const leaky = `Invalid API Key provided: ${SK} (webhook ${WHSEC})`;
    const connection = await new StripeSdkClient(cfg, fakeSdk({ retrieve: Object.assign(new Error(leaky), { type: 'StripeConnectionError' }) }).sdk).retrievePaymentIntent('pi_1').catch((e) => e);
    expect(connection).toBeInstanceOf(StripeUnavailableError);
    expect(secretsIn(connection.message)).toEqual([]);
    const auth = await new StripeSdkClient(cfg, fakeSdk({ create: Object.assign(new Error(leaky), { type: 'StripeAuthenticationError' }) }).sdk)
      .createPaymentIntent({ amountCents: 100, currency: 'usd', metadata: {}, idempotencyKey: 'k' })
      .catch((e) => e);
    expect(auth).toBeInstanceOf(StripeRejectedError);
    expect(auth.message).toBe('Stripe rejected our API key.');
    const card = await new StripeSdkClient(cfg, fakeSdk({ refund: Object.assign(new Error(`${leaky} declined`), { type: 'StripeInvalidRequestError', code: 'charge_already_refunded' }) }).sdk)
      .createRefund({ paymentIntentId: 'pi_1', amountCents: 1, metadata: {}, idempotencyKey: 'k' })
      .catch((e) => e);
    expect(card).toBeInstanceOf(StripeRejectedError);
    expect(card.code).toBe('charge_already_refunded');
    expect(secretsIn(card.message)).toEqual([]);
    const server = await new StripeSdkClient(cfg, fakeSdk({ retrieve: Object.assign(new Error('boom'), { type: 'StripeInvalidRequestError', statusCode: 503 }) }).sdk).retrievePaymentIntent('pi_1').catch((e) => e);
    expect(server).toBeInstanceOf(StripeUnavailableError);
    expect(connection.cause).toBeUndefined(); // the SDK error itself is not kept
  });

  describe('webhook signatures', () => {
    const signer = new Stripe(SK);
    const client = new StripeSdkClient(cfg, fakeSdk().sdk);
    const body = (type: string, object: Record<string, unknown>, over: Record<string, unknown> = {}) =>
      JSON.stringify({ id: 'evt_1', object: 'event', type, livemode: false, data: { object }, ...over });
    const sign = (payload: string, over: { secret?: string; timestamp?: number } = {}) => signer.webhooks.generateTestHeaderString({ payload, secret: over.secret ?? WHSEC, timestamp: over.timestamp });

    it('accepts a correctly signed event and keeps only ids', () => {
      const payload = body('payment_intent.succeeded', { id: 'pi_1', object: 'payment_intent', amount: 1234 });
      expect(client.constructWebhookEvent(Buffer.from(payload), sign(payload))).toEqual({ id: 'evt_1', type: 'payment_intent.succeeded', objectId: 'pi_1', paymentIntentId: 'pi_1' });
      const charge = body('charge.refunded', { id: 'ch_1', object: 'charge', payment_intent: 'pi_9' });
      expect(client.constructWebhookEvent(Buffer.from(charge), sign(charge))).toMatchObject({ objectId: 'ch_1', paymentIntentId: 'pi_9' });
      const refund = body('refund.updated', { id: 're_1', object: 'refund', payment_intent: 'pi_9' });
      expect(client.constructWebhookEvent(Buffer.from(refund), [sign(refund)])).toMatchObject({ objectId: 're_1', paymentIntentId: 'pi_9' });
    });

    it('refuses a missing, wrong, tampered or stale signature without saying what was wrong', () => {
      const payload = body('payment_intent.succeeded', { id: 'pi_1', object: 'payment_intent' });
      const fails = (raw: string, header: string | undefined) => {
        try {
          client.constructWebhookEvent(Buffer.from(raw), header);
        } catch (e) {
          return (e as Error).message;
        }
        return null;
      };
      expect(fails(payload, undefined)).toBe('Missing Stripe-Signature header.');
      expect(fails(payload, 't=1,v1=deadbeef')).toBe('Stripe signature does not verify.');
      expect(fails(payload, sign(payload, { secret: 'whsec_OTHERsecret0123456789abcdef' }))).toBe('Stripe signature does not verify.');
      expect(fails(payload.replace('pi_1', 'pi_2'), sign(payload))).toBe('Stripe signature does not verify.'); // tampered after signing
      expect(fails(payload, sign(payload, { timestamp: Math.floor(Date.now() / 1000) - 3600 }))).toBe('Stripe signature does not verify.'); // outside the 5-minute tolerance
      for (const m of [fails(payload, 't=1,v1=deadbeef'), fails(payload, sign(payload, { secret: 'whsec_OTHERsecret0123456789abcdef' }))]) {
        expect(m).not.toContain('v1=');
        expect(secretsIn(m!)).toEqual([]);
      }
    });

    it('refuses an event from the other mode', () => {
      const payload = body('payment_intent.succeeded', { id: 'pi_1', object: 'payment_intent' }, { livemode: true });
      expect(() => client.constructWebhookEvent(Buffer.from(payload), sign(payload))).toThrow(/other Stripe mode/);
    });
  });
});
