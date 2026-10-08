import { mask, MessagingService } from './messaging.service';

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
