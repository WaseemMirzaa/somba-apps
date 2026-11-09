import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ALLOW_PENDING_PASSWORD_CHANGE, passwordChangeRequired } from './password-change';

/**
 * Guards REST routes with a Bearer access token. While the account must change its temporary password (the token
 * carries `pwc`), only routes marked `@AllowPendingPasswordChange()` are open; the rest answer 403 `password_change_required`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  handleRequest<T = { mustChangePassword?: boolean }>(err: unknown, user: T, info: unknown, context: ExecutionContext, status?: unknown): T {
    const authed = super.handleRequest(err, user, info, context, status as never) as T;
    if ((authed as { mustChangePassword?: boolean }).mustChangePassword) {
      const open = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_CHANGE, [context.getHandler(), context.getClass()]);
      if (!open) throw passwordChangeRequired();
    }
    return authed;
  }
}
