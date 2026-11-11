import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt } from 'crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { User, VerificationToken } from '../database/entities';
import type { VerificationKind } from '../database/entities';
import { MessagingService } from '../messaging/messaging.service';
import type { Delivery } from '../messaging/messaging.service';
import { UsersService } from '../users/users.service';
import { normalizePhone, phoneHash } from '../common/phone/phone-hash';
import { mask } from '../messaging/messaging.service';
import { SessionsService } from './sessions.service';

const MIN = 60_000;
export const TTL: Record<VerificationKind, number> = {
  email: 24 * 60 * MIN,
  phone: 10 * MIN,
  reset: 60 * MIN,
  login: 10 * MIN,
};
export const MAX_OTP_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30_000;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** The text messages, in the account's language (plain GSM characters, so one SMS stays one SMS). */
export const smsText = {
  verify: (code: string, locale?: string | null) =>
    locale === 'fr'
      ? `Votre code de vérification KOMORIKO est ${code}. Il expire dans 10 minutes.`
      : `Your KOMORIKO verification code is ${code}. It expires in 10 minutes.`,
  signIn: (code: string, locale?: string | null) =>
    locale === 'fr'
      ? `Votre code de connexion KOMORIKO est ${code}. Il expire dans 10 minutes. Ne le partagez jamais.`
      : `Your KOMORIKO sign-in code is ${code}. It expires in 10 minutes. Never share it.`,
};

/** What the API returns; `devToken` is only ever present outside production. */
export interface SendResult {
  sent: boolean;
  /**
   * Why nothing went out: `not_configured` (this server has no SMS / e-mail provider set up yet) or `failed` (the
   * provider refused it). Absent when `sent`. Lets the app say so instead of "code sent" for a code nobody got.
   */
  reason?: 'not_configured' | 'failed';
  /** Where it went, masked (`+243•••56`, `a***@b.com`), so the screen can say what was sent and to whom. */
  to?: string;
  devToken?: string;
}

/** The part of a {@link SendResult} that says what became of the message. */
const outcome = (d: Delivery, to: string): Pick<SendResult, 'sent' | 'reason' | 'to'> => ({
  sent: d === 'sent',
  ...(d === 'sent' ? {} : { reason: d }),
  to: mask(to),
});

@Injectable()
export class VerificationService {
  constructor(
    @InjectRepository(VerificationToken)
    private readonly tokens: Repository<VerificationToken>,
    private readonly users: UsersService,
    private readonly messaging: MessagingService,
    // Closes the open sockets and revokes the stored refresh tokens after a reset. Always provided by the module.
    @Optional() private readonly sessions?: SessionsService,
  ) {}

