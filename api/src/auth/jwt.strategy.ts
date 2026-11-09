import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { assertActiveAccount, assertTokenKind, JwtPayload } from './auth.service';

/**
 * REST bearer tokens. A signature and an expiry are not enough (audit A-02 / A-16): an access token stops working the
 * moment its sessions are revoked (sign out everywhere, password reset or change, 2FA change, role change, suspension,
 * deletion), exactly like the socket handshake and the refresh endpoint already check.
 *
 * Cost: one primary-key lookup of the account per REST call, no cache. REST is the small surface here (sign-in,
 * verification, uploads and private file downloads; everything else runs over the socket), the private-file and
 * delivery-proof downloads already do the same lookup per request, and a cache would let a revoked token through on
 * every API instance until it expired from the cache.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret')!,
    });
  }

  // Whatever this returns becomes `request.user`.
  async validate(payload: JwtPayload) {
    assertTokenKind(payload, 'access'); // a 2FA challenge or a refresh token is not an access token
    const user = await this.users.findById(payload.sub);
    if (!user || (payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) throw new UnauthorizedException('Session has been revoked.');
    assertActiveAccount(user);
    // The role as it is now (a role change also revokes the token, so this only matters for a race).
    // Still on a temporary password: read from the account itself, so the hold lifts the moment it is changed.
    return { id: user.id, role: user.role, email: user.email, ...(user.mustChangePassword ? { mustChangePassword: true } : {}) };
  }
}
