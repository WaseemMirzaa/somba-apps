import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

/**
 * Outbound email + SMS. Both providers are OPTIONAL:
 *
 *   Email  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
 *   SMS    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
 *          (Twilio's REST API; any provider with the same shape can be swapped in)
 *
 * With a provider missing the message is not sent. Outside production the
 * content is logged so a developer can complete the flow; in production the
 * content (which contains a secret) is NEVER logged — only the fact that
 * delivery is unconfigured.
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private mailer: Transporter | null | undefined;

  get emailConfigured(): boolean {
    return !!process.env.SMTP_HOST;
  }
  get smsConfigured(): boolean {
    return !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM
    );
  }

  private get isProd(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  private getMailer(): Transporter | null {
    if (this.mailer !== undefined) return this.mailer;
    this.mailer = this.emailConfigured
      ? createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: Number(process.env.SMTP_PORT ?? 587) === 465,
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
        })
      : null;
    return this.mailer;
  }

  /** Returns true if handed to a provider. Never throws into the caller's flow. */
  async sendEmail(to: string, subject: string, text: string): Promise<boolean> {
    const mailer = this.getMailer();
    if (!mailer) return this.undelivered('email', to, text);
    try {
      await mailer.sendMail({
        from: process.env.MAIL_FROM ?? 'Somba&Teka <no-reply@somba.app>',
        to,
        subject,
        text,
      });
      return true;
    } catch (err) {
      this.logger.error(`Email to ${mask(to)} failed: ${(err as Error).message}`);
      return false;
    }
  }

  async sendSms(to: string, text: string): Promise<boolean> {
    if (!this.smsConfigured) return this.undelivered('sms', to, text);
    try {
      const sid = process.env.TWILIO_ACCOUNT_SID!;
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization:
              'Basic ' +
              Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: to,
            From: process.env.TWILIO_FROM!,
            Body: text,
          }),
        },
      );
      if (!res.ok) {
        this.logger.error(`SMS to ${mask(to)} failed: HTTP ${res.status}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`SMS to ${mask(to)} failed: ${(err as Error).message}`);
      return false;
    }
  }

  private undelivered(channel: 'email' | 'sms', to: string, text: string): boolean {
    if (this.isProd) {
      this.logger.warn(
        `${channel.toUpperCase()} provider not configured — message to ${mask(to)} NOT delivered.`,
      );
    } else {
      this.logger.warn(`[dev ${channel}] to=${to}\n${text}`);
    }
    return false;
  }
}

/** a***@b.com / +243•••••12 — enough to debug, not enough to leak. */
export function mask(v: string): string {
  if (v.includes('@')) {
    const [u, d] = v.split('@');
    return `${u.slice(0, 1)}***@${d}`;
  }
  return v.length > 4 ? `${v.slice(0, 4)}•••${v.slice(-2)}` : '•••';
}
