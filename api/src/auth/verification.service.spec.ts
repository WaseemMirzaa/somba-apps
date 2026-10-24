import { smsText, VerificationService } from './verification.service';

function make(user: Record<string, unknown>) {
  const tokens = {
    findOne: async () => null,
    update: async () => ({ affected: 0 }),
    create: (x: object) => x,
    save: async (x: object) => x,
  };
  const users = { findByPhoneHash: async () => [user] };
  const messaging = { sendSms: jest.fn(async () => true) };
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
    expect(smsText.verify('123456', 'fr')).toBe('Votre code de vérification Somba&Teka est 123456. Il expire dans 10 minutes.');
    expect(smsText.signIn('123456', 'fr')).toBe('Votre code de connexion Somba&Teka est 123456. Il expire dans 10 minutes. Ne le partagez jamais.');
  });

  it('keeps the English templates unchanged', () => {
    expect(smsText.verify('123456', 'en')).toBe('Your Somba&Teka verification code is 123456. It expires in 10 minutes.');
    expect(smsText.signIn('123456', 'en')).toBe('Your Somba&Teka sign-in code is 123456. It expires in 10 minutes. Never share it.');
  });

  it('falls back to English for an unknown or missing language', () => {
    for (const locale of [undefined, null, '', 'de']) {
      expect(smsText.verify('1', locale)).toMatch(/^Your Somba&Teka verification code/);
      expect(smsText.signIn('1', locale)).toMatch(/^Your Somba&Teka sign-in code/);
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
    expect(messaging.sendSms).toHaveBeenCalledWith('+243812345678', `Votre code de vérification Somba&Teka est ${res.devToken}. Il expire dans 10 minutes.`);
  });

  it('phone verification code, English account', async () => {
    const { svc, messaging } = make({});
    const res = await svc.sendPhoneOtp({ id: 'u1', phone: '+243812345678', locale: 'en' } as never);
    expect(messaging.sendSms).toHaveBeenCalledWith('+243812345678', `Your Somba&Teka verification code is ${res.devToken}. It expires in 10 minutes.`);
  });

  it('sign-in code, French account', async () => {
    const { svc, messaging } = make(customer('fr'));
    const res = await svc.sendLoginCode('0812345678');
    expect(messaging.sendSms).toHaveBeenCalledWith(
      '+243812345678',
      `Votre code de connexion Somba&Teka est ${res.devToken}. Il expire dans 10 minutes. Ne le partagez jamais.`,
    );
  });

  it('sign-in code, English account', async () => {
    const { svc, messaging } = make(customer('en'));
    const res = await svc.sendLoginCode('0812345678');
    expect(messaging.sendSms).toHaveBeenCalledWith(
      '+243812345678',
      `Your Somba&Teka sign-in code is ${res.devToken}. It expires in 10 minutes. Never share it.`,
    );
  });
});
