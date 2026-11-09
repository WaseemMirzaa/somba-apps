import { ForbiddenException, SetMetadata } from '@nestjs/common';

/**
 * Accounts an administrator created (and accounts whose temporary password an administrator re-issued) carry
 * `users.mustChangePassword`. Until the person picks a password of their own, the server answers everything except the
 * few calls below with this code. It is enforced ONCE per transport, not per event:
 *  - sockets: `guardPasswordChange` below, a Socket.IO packet middleware registered by `SocketIoAdapter` for every gateway;
 *  - REST: `JwtAuthGuard` (the access token carries `pwc: true` while the flag is set), with `@AllowPendingPasswordChange()`
 *    marking the routes that stay open.
 * Clients act on `code`, not on the wording.
 */
export const PASSWORD_CHANGE_REQUIRED = 'password_change_required';

export const PASSWORD_CHANGE_MESSAGE = 'You must set a new password before you can continue.';

/**
 * The only socket events open while the flag is set: change the password, read the own profile, and what signing out
 * does (drop the push registration). `ready` and the profile already carry `mustChangePassword`.
 */
export const PASSWORD_CHANGE_OPEN_EVENTS: readonly string[] = ['me:changePassword', 'me:get', 'devices:unregister'];

/** Marks a REST route that stays open while the password change is pending (own profile, sign out). */
export const ALLOW_PENDING_PASSWORD_CHANGE = 'allowPendingPasswordChange';
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE, true);

export const passwordChangeRequired = () => new ForbiddenException({ statusCode: 403, error: 'Forbidden', message: PASSWORD_CHANGE_MESSAGE, code: PASSWORD_CHANGE_REQUIRED });

/** What a socket must offer for {@link guardPasswordChange} (a Socket.IO `Socket`). */
export interface PasswordChangeSocket {
  data?: { user?: { id: string; role: string; mustChangePassword?: boolean } };
  use(fn: (packet: unknown[], next: (err?: Error) => void) => void): unknown;
}

/**
 * Refuses every event of a socket whose account must change its password, except {@link PASSWORD_CHANGE_OPEN_EVENTS}.
 * The flag is read from the account at the handshake (`socket.data.user.mustChangePassword`) and cleared by the
 * `me:changePassword` handler on that socket; a re-issued password ends every socket of the person, so a stale
 * "false" cannot outlive it. A refused event is answered through its ack as
 * `{ ok: false, error, code: 'password_change_required' }` and never reaches a handler.
 */
export function guardPasswordChange(socket: PasswordChangeSocket): void {
  socket.use((packet, next) => {
    const user = socket.data?.user;
    if (!user?.mustChangePassword) return next();
    const [event, ...rest] = packet;
    if (PASSWORD_CHANGE_OPEN_EVENTS.includes(String(event))) return next();
    const ack = [...rest].reverse().find((x) => typeof x === 'function') as ((r: unknown) => void) | undefined;
    ack?.({ ok: false, error: PASSWORD_CHANGE_MESSAGE, code: PASSWORD_CHANGE_REQUIRED });
  });
}
