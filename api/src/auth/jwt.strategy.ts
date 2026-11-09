import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { assertTokenKind, JwtPayload } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret')!,
    });
  }

  // Whatever this returns becomes `request.user`.
  validate(payload: JwtPayload) {
    assertTokenKind(payload, 'access'); // a 2FA challenge or a refresh token is not an access token
    return { id: payload.sub, role: payload.role, email: payload.email };
  }
}
