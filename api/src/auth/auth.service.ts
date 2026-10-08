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

export interface JwtPayload {
  sub: string;
  role: string;
  email: string;
  tokenVersion?: number;
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

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid email or password.');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid email or password.');
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
    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedException('Account no longer exists.');
    if ((payload.tokenVersion ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('Session has been revoked.');
    }
    this.assertNotSuspended(user);
    return this.issue(user);
  }

  /**
   * An admin-suspended CUSTOMER (customers:setActive false) must not get new
   * sessions. (`active` doubles as an availability toggle for riders/warehouse
   * staff, so only customers are hard-blocked here.)
   */
  assertNotSuspended(user: User): void {
    if (user.role === 'customer' && !user.active) {
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
    user.passwordHash = await bcrypt.hash(next, 12);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.users.save(user);
    return this.issue(user);
  }

  /**
   * Delete an account: personal data is erased and the login is destroyed, but
   * the row stays so past orders/payments remain consistent for accounting.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('Account no longer exists.');
    if (!(await bcrypt.compare(password ?? '', user.passwordHash))) {
      throw new BadRequestException('Password is incorrect.');
    }
    const tombstone = `deleted+${user.id}@deleted.invalid`;
    user.name = 'Deleted user';
    user.email = tombstone;
    user.emailHash = UsersService.emailHash(tombstone);
    user.phone = null;
    user.address = null;
    user.avatar = null;
    user.prefs = null;
    user.emailVerified = false;
    user.phoneVerified = false;
    user.passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    user.active = false;
    await this.users.save(user);
  }

  /** Verify an access token (used by the WebSocket handshake). */
  async verifyAccess(token: string): Promise<JwtPayload> {
    return this.jwt.verifyAsync<JwtPayload>(token, {
      secret: this.config.get<string>('jwt.secret'),
    });
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
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.secret'),
      // `expiresIn` accepts vercel/ms strings ("15m") at runtime; the typing
      // wants a template-literal union, so widen from the env string.
      expiresIn: this.config.get<string>('jwt.accessTtl') as unknown as number,
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn: this.config.get<string>('jwt.refreshTtl') as unknown as number,
    });
    return { user: UsersService.toPublic(user), accessToken, refreshToken };
  }
}
