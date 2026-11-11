import { mask, MessagingService, toE164 } from './messaging.service';

describe('mask', () => {
  it('hides most of an email and phone', () => {
    expect(mask('alice@example.com')).toBe('a***@example.com');
    expect(mask('+243970000111')).toBe('+243•••11');
    expect(mask('12')).toBe('•••');
  });
});

describe('MessagingService without providers', () => {
  beforeEach(() => {
    delete process.env.SMTP_HOST;
    delete process.env.TWILIO_ACCOUNT_SID;
  });
  it('reports not-delivered instead of throwing', async () => {
    const m = new MessagingService();
    expect(m.emailConfigured).toBe(false);
    expect(await m.sendEmail('a@b.com', 's', 'body')).toBe(false);
    expect(await m.sendSms('+243970000111', 'body')).toBe(false);
  });
});

describe('toE164', () => {
  it('turns what people type into the + and digits Twilio needs', () => {
    expect(toE164('+243 900 000 101')).toBe('+243900000101');
    expect(toE164('+243-900-000-101')).toBe('+243900000101');
    expect(toE164('(+243) 900 000 101')).toBe('+243900000101');
    expect(toE164('00243900000101')).toBe('+243900000101');
    expect(toE164('0900000101')).toBe('+243900000101'); // DRC national format
    expect(toE164('+33 6 12 34 56 78')).toBe('+33612345678');
  });
  it('refuses what cannot be a number', () => {
    expect(toE164('')).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164('12345')).toBeNull();
    expect(toE164('not a number')).toBeNull();
  });
});

describe('MessagingService with Twilio', () => {
  const SID = `AC${'a'.repeat(32)}`;
  const realFetch = global.fetch;
  let calls: { url: string; body: URLSearchParams; auth: string }[];

  const respond = (status: number, json: unknown = {}) => {
    global.fetch = jest.fn(async (url: unknown, init?: { body?: URLSearchParams; headers?: Record<string, string> }) => {
      calls.push({ url: String(url), body: init!.body as URLSearchParams, auth: init!.headers!.Authorization });
      return { ok: status >= 200 && status < 300, status, json: async () => json } as Response;
    }) as unknown as typeof fetch;
  };

  beforeEach(() => {
    calls = [];
    process.env.TWILIO_ACCOUNT_SID = SID;
    process.env.TWILIO_AUTH_TOKEN = 'b'.repeat(32);
    process.env.TWILIO_FROM = '+15005550006';
    respond(201);
  });
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM;
  });

  it('sends to the cleaned number from the configured number', async () => {
    expect(await new MessagingService().deliverSms('+243 900 000 101', 'code 123456')).toBe('sent');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`);
    expect(calls[0].body.get('To')).toBe('+243900000101');
    expect(calls[0].body.get('From')).toBe('+15005550006');
    expect(calls[0].body.get('MessagingServiceSid')).toBeNull();
    expect(calls[0].body.get('Body')).toBe('code 123456');
    expect(calls[0].auth).toBe(`Basic ${Buffer.from(`${SID}:${'b'.repeat(32)}`).toString('base64')}`);
  });

  it('cleans a national-format number the same way logins match it', async () => {
    await new MessagingService().deliverSms('0900000101', 'x');
    expect(calls[0].body.get('To')).toBe('+243900000101');
  });

  it('puts a Messaging Service SID in its own field, not in From', async () => {
    process.env.TWILIO_FROM = `MG${'c'.repeat(32)}`;
    await new MessagingService().deliverSms('+243900000101', 'x');
    expect(calls[0].body.get('MessagingServiceSid')).toBe(`MG${'c'.repeat(32)}`);
    expect(calls[0].body.get('From')).toBeNull();
  });

  it('keeps an alphanumeric sender name in From', async () => {
    process.env.TWILIO_FROM = 'KOMORIKO';
    await new MessagingService().deliverSms('+243900000101', 'x');
    expect(calls[0].body.get('From')).toBe('KOMORIKO');
  });

  it('does not call Twilio for something that is not a phone number', async () => {
    expect(await new MessagingService().deliverSms('abc', 'x')).toBe('failed');
    expect(calls).toHaveLength(0);
  });

  it('reports failed when Twilio refuses, and never logs the number or the message', async () => {
    respond(400, { code: 21211, message: 'The To number +243900000101 is not a valid phone number.' });
    const service = new MessagingService();
    const logged: string[] = [];
    (service as unknown as { logger: { error: (m: string) => void } }).logger.error = (m) => logged.push(m);
    expect(await service.deliverSms('+243900000101', 'secret code 123456')).toBe('failed');
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('Twilio error 21211');
    expect(logged[0]).toContain('HTTP 400');
    expect(logged[0]).not.toContain('900000101');
    expect(logged[0]).not.toContain('123456');
  });

  it('reports failed when the network drops', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('socket hang up');
    }) as unknown as typeof fetch;
    expect(await new MessagingService().deliverSms('+243900000101', 'x')).toBe('failed');
  });
});