  private get webUrl(): string {
    return (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  }
  private get expose(): boolean {
    return process.env.NODE_ENV !== 'production';
  }

  /** Create a fresh token, retiring any older unused one of the same kind. */
  private async issue(
    userId: string,
    kind: VerificationKind,
    secret: string,
    cooldown: boolean,
  ): Promise<boolean> {
    if (cooldown) {
      const recent = await this.tokens.findOne({
        where: { userId, kind, createdAt: MoreThan(new Date(Date.now() - RESEND_COOLDOWN_MS)) },
      });
      if (recent) return false;
    }
    await this.tokens.update({ userId, kind, usedAt: IsNull() }, { usedAt: new Date() });
    await this.tokens.save(
      this.tokens.create({
        userId,
        kind,
        tokenHash: sha(kind === 'phone' || kind === 'login' ? `${userId}:${secret}` : secret),
        expiresAt: new Date(Date.now() + TTL[kind]),
        usedAt: null,
        attempts: 0,
      }),
    );
    return true;
  }

  // ── Email verification ────────────────────────────────────────────────
  async sendEmailVerification(user: User): Promise<SendResult> {
    if (user.emailVerified) return { sent: false };
    const secret = randomBytes(32).toString('hex');
    if (!(await this.issue(user.id, 'email', secret, true))) {
      throw new HttpException('Please wait before requesting another email.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const link = `${this.webUrl}/shop/verify-email?token=${secret}`;
    const d = await this.messaging.deliverEmail(
      user.email,
      'Verify your KOMORIKO email',
      `Hello ${user.name},\n\nConfirm your email address:\n${link}\n\nThis link expires in 24 hours. If you didn't create an account, ignore this message.`,
    );
    return { ...outcome(d, user.email), ...(this.expose ? { devToken: secret } : {}) };
  }

  async verifyEmail(token: string): Promise<{ verified: true }> {
    const row = await this.consume(sha(token), 'email');
    const user = await this.users.findById(row.userId);
    if (!user) throw new BadRequestException('Invalid or expired link.');
    user.emailVerified = true;
    await this.users.save(user);
    return { verified: true };
  }

  // ── Phone OTP ─────────────────────────────────────────────────────────
  async sendPhoneOtp(user: User): Promise<SendResult> {
    if (!user.phone) throw new BadRequestException('Add a phone number to your profile first.');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (!(await this.issue(user.id, 'phone', code, true))) {
      throw new HttpException('Please wait before requesting another code.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const d = await this.messaging.deliverSms(user.phone, smsText.verify(code, user.locale));
    return { ...outcome(d, user.phone), ...(this.expose ? { devToken: code } : {}) };
  }

  async verifyPhoneOtp(user: User, code: string): Promise<{ verified: true }> {
    const row = await this.tokens.findOne({
      where: { userId: user.id, kind: 'phone', usedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      order: { createdAt: 'DESC' },
    });
    if (!row || row.attempts >= MAX_OTP_ATTEMPTS) {
      throw new BadRequestException('Code expired or too many attempts. Request a new code.');
    }
    if (row.tokenHash !== sha(`${user.id}:${code}`)) {
      row.attempts += 1;
      await this.tokens.save(row);
      throw new BadRequestException('Incorrect code.');
    }
    row.usedAt = new Date();
    await this.tokens.save(row);
    user.phoneVerified = true;
    await this.users.save(user);
    return { verified: true };
  }

  // ── Phone-code login ──────────────────────────────────────────────────
  /**
   * The customer account a verified phone number belongs to, or null. Ambiguous numbers (several verified
   * accounts) are refused rather than guessed.
   */
  async customerForPhone(phone: string): Promise<User | null> {
    const hash = phoneHash(phone);
    if (!hash) return null;
    const rows = await this.users.findByPhoneHash(hash);
    const usable = rows.filter((u) => u.role === 'customer' && u.active && u.phoneVerified);
    return usable.length === 1 ? usable[0] : null;
  }

  /** Always `sent:true` (never reveals whether the number has an account); the code only goes to a real one. */
  async sendLoginCode(phone: string): Promise<SendResult> {
    if (!normalizePhone(phone)) throw new BadRequestException('Enter a valid phone number.');
    const user = await this.customerForPhone(phone);
    if (!user) return { sent: true, ...(this.messaging.smsConfigured ? {} : { reason: 'not_configured' as const }) };
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (!(await this.issue(user.id, 'login', code, true))) {
      throw new HttpException('Please wait before requesting another code.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const d = await this.messaging.deliverSms(user.phone!, smsText.signIn(code, user.locale));
    // Same reply for every number, so it never says whether the number has an account; an unconfigured gateway is
    // the same for everyone, so saying so reveals nothing.
    return { sent: true, ...(d === 'not_configured' ? { reason: 'not_configured' as const } : {}), ...(this.expose ? { devToken: code } : {}) };
  }

  /** Checks a login code and returns the account it unlocks (one use, 5 attempts, 10 minutes). */
  async consumeLoginCode(phone: string, code: string): Promise<User> {
    const fail = () => new BadRequestException('Incorrect or expired code.');
    const user = await this.customerForPhone(phone);
    if (!user) throw fail();
    const row = await this.tokens.findOne({
      where: { userId: user.id, kind: 'login', usedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      order: { createdAt: 'DESC' },
    });
    if (!row || row.attempts >= MAX_OTP_ATTEMPTS) throw fail();
    if (row.tokenHash !== sha(`${user.id}:${String(code).trim()}`)) {
      row.attempts += 1;
      await this.tokens.save(row);
      throw fail();
    }
    row.usedAt = new Date();
    await this.tokens.save(row);
    return user;
  }

  // ── Password reset ────────────────────────────────────────────────────
  /** Always reports `sent:true` — never reveals whether the email has an account. */
  async forgotPassword(email: string): Promise<SendResult> {
    const user = await this.users.findByEmail(email);
    // The same reply for every address (no account enumeration); "no e-mail provider on this server" is the same for everyone.
    const unconfigured = this.messaging.emailConfigured ? {} : { reason: 'not_configured' as const };
    if (!user || (user.role === 'customer' && !user.active)) return { sent: true, ...unconfigured };
    const secret = randomBytes(32).toString('hex');
    if (!(await this.issue(user.id, 'reset', secret, true))) return { sent: true, ...unconfigured };
    const link = `${this.webUrl}/shop/reset?token=${secret}`;
    await this.messaging.sendEmail(
      user.email,
      'Reset your KOMORIKO password',
      `Hello ${user.name},\n\nReset your password:\n${link}\n\nThis link expires in 1 hour and works once. If you didn't ask for this, ignore this message — your password is unchanged.`,
    );
    return { sent: true, ...unconfigured, ...(this.expose ? { devToken: secret } : {}) };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ reset: true }> {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters.');
    }
    const row = await this.consume(sha(token), 'reset');
    const user = await this.users.findById(row.userId);
    if (!user) throw new BadRequestException('Invalid or expired link.');
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    // The person chose this password themselves, so a pending "change the temporary password" is done.
    user.mustChangePassword = false;
    // Signs the user out everywhere — a reset implies the old credentials may be compromised.
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.users.save(user);
    // ...and that includes the sockets that are open right now (an attacker's session would otherwise live on).
    await this.sessions?.endSessions(user.id);
    return { reset: true };
  }

  /** Atomically find + burn a valid token, or throw one generic error. */
  private async consume(tokenHash: string, kind: VerificationKind): Promise<VerificationToken> {
    const row = await this.tokens.findOne({
      where: { tokenHash, kind, usedAt: IsNull(), expiresAt: MoreThan(new Date()) },
    });
    if (!row) throw new BadRequestException('Invalid or expired link.');
    const res = await this.tokens.update({ id: row.id, usedAt: IsNull() }, { usedAt: new Date() });
    if (!res.affected) throw new BadRequestException('Invalid or expired link.');
    return row;
  }
}
