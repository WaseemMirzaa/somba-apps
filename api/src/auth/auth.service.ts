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
import { SessionsService } from './sessions.service';

export interface JwtPayload {
  sub: string;
  role: string;
  email: string;
  tokenVersion?: number;
  /** What the token is for. Tokens issued before this claim existed have none (see {@link assertTokenKind}). */
  typ?: 'access' | 'refresh';
  /** Set only on short-lived special tokens, for example the 2FA sign-in challenge (`purpose: '2fa'`). */
  purpose?: string;
  /**
   * Refresh tokens only: the id of the stored record that rotation tracks (see {@link SessionsService}). Refresh tokens
   * issued before rotation existed have none and keep working, unrotated, until they expire.
   */
  jti?: string;
  /** Expiry (seconds since the epoch), set by the signer. */
  exp?: number;
}

/**
 * Every account an admin switched off (a suspended customer or seller, a rider, warehouse employee or department admin
 * switched off with staff:setActive) and every deleted account has `active = false`: no new session, no REST call, no
 * socket. Thrown with the message the apps show (they translate it).
 */
export function assertActiveAccount(user: Pick<User, 'active'>): void {
  if (!user.active) throw new UnauthorizedException('This account has been suspended. Contact support.');
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
    // Refresh-token rotation and revocation (closing the open sockets). Always provided by the module; optional for unit tests.
    private readonly sessions?: SessionsService,
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
    // A token from before rotation (no `jti`) is still honoured until it expires, so nobody is signed out by the deploy;
    // what it is traded for is a tracked token, rotated from then on.
    if (!this.sessions || !payload.jti) return this.issue(user);
    return this.rotate(user, payload.jti);
  }

  /**
   * Refresh-token rotation (audit A-09): every refresh replaces the token. The replaced token is still answered for
   * {@link REFRESH_REUSE_GRACE_MS} with the token that replaced it (two tabs, a reload, a retry after a lost answer);
   * after that, presenting it again ends every session of the account and is audited (see {@link SessionsService}).
   */
  private async rotate(user: User, jti: string): Promise<AuthResult> {
    const sessions = this.sessions as SessionsService;
    for (let attempt = 0; attempt < 2; attempt++) {
      const seen = await sessions.inspect(user, jti);
      if (seen.kind === 'refused') throw new UnauthorizedException('Session has been revoked.');
      if (seen.kind === 'grace') {
        return { ...(await this.issue(user, { refresh: false })), refreshToken: await this.signRefresh(user, seen.live.id, seen.live.expiresAt) };
      }
      // Current: mint the successor first, then claim the old token. Losing the claim means a concurrent refresh with
      // the same token won it; drop ours and answer like that one did (grace) on the next pass.
      const next = await this.mintRefresh(user, seen.row.familyId);
      if (await sessions.claim(jti, next.id)) return { ...(await this.issue(user, { refresh: false })), refreshToken: next.token };
      await sessions.discard(next.id);
    }
    throw new UnauthorizedException('Session has been revoked.');
  }

  /**
   * Every account switched off by an admin (customers:setActive, staff:setActive, a fraud block) and every deleted
   * account must not get new sessions. Department admins included (audit AD-03).
   */
  assertNotSuspended(user: User): void {
    assertActiveAccount(user);
  }

  /**
   * Change password, keep the current device signed in, sign out all others: their refresh tokens are revoked and their
   * open sockets closed now (all but `keepSocketId`, the socket that asked).
   */
  async changePassword(userId: string, current: string, next: string, keepSocketId?: string): Promise<AuthResult> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('Account no longer exists.');
    if (!(await bcrypt.compare(current ?? '', user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect.');
    }
    if (!next || next.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters.');
    }
    user.passwordHash = await bcrypt.hash(next, 12);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.users.save(user);
    await this.sessions?.endSessions(user.id, { exceptSocketId: keepSocketId });
    return this.issue(user);
  }

  /**
   * Sign out every other device of the account and hand THIS one fresh tokens (two-factor turned on or off). The socket
   * `keepSocketId` stays open; it re-authenticates with the new access token when its current one runs out.
   */
  async revokeOthersAndReissue(userId: string, keepSocketId?: string): Promise<AuthResult> {
    if (!this.sessions) throw new UnauthorizedException('Sessions are not available.');
    await this.sessions.revoke(userId, { exceptSocketId: keepSocketId });
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('Account no longer exists.');
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
    // The refresh tokens die with the token version; the caller closes the open sockets once its answer is out.
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

  /**
   * Invalidate every token previously issued to this user ("sign out everywhere"): REST, refresh and open sockets alike
   * (the sockets are closed now, see {@link SessionsService.revoke}).
   */
  async revokeSessions(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('Account no longer exists.');
    if (this.sessions) return this.sessions.revoke(userId);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.users.save(user);
  }

  private claims(user: User): JwtPayload {
    return { sub: user.id, role: user.role, email: user.email, tokenVersion: user.tokenVersion ?? 0 };
  }

  /** A new sign-in: an access token and a refresh token that starts a new family (or an untracked one without sessions). */
  private async issue(user: User, opts: { refresh?: boolean } = {}): Promise<AuthResult> {
    const accessToken = await this.jwt.signAsync({ ...this.claims(user), typ: 'access' }, {
      secret: this.config.get<string>('jwt.secret'),
      // `expiresIn` accepts vercel/ms strings ("15m") at runtime; the typing
      // wants a template-literal union, so widen from the env string.
      expiresIn: this.config.get<string>('jwt.accessTtl') as unknown as number,
    });
    if (opts.refresh === false) return { user: UsersService.toPublic(user), accessToken, refreshToken: '' };
    const refreshToken = this.sessions
      ? (await this.mintRefresh(user, this.sessions.newId())).token
      : await this.jwt.signAsync({ ...this.claims(user), typ: 'refresh' }, {
          secret: this.config.get<string>('jwt.refreshSecret'),
          expiresIn: this.config.get<string>('jwt.refreshTtl') as unknown as number,
        });
    return { user: UsersService.toPublic(user), accessToken, refreshToken };
  }

  /** Sign a tracked refresh token in `familyId` and remember it. */
  private async mintRefresh(user: User, familyId: string): Promise<{ id: string; token: string }> {
    const sessions = this.sessions as SessionsService;
    const id = sessions.newId();
    const token = await this.jwt.signAsync({ ...this.claims(user), typ: 'refresh', jti: id }, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn: this.config.get<string>('jwt.refreshTtl') as unknown as number,
    });
    const exp = (this.jwt.decode<JwtPayload>(token)?.exp ?? 0) * 1000;
    await sessions.record({ id, userId: user.id, familyId, expiresAt: new Date(exp) });
    return { id, token };
  }

  /** The refresh token for an existing record (handed out again inside the grace window): same id, same expiry. */
  private async signRefresh(user: User, id: string, expiresAt: Date): Promise<string> {
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = Math.floor(new Date(expiresAt).getTime() / 1000);
    return this.jwt.signAsync({ ...this.claims(user), typ: 'refresh', jti: id }, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn: Math.max(1, expSec - nowSec),
    });
  }
}
