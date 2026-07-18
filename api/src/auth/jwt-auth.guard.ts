import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Guards REST routes with a Bearer access token. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
