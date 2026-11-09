import { Optional } from '@nestjs/common';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server } from 'socket.io';
import { SettingsService } from '../content/settings.service';
import { AuditService } from '../ops/audit.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { SellerContextService } from '../sellers/seller-context';
import { fail, ok, requireUser } from '../sellers/gateway-support';
import type { AuthedSocket } from '../sellers/gateway-support';
import { UsersService } from '../users/users.service';
import { TwoFaService } from './twofa.service';
import { AuthService } from './auth.service';
import { StaffTwoFaPolicy, isStaff2faRole } from './staff-twofa';

/**
 * Two-factor authentication events (docs/contracts/seller-platform.md §2). Same Socket.IO server as RealtimeGateway.
 * The sign-in step itself is REST: `POST /api/v1/auth/login` -> `{ needs2fa, challenge }` -> `POST /api/v1/auth/login/2fa`.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class TwoFaGateway {
  constructor(
    private readonly twofa: TwoFaService,
    private readonly users: UsersService,
    private readonly settings: SettingsService,
    private readonly sellerCtx: SellerContextService,
    private readonly staffPolicy: StaffTwoFaPolicy,
    private readonly audit: AuditService,
    // Turning two-factor on or off signs out the account's other devices; this one gets fresh tokens (audit A-02, A-22).
    @Optional() private readonly auth?: AuthService,
  ) {}

  /** Other devices signed out (refresh tokens revoked, sockets closed); fresh tokens for the device that asked. */
  private async signOutOthers(userId: string, client: AuthedSocket) {
    return this.auth ? this.auth.revokeOthersAndReissue(userId, client.id) : {};
  }

  @WebSocketServer()
  server: Server;

  /** Is two-factor authentication mandatory for this account? (seller owners and staff, when the platform switched it on). */
  private async required(userId: string, role: string): Promise<boolean> {
    if (isStaff2faRole(role)) return this.staffPolicy.required(role);
    if (role !== 'seller' || (await this.settings.get('seller2faRequired')) !== 'true') return false;
    return (await this.sellerCtx.membership(userId))?.member === 'owner';
  }

  @SubscribeMessage('auth:2fa:status')
  async status(@ConnectedSocket() client: AuthedSocket) {
    try {
      const u = requireUser(client);
      const row = await this.users.findById(u.id);
      if (!row) return fail('Account not found.');
      return ok({ ...this.twofa.status(row), required: await this.required(u.id, u.role), requiredFor: isStaff2faRole(u.role) ? 'staff' : u.role === 'seller' ? 'seller' : null });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ secret, otpauthUrl }`: show the QR code of `otpauthUrl` (or the secret to type), then call `auth:2fa:enable`. */
  @SubscribeMessage('auth:2fa:setup')
  async setup(@ConnectedSocket() client: AuthedSocket) {
    try {
      return ok(await this.twofa.setup(requireUser(client).id));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /**
   * `{ code }`: the first 6-digit code. Returns `{ enabled: true, recoveryCodes, accessToken, refreshToken, user }`; the
   * codes are shown only once, and the tokens replace the stored ones (every other device was signed out).
   */
  @SubscribeMessage('auth:2fa:enable')
  async enable(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { code?: string }) {
    try {
      const u = requireUser(client);
      const done = await this.twofa.enable(u.id, String(body?.code ?? ''));
      return ok({ ...done, ...(await this.signOutOthers(u.id, client)) });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ code }`: a current code or a recovery code. Refused while the platform requires it for this account. Signs out the other devices. */
  @SubscribeMessage('auth:2fa:disable')
  async disable(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { code?: string }) {
    try {
      const u = requireUser(client);
      if (await this.required(u.id, u.role)) {
        return fail(isStaff2faRole(u.role) ? 'Two-factor authentication is required for staff accounts and cannot be turned off.' : 'Two-factor authentication is required for seller accounts and cannot be turned off.');
      }
      const done = await this.twofa.disable(u.id, String(body?.code ?? ''));
      // Fresh tokens for this device (`accessToken`, `refreshToken`, `user`): every other device was signed out.
      return ok({ ...done, ...(await this.signOutOthers(u.id, client)) });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ code }`: new recovery codes (the old ones stop working). */
  @SubscribeMessage('auth:2fa:recovery')
  async recovery(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { code?: string }) {
    try {
      return ok(await this.twofa.regenerateRecovery(requireUser(client).id, String(body?.code ?? '')));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /**
   * `{ userId }`: the super admin switches off another staff member's two-factor authentication (lost phone and recovery
   * codes). The person is signed out everywhere and must set it up again; the reset is audited and the person is told.
   */
  @SubscribeMessage('auth:2fa:reset')
  async reset(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { userId?: string }) {
    try {
      const u = requireUser(client);
      const done = await this.twofa.resetForStaff(u, String(body?.userId ?? ''));
      await this.audit.record({ actor: u.name, role: u.role, action: 'staff.2fa.reset', entity: 'user', entityId: done.id, detail: `${done.role} ${done.email}` });
      this.server?.in(RealtimeEmitter.userRoom(done.id)).disconnectSockets(true); // their open sessions end now
      return ok({ id: done.id, twofaEnabled: false });
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
