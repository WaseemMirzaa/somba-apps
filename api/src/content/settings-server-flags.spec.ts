import { SettingsService } from './settings.service';

/** What the server can do (SMS, e-mail, translation) reaches the apps as computed flags, never as stored settings. */
describe('settings:get server capability flags', () => {
  const svc = new SettingsService({ find: async () => [], findOne: async () => null } as never, { toRoles: () => undefined } as never);
  const keys = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM', 'SMTP_HOST', 'TRANSLATE_PROVIDER', 'GOOGLE_TRANSLATE_API_KEY', 'FIREBASE_SERVICE_ACCOUNT_JSON'];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => keys.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; }));
  afterEach(() => keys.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))));

  it('is off for all three on a server with nothing configured', async () => {
    expect(await svc.clientView()).toMatchObject({ translation: 'off', smsVerification: 'off', emailVerification: 'off' });
  });

  it('turns each on from its own variables', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'a';
    expect(await svc.clientView()).toMatchObject({ smsVerification: 'off' }); // needs all three
    process.env.TWILIO_AUTH_TOKEN = 'b';
    process.env.TWILIO_FROM = '+1';
    process.env.SMTP_HOST = 'mail.example';
    process.env.GOOGLE_TRANSLATE_API_KEY = 'k';
    expect(await svc.clientView()).toMatchObject({ translation: 'on', smsVerification: 'on', emailVerification: 'on' });
  });

  it('cannot be set as a stored setting', async () => {
    for (const k of ['translation', 'smsVerification', 'emailVerification']) await expect(svc.set(k, 'on')).rejects.toThrow('Unknown setting.');
  });
});
