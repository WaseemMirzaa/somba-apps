import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../common/decorators';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'somba-dev-secret'),
    });
  }

  /** Whatever this returns becomes `req.user`. */
  validate(payload: {
    sub: string;
    email: string;
    role: AuthUser['role'];
    name: string;
    sellerId?: string;
  }): AuthUser {
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      name: payload.name,
      sellerId: payload.sellerId,
    };
  }
}
