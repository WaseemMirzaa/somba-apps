import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { normalizePhone } from '../common/phone/phone-hash';

/**
 * The number as Twilio wants it: `+` and digits only. A stored number is whatever the person typed ("+243 900 000 101",
 * "0812345678"), and Twilio refuses spaces and national formats (error 21211), so it is cleaned here, the same way
 * logins match it. Null when it cannot be a phone number.
 */
export function toE164(raw: string | null | undefined): string | null {
  const n = normalizePhone(raw);
  return n ? `+${n}` : null;
}

/** `TWILIO_FROM` may name a Messaging Service (`MG` + 32 hex), which Twilio takes in a different field than a number or sender name. */
const MESSAGING_SERVICE_SID = /^MG[0-9a-f]{32}$/i;

/** Whether this server has an SMTP host / a Twilio account, from the environment (also sent to the apps as a setting). */
export const emailProviderConfigured = (env: NodeJS.ProcessEnv = process.env): boolean => !!env.SMTP_HOST;
export const smsProviderConfigured = (env: NodeJS.ProcessEnv = process.env): boolean => !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM);

/** What happened to one message: handed to the provider, nothing configured to send it, or the provider refused it. */
export type Delivery = 'sent' | 'not_configured' | 'failed';

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
    return emailProviderConfigured();
  }
  get smsConfigured(): boolean {
    return smsProviderConfigured();
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
    return (await this.deliverEmail(to, subject, text)) === 'sent';
  }

  /** Like {@link sendEmail} but says WHY nothing was sent, so a screen can tell "not set up" from "provider refused". */
  async deliverEmail(to: string, subject: string, text: string): Promise<Delivery> {
    const mailer = this.getMailer();
    if (!mailer) return this.undelivered('email', to, text);
    try {
      await mailer.sendMail({
        from: process.env.MAIL_FROM ?? 'Somba&Teka <no-reply@somba.app>',
        to,
        subject,
        text,
      });
      return 'sent';
    } catch (err) {
      this.logger.error(`Email to ${mask(to)} failed: ${(err as Error).message}`);
      return 'failed';
    }
  }

  async sendSms(to: string, text: string): Promise<boolean> {
    return (await this.deliverSms(to, text)) === 'sent';
  }

  async deliverSms(to: string, text: string): Promise<Delivery> {
    if (!this.smsConfigured) return this.undelivered('sms', to, text);
    const e164 = toE164(to);
    if (!e164) {
      this.logger.error(`SMS to ${mask(to)} not sent: not a valid phone number.`);
      return 'failed';
    }
    try {
      const sid = process.env.TWILIO_ACCOUNT_SID!;
      const from = process.env.TWILIO_FROM!;
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
            To: e164,
            ...(MESSAGING_SERVICE_SID.test(from) ? { MessagingServiceSid: from } : { From: from }),
            Body: text,
          }),
        },
      );
      if (!res.ok) {
        // Twilio's error code says why (21211 bad number, 21608 trial account and unverified number, 21408 country not
        // enabled, 20003 wrong credentials). Its message can name the number, so only the code is logged.
        const code = ((await res.json().catch(() => null)) as { code?: number } | null)?.code;
        this.logger.error(`SMS to ${mask(e164)} failed: HTTP ${res.status}${code ? `, Twilio error ${code}` : ''}`);
        return 'failed';
      }
      return 'sent';
    } catch (err) {
      this.logger.error(`SMS to ${mask(to)} failed: ${(err as Error).message}`);
      return 'failed';
    }
  }

  private undelivered(channel: 'email' | 'sms', to: string, text: string): Delivery {
    if (this.isProd) {
      this.logger.warn(
        `${channel.toUpperCase()} provider not configured — message to ${mask(to)} NOT delivered.`,
      );
    } else {
      this.logger.warn(`[dev ${channel}] to=${to}\n${text}`);
    }
    return 'not_configured';
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
