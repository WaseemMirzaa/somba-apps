import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting, User } from '../database/entities';

/** The staff the platform setting `requireStaffTwoFactor` applies to: the super admin and the five department admins. */
export const STAFF_2FA_ROLES: readonly string[] = ['admin', 'admin_operations', 'admin_finance', 'admin_support', 'admin_marketing', 'admin_moderation'];
export const isStaff2faRole = (role: string | null | undefined): boolean => STAFF_2FA_ROLES.includes(role ?? '');

/**
 * The exact socket events a staff member without two-factor authentication may still use while the platform requires it:
 * enrolling (status, setup, enable), their own profile and password, the bell, push registration and reading settings.
 * Nothing else under `auth:` is open: `auth:2fa:reset` (super admin only) and `auth:2fa:disable` / `recovery` (they need
 * an enrolled account) wait until the person has enrolled.
 */
export const STAFF_2FA_OPEN_EVENTS: readonly string[] = [
  'auth:2fa:status',
  'auth:2fa:setup',
  'auth:2fa:enable',
  'me:get',
  'me:update',
  'me:prefs',
  'me:setPrefs',
  'me:changePassword',
  'notifications:list',
  'notifications:markRead',
  'notifications:markAllRead',
  'devices:register',
  'devices:unregister',
  'settings:get',
  // Renewing the socket's access token (A-02): without it a staff member held at enrolment would be disconnected every 15 minutes.
  'auth:reauth',
];

export const STAFF_2FA_REQUIRED_MESSAGE = 'Two-factor authentication is required for staff accounts. Turn it on under Account > Security to continue.';

/**
 * The platform's two-factor rule for staff. `requireStaffTwoFactor` (a setting, off by default): when on, an admin account
 * without two-factor authentication can sign in but can only reach the events that let it enrol (see STAFF_2FA_OPEN_EVENTS).
 */
@Injectable()
export class StaffTwoFaPolicy {
  constructor(
    @InjectRepository(Setting) private readonly settings: Repository<Setting>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** Does the platform require two-factor authentication from this role right now? */
  async required(role: string | null | undefined): Promise<boolean> {
    if (!isStaff2faRole(role)) return false;
    return (await this.settings.findOne({ where: { key: 'requireStaffTwoFactor' } }))?.value === 'true';
  }

  /** Is this staff member held at enrolment (required, and not enrolled)? */
  async mustEnrol(userId: string, role: string | null | undefined): Promise<boolean> {
    if (!(await this.required(role))) return false;
    const row = await this.users.findOne({ where: { id: userId }, select: { id: true, twofaEnabled: true } });
    return !row?.twofaEnabled;
  }

  /** Has this account two-factor authentication on? */
  async enrolled(userId: string): Promise<boolean> {
    return !!(await this.users.findOne({ where: { id: userId }, select: { id: true, twofaEnabled: true } }))?.twofaEnabled;
  }

  /**
   * Why a socket event from this staff member must be refused, or null to let it through:
   *  - only the super admin may change `requireStaffTwoFactor`, and may turn it on only once their own account has two-factor on
   *    (or they would lock themselves out);
   *  - while the platform requires it, staff without it reach only the enrolment events.
   */
  async refusal(user: { id: string; role: string }, event: string, body: unknown): Promise<string | null> {
    if (!isStaff2faRole(user.role)) return null;
    // Same key the `settings:set` handler uses (`String(body.key)`), so an array or other wrapper cannot slip past this check.
    if (event === 'settings:set' && String((body as { key?: unknown } | null)?.key ?? '') === 'requireStaffTwoFactor') {
      if (user.role !== 'admin') return 'Only the super admin can change the staff two-factor requirement.';
      if (String((body as { value?: unknown }).value) === 'true' && !(await this.enrolled(user.id))) {
        return 'Turn on two-factor authentication on your own account first, or this requirement would lock you out.';
      }
      // Switching it off is no way round the rule: a super admin held at enrolment enrols first (the hold check below).
    } else if (STAFF_2FA_OPEN_EVENTS.includes(event)) {
      return null;
    }
    return (await this.mustEnrol(user.id, user.role)) ? STAFF_2FA_REQUIRED_MESSAGE : null;
  }
}

/** What a socket must offer for {@link guardStaffTwoFa} (a Socket.IO `Socket`). */
export interface GuardableSocket {
  data?: { user?: { id: string; role: string } };
  use(fn: (packet: unknown[], next: (err?: Error) => void) => void): unknown;
}

/**
 * Applies {@link StaffTwoFaPolicy} to every event a socket sends, whichever gateway handles it: a Socket.IO packet
 * middleware, registered once for each connection by `SocketIoAdapter` (gateway interceptors are per gateway, and there
 * are twenty of them). A refused event is answered through its ack as `{ ok: false, error, code: 'twofa_required' }`
 * and never reaches a handler. Only admin roles are looked at; everyone else passes untouched.
 */
export function guardStaffTwoFa(socket: GuardableSocket, getPolicy: () => StaffTwoFaPolicy | undefined): void {
  socket.use((packet, next) => {
    const user = socket.data?.user;
    const policy = getPolicy();
    if (!user || !policy || !isStaff2faRole(user.role)) return next();
    const [event, ...rest] = packet;
    const ack = [...rest].reverse().find((x) => typeof x === 'function') as ((r: unknown) => void) | undefined;
    const body = typeof rest[0] === 'function' ? undefined : rest[0];
    policy.refusal(user, String(event), body).then(
      (why) => {
        if (!why) return next();
        ack?.({ ok: false, error: why, code: 'twofa_required' });
      },
      () => ack?.({ ok: false, error: 'Could not check your account security. Try again.' }),
    );
  });
}
