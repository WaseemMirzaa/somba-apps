import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { SettingsService } from '../content/settings.service';
import { SellerContextService } from '../sellers/seller-context';
import { fail, ok, requireUser } from '../sellers/gateway-support';
import type { AuthedSocket } from '../sellers/gateway-support';
import { UsersService } from '../users/users.service';
import { TwoFaService } from './twofa.service';

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
  ) {}

  /** Is two-factor authentication mandatory for this account? (seller owners, when the platform switched it on). */
  private async required(userId: string, role: string): Promise<boolean> {
    if (role !== 'seller' || (await this.settings.get('seller2faRequired')) !== 'true') return false;
    return (await this.sellerCtx.membership(userId))?.member === 'owner';
  }

  @SubscribeMessage('auth:2fa:status')
  async status(@ConnectedSocket() client: AuthedSocket) {
    try {
      const u = requireUser(client);
      const row = await this.users.findById(u.id);
      if (!row) return fail('Account not found.');
      return ok({ ...this.twofa.status(row), required: await this.required(u.id, u.role) });
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

  /** `{ code }`: the first 6-digit code. Returns `{ enabled: true, recoveryCodes }`; the codes are shown only once. */
  @SubscribeMessage('auth:2fa:enable')
  async enable(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { code?: string }) {
    try {
      return ok(await this.twofa.enable(requireUser(client).id, String(body?.code ?? '')));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ code }`: a current code or a recovery code. Refused while the platform requires it for this account. */
  @SubscribeMessage('auth:2fa:disable')
  async disable(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { code?: string }) {
    try {
      const u = requireUser(client);
      if (await this.required(u.id, u.role)) return fail('Two-factor authentication is required for seller accounts and cannot be turned off.');
      return ok(await this.twofa.disable(u.id, String(body?.code ?? '')));
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
}
