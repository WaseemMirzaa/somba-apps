import { smsText, VerificationService } from './verification.service';

function make(user: Record<string, unknown>) {
  const tokens = {
    findOne: async () => null,
    update: async () => ({ affected: 0 }),
    create: (x: object) => x,
    save: async (x: object) => x,
  };
  const users = { findByPhoneHash: async () => [user] };
  const messaging = { deliverSms: jest.fn(async (): Promise<'sent' | 'not_configured' | 'failed'> => 'sent'), emailConfigured: true, smsConfigured: true };
  const svc = new VerificationService(tokens as never, users as never, messaging as never);
  return { svc, messaging };
}

const customer = (locale?: string) => ({
  id: 'u1',
  role: 'customer',
  active: true,
  phoneVerified: true,
  phone: '+243812345678',
  ...(locale ? { locale } : {}),
});

describe('SMS text', () => {
  it('has the French templates', () => {
    expect(smsText.verify('123456', 'fr')).toBe('Votre code de vérification KOMORIKO est 123456. Il expire dans 10 minutes.');
    expect(smsText.signIn('123456', 'fr')).toBe('Votre code de connexion KOMORIKO est 123456. Il expire dans 10 minutes. Ne le partagez jamais.');
  });

  it('keeps the English templates unchanged', () => {
    expect(smsText.verify('123456', 'en')).toBe('Your KOMORIKO verification code is 123456. It expires in 10 minutes.');
    expect(smsText.signIn('123456', 'en')).toBe('Your KOMORIKO sign-in code is 123456. It expires in 10 minutes. Never share it.');
  });

  it('falls back to English for an unknown or missing language', () => {
    for (const locale of [undefined, null, '', 'de']) {
      expect(smsText.verify('1', locale)).toMatch(/^Your KOMORIKO verification code/);
      expect(smsText.signIn('1', locale)).toMatch(/^Your KOMORIKO sign-in code/);
    }
  });

  it('uses plain GSM characters, so a code stays one SMS', () => {
    const gsm = /^[A-Za-z0-9 .,&:;!?'"()@%\-+\/éèùìòÇØøÅåÆæÉÄÖÑÜäöñüà]*$/;
    expect(smsText.verify('123456', 'fr')).toMatch(gsm);
    expect(smsText.signIn('123456', 'fr')).toMatch(gsm);
  });
});

describe('VerificationService sends the SMS in the account language', () => {
  it('phone verification code, French account', async () => {
    const { svc, messaging } = make({});
    const res = await svc.sendPhoneOtp({ id: 'u1', phone: '+243812345678', locale: 'fr' } as never);
    expect(messaging.deliverSms).toHaveBeenCalledWith('+243812345678', `Votre code de vérification KOMORIKO est ${res.devToken}. Il expire dans 10 minutes.`);
  });

  it('phone verification code, English account', async () => {
    const { svc, messaging } = make({});
    const res = await svc.sendPhoneOtp({ id: 'u1', phone: '+243812345678', locale: 'en' } as never);
    expect(messaging.deliverSms).toHaveBeenCalledWith('+243812345678', `Your KOMORIKO verification code is ${res.devToken}. It expires in 10 minutes.`);
  });

  it('sign-in code, French account', async () => {
    const { svc, messaging } = make(customer('fr'));
    const res = await svc.sendLoginCode('0812345678');
    expect(messaging.deliverSms).toHaveBeenCalledWith(
      '+243812345678',
      `Votre code de connexion KOMORIKO est ${res.devToken}. Il expire dans 10 minutes. Ne le partagez jamais.`,
    );
  });

  it('sign-in code, English account', async () => {
    const { svc, messaging } = make(customer('en'));
    const res = await svc.sendLoginCode('0812345678');
    expect(messaging.deliverSms).toHaveBeenCalledWith(
      '+243812345678',
      `Your KOMORIKO sign-in code is ${res.devToken}. It expires in 10 minutes. Never share it.`,
    );
  });
});

describe('VerificationService says what became of the message', () => {
  it('phone code: sent, with the number masked', async () => {
    const { svc } = make({});
    const res = await svc.sendPhoneOtp({ id: 'u1', phone: '+243812345678', locale: 'en' } as never);
    expect(res).toMatchObject({ sent: true, to: '+243•••78' });
    expect(res.reason).toBeUndefined();
  });

  it('phone code: no SMS provider on the server is reported as not_configured, not as sent', async () => {
    const { svc, messaging } = make({});
    messaging.deliverSms.mockResolvedValueOnce('not_configured');
    const res = await svc.sendPhoneOtp({ id: 'u1', phone: '+243812345678', locale: 'en' } as never);
    expect(res).toMatchObject({ sent: false, reason: 'not_configured', to: '+243•••78' });
  });

  it('phone code: a provider that refused it is reported as failed', async () => {
    const { svc, messaging } = make({});
    messaging.deliverSms.mockResolvedValueOnce('failed');
    expect(await svc.sendPhoneOtp({ id: 'u1', phone: '+243812345678', locale: 'en' } as never)).toMatchObject({ sent: false, reason: 'failed' });
  });

  it('sign-in code: the reply is the same for a number with no account, and says when SMS is not set up', async () => {
    const { svc, messaging } = make({ role: 'seller' });
    messaging.smsConfigured = false;
    const res = await svc.sendLoginCode('0812345678');
    expect(res).toMatchObject({ sent: true, reason: 'not_configured' });
  });
});
