import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from '../database/entities';
import { PublicUser, UsersService } from '../users/users.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { AccountDeletionService, DELETED_NAME } from './account-deletion.service';
import { TwoFaService } from './twofa.service';
import type { TwoFaChallenge } from './twofa.service';

export interface JwtPayload {
  sub: string;
  role: string;
  email: string;
  tokenVersion?: number;
  /** What the token is for. Tokens issued before this claim existed have none (see {@link assertTokenKind}). */
  typ?: 'access' | 'refresh';
  /** Set only on short-lived special tokens, for example the 2FA sign-in challenge (`purpose: '2fa'`). */
  purpose?: string;
  /** Access tokens only: the account must still change its temporary password (`users.mustChangePassword`); see auth/password-change.ts. */
  pwc?: boolean;
}

/**
 * A token may only be used for what it was issued for. The 2FA challenge (a password-only sign-in) is signed with the
 * refresh secret, so without this check it could be traded at /auth/refresh for full tokens and the second step skipped.
 * A purpose token is never an access or refresh token; a token that says what it is must be the kind asked for.
 * Refresh tokens issued before `typ` existed carry neither claim and are still accepted until they expire.
 */
export function assertTokenKind(payload: Pick<JwtPayload, 'typ' | 'purpose'>, kind: 'access' | 'refresh'): void {
  if (payload.purpose || (payload.typ && payload.typ !== kind)) {
    throw new UnauthorizedException(kind === 'refresh' ? 'Invalid or expired refresh token.' : 'Invalid or expired token.');
  }
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  /** True while the account must change its temporary password before anything else (also in `user`); clients show that screen at once. */
  mustChangePassword: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    // Refuses a deletion while anything is outstanding and anonymises the records that stay (see its class comment).
    private readonly deletion: AccountDeletionService,
    // Second sign-in step for accounts that turned on two-factor authentication.
    private readonly twofa?: TwoFaService,
  ) {}

  /**
   * Roles anyone may sign up as. Staff, riders and admins are provisioned by an
   * admin (`roles:setRole`) — otherwise `POST /auth/register {role:"admin"}`
   * would hand out full control of the platform.
   */
  static readonly SELF_SERVICE_ROLES: readonly string[] = ['customer', 'seller'];

  async register(dto: RegisterDto): Promise<AuthResult> {
    if (dto.role && !AuthService.SELF_SERVICE_ROLES.includes(dto.role)) {
      throw new ForbiddenException('That account type cannot be created by self-registration.');
    }
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.users.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      role: dto.role ?? 'customer',
      phone: dto.phone ?? null,
      locale: dto.locale ?? 'en',
    });
    return this.issue(user);
  }

  /** Tokens, or `{ needs2fa: true, challenge }` when the account has two-factor authentication on (see `completeLogin`). */
  async login(dto: LoginDto): Promise<AuthResult | TwoFaChallenge> {
    const user = await this.users.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid email or password.');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid email or password.');
    this.assertNotSuspended(user);
    if (user.twofaEnabled && this.twofa) return this.twofa.challengeFor(user);
    return this.issue(user);
  }

  /** Sign in with a one-time code sent to the account's verified phone (customers only). */
  async loginWithPhoneCode(user: User): Promise<AuthResult | TwoFaChallenge> {
    this.assertNotSuspended(user);
    if (user.twofaEnabled && this.twofa) return this.twofa.challengeFor(user);
    return this.issue(user);
  }

  /** Second step: the challenge from `login` plus a code from the authenticator app (or a recovery code). */
  async completeLogin(challenge: string, code: string): Promise<AuthResult> {
    if (!this.twofa) throw new UnauthorizedException('Two-factor sign-in is not available.');
    const user = await this.twofa.redeem(challenge, code);
    this.assertNotSuspended(user);
    return this.issue(user);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
    assertTokenKind(payload, 'refresh');
    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedException('Account no longer exists.');
    if ((payload.tokenVersion ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('Session has been revoked.');
    }
    this.assertNotSuspended(user);
    return this.issue(user);
  }

  /**
   * An admin-suspended customer or seller (customers:setActive false), or a rider or warehouse employee an admin
   * switched off (staff:setActive false), must not get new sessions. The other admin roles have no off switch.
   */
  assertNotSuspended(user: User): void {
    if ((user.role === 'customer' || user.role === 'seller' || user.role === 'rider' || user.role === 'warehouse_staff') && !user.active) {
      throw new UnauthorizedException('This account has been suspended. Contact support.');
    }
  }

  /** Change password, keep the current device signed in, sign out all others. */
  async changePassword(userId: string, current: string, next: string): Promise<AuthResult> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('Account no longer exists.');
    if (!(await bcrypt.compare(current ?? '', user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect.');
    }
    if (!next || next.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters.');
    }
    // The temporary password was made by an administrator and may have been seen by them: the new one must be a different one.
    if (user.mustChangePassword && next === current) {
      throw new BadRequestException('Choose a new password that is different from the temporary one.');
    }
    user.passwordHash = await bcrypt.hash(next, 12);
    user.mustChangePassword = false;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.users.save(user);
    return this.issue(user);
  }

  /**
   * Delete an account. REFUSED (`AccountDeletionBlockedException`) while the account still has money in the wallet, an
   * order that is not finished, an open return / exchange / dispute / support ticket about an order, or a payout,
   * refund or top-up in flight. Otherwise personal data is erased and the login is destroyed (every session is revoked
   * by the token version), the row stays so past orders/payments remain consistent for accounting, and the personal
   * parts of the records that stay are anonymised (see `AccountDeletionService`). Check, anonymisation and the user
   * row change happen in one transaction.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('Account no longer exists.');
    if (!(await bcrypt.compare(password ?? '', user.passwordHash))) {
      throw new BadRequestException('Password is incorrect.');
    }
    await this.deletion.assertCanDelete(userId);
    const tombstone = `deleted+${user.id}@deleted.invalid`;
    user.name = DELETED_NAME;
    user.email = tombstone;
    user.emailHash = UsersService.emailHash(tombstone);
    user.phone = null;
    user.address = null;
    user.avatar = null;
    user.prefs = null;
    user.twofaEnabled = false;
    user.twofaSecret = null;
    user.twofaRecovery = null;
    user.emailVerified = false;
    user.phoneVerified = false;
    user.passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    user.active = false;
    await this.deletion.erase(user);
  }

  /** What would stop this account from being deleted right now (nothing is changed). Shown before the customer confirms. */
  deletionBlockers(userId: string) {
    return this.deletion.blockers(userId);
  }

  /** Verify an access token (used by the WebSocket handshake). */
  async verifyAccess(token: string): Promise<JwtPayload> {
    const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
      secret: this.config.get<string>('jwt.secret'),
    });
    assertTokenKind(payload, 'access');
    return payload;
  }

  /** Invalidate every token previously issued to this user. */
  async revokeSessions(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('Account no longer exists.');
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.users.save(user);
  }

  private async issue(user: User): Promise<AuthResult> {
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      email: user.email,
      tokenVersion: user.tokenVersion ?? 0,
    };
    const accessToken = await this.jwt.signAsync({ ...payload, typ: 'access', ...(user.mustChangePassword ? { pwc: true } : {}) }, {
      secret: this.config.get<string>('jwt.secret'),
      // `expiresIn` accepts vercel/ms strings ("15m") at runtime; the typing
      // wants a template-literal union, so widen from the env string.
      expiresIn: this.config.get<string>('jwt.accessTtl') as unknown as number,
    });
    const refreshToken = await this.jwt.signAsync({ ...payload, typ: 'refresh' }, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn: this.config.get<string>('jwt.refreshTtl') as unknown as number,
    });
    return { user: UsersService.toPublic(user), accessToken, refreshToken, mustChangePassword: !!user.mustChangePassword };
  }
}
