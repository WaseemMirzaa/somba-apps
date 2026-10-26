import { BadRequestException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '../database/entities';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { hashRecovery, looksLikeRecovery, newRecoveryCodes, newTotpSecret, otpauthUrl, verifyTotp } from './totp';

export interface TwoFaChallenge {
  needs2fa: true;
  /** Short-lived proof that the password step passed; trade it with a code at POST /api/v1/auth/login/2fa. */
  challenge: string;
}

export interface TwoFaStatus {
  enabled: boolean;
  /** `auth:2fa:setup` ran but the first code was not confirmed yet. */
  pending: boolean;
  recoveryRemaining: number;
}

const CHALLENGE_TTL = '5m';
/** Wrong codes allowed per account before a cool-down. */
export const MAX_2FA_FAILURES = 5;
export const LOCK_MS = 10 * 60_000;

/**
 * Time-based one-time passwords as a second sign-in step (docs/contracts/seller-platform.md). The secret is
 * encrypted at rest; a code works once (its 30-second step is remembered); recovery codes are stored hashed and burn
 * on use; wrong codes are counted per account so a 6-digit code cannot be guessed.
 */
@Injectable()
export class TwoFaService {
  private readonly failures = new Map<string, { n: number; until: number }>();

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly notifications?: NotificationsService,
  ) {}

  private recoveryHashes(user: Pick<User, 'twofaRecovery'>): string[] {
    try {
      const v = JSON.parse(user.twofaRecovery ?? '[]');
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  status(user: User): TwoFaStatus {
    return {
      enabled: !!user.twofaEnabled,
      pending: !user.twofaEnabled && !!user.twofaSecret,
      recoveryRemaining: user.twofaEnabled ? this.recoveryHashes(user).length : 0,
    };
  }

  // ── Brute-force guard ──────────────────────────────────────────────────
  private assertNotLocked(userId: string): void {
    const f = this.failures.get(userId);
    if (f && f.n >= MAX_2FA_FAILURES) {
      if (Date.now() < f.until) throw new HttpException('Too many wrong codes. Try again in a few minutes.', HttpStatus.TOO_MANY_REQUESTS);
      this.failures.delete(userId);
    }
  }
  private fail(userId: string): never {
    if (this.failures.size > 10_000) for (const [k, v] of this.failures) if (Date.now() >= v.until) this.failures.delete(k);
    const f = this.failures.get(userId) ?? { n: 0, until: 0 };
    f.n += 1;
    f.until = Date.now() + LOCK_MS;
    this.failures.set(userId, f);
    throw new BadRequestException('That code is not right. Check the time on your phone and try again.');
  }

  /**
   * Check a TOTP code or a recovery code for an account whose 2FA is on (or being set up with `pendingOk`).
   * Burns what it accepts. Throws on a wrong code (and counts it).
   */
  async consumeCode(user: User, code: string, opts: { pendingOk?: boolean } = {}): Promise<'totp' | 'recovery'> {
    this.assertNotLocked(user.id);
    if (!user.twofaSecret || (!user.twofaEnabled && !opts.pendingOk)) throw new BadRequestException('Two-factor authentication is not on for this account.');
    const typed = String(code ?? '').trim();
    if (!opts.pendingOk && looksLikeRecovery(typed)) {
      const hashes = this.recoveryHashes(user);
      const h = hashRecovery(typed);
      if (hashes.includes(h)) {
        user.twofaRecovery = JSON.stringify(hashes.filter((x) => x !== h));
        await this.users.save(user);
        this.failures.delete(user.id);
        return 'recovery';
      }
      this.fail(user.id);
    }
    const step = verifyTotp(user.twofaSecret, typed, { lastStep: user.twofaLastStep });
    if (step === null) this.fail(user.id);
    user.twofaLastStep = step;
    await this.users.save(user);
    this.failures.delete(user.id);
    return 'totp';
  }

  // ── Setup / enable / disable ────────────────────────────────────────────
  /** Start (or restart) enrolment: a fresh secret and the link for the authenticator app. Nothing is enforced until `enable`. */
  async setup(userId: string): Promise<{ secret: string; otpauthUrl: string; issuer: string; account: string }> {
    const user = await this.must(userId);
    if (user.twofaEnabled) throw new BadRequestException('Two-factor authentication is already on. Turn it off first to set it up again.');
    user.twofaSecret = newTotpSecret();
    user.twofaLastStep = 0;
    await this.users.save(user);
    return { secret: user.twofaSecret, otpauthUrl: otpauthUrl(user.twofaSecret, user.email), issuer: 'Somba&Teka', account: user.email };
  }

  /** Confirm the first code: 2FA is now on. Returns the recovery codes, ONCE. */
  async enable(userId: string, code: string): Promise<{ enabled: true; recoveryCodes: string[] }> {
    const user = await this.must(userId);
    if (user.twofaEnabled) throw new BadRequestException('Two-factor authentication is already on.');
    if (!user.twofaSecret) throw new BadRequestException('Start the setup first.');
    await this.consumeCode(user, code, { pendingOk: true });
    const codes = newRecoveryCodes();
    user.twofaEnabled = true;
    user.twofaRecovery = JSON.stringify(codes.map(hashRecovery));
    await this.users.save(user);
    await this.tell(user.id, {
      title: 'Two-factor authentication enabled',
      body: 'Signing in to your account now asks for a code from your authenticator app.',
      type: 'security',
    });
    return { enabled: true, recoveryCodes: codes };
  }

  async disable(userId: string, code: string): Promise<{ enabled: false }> {
    const user = await this.must(userId);
    if (!user.twofaEnabled) throw new BadRequestException('Two-factor authentication is not on.');
    await this.consumeCode(user, code);
    user.twofaEnabled = false;
    user.twofaSecret = null;
    user.twofaRecovery = null;
    user.twofaLastStep = 0;
    await this.users.save(user);
    await this.tell(user.id, {
      title: 'Two-factor authentication disabled',
      body: 'Two-factor authentication was turned off on your account.',
      type: 'security',
    });
    return { enabled: false };
  }

  /** New recovery codes (the old ones stop working); needs a current code. */
  async regenerateRecovery(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.must(userId);
    if (!user.twofaEnabled) throw new BadRequestException('Two-factor authentication is not on.');
    await this.consumeCode(user, code);
    const codes = newRecoveryCodes();
    user.twofaRecovery = JSON.stringify(codes.map(hashRecovery));
    await this.users.save(user);
    return { recoveryCodes: codes };
  }

  // ── Login step-up ────────────────────────────────────────────────────────
  /** The challenge a password (or phone-code) login returns for an account with 2FA on. */
  async challengeFor(user: User): Promise<TwoFaChallenge> {
    const challenge = await this.jwt.signAsync({ sub: user.id, purpose: '2fa', tokenVersion: user.tokenVersion ?? 0 }, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn: CHALLENGE_TTL as unknown as number,
    });
    return { needs2fa: true, challenge };
  }

  /** Trade a challenge + code for the user it was issued to (throws on anything wrong). */
  async redeem(challenge: string, code: string): Promise<User> {
    let payload: { sub: string; purpose?: string; tokenVersion?: number };
    try {
      payload = await this.jwt.verifyAsync(challenge, { secret: this.config.get<string>('jwt.refreshSecret') });
    } catch {
      throw new UnauthorizedException('This sign-in expired. Enter your password again.');
    }
    if (payload.purpose !== '2fa') throw new UnauthorizedException('This sign-in expired. Enter your password again.');
    const user = await this.users.findById(payload.sub);
    if (!user || (payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) throw new UnauthorizedException('This sign-in expired. Enter your password again.');
    await this.consumeCode(user, code);
    return user;
  }

  private async must(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('Account no longer exists.');
    return user;
  }

  private async tell(userId: string, notice: { title: string; body: string; type: string }): Promise<void> {
    try {
      await this.notifications?.toUser(userId, notice);
    } catch {
      /* best-effort */
    }
  }
}
