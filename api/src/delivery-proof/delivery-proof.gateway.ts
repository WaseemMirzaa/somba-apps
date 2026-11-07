import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { limitSocket } from '../common/socket-limit';
import { AuditService } from '../ops/audit.service';
import { DeliveryProofService } from './delivery-proof.service';

type AuthedSocket = Socket & { data: { user?: { id: string; role: string; name?: string } } };

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (error: string) => ({ ok: false as const, error });

/**
 * `deliveryProof:get` `{ taskId }` (staff): the proof of a delivered leg as 5-minute signed links,
 * `{ photoUrl, signatureUrl, capturedAt, expiresAt }` (a part that was not captured is `null`), or `data: null` when the
 * delivery has no proof. Admins of operations and support and the warehouse staff of the task's warehouse only; every
 * opening is recorded in the audit log (a customer's signature is personal data).
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class DeliveryProofGateway {
  constructor(
    private readonly proofs: DeliveryProofService,
    private readonly audit: AuditService,
  ) {}

  @SubscribeMessage('deliveryProof:get')
  async get(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { taskId?: string }) {
    try {
      limitSocket(client);
      const u = client.data?.user;
      if (!u || u.role === 'guest') return fail('Sign in to continue.');
      const host = client.handshake.headers.host;
      const proto = (client.handshake.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
      const origin = process.env.PUBLIC_API_URL ?? (host ? `${proto}://${host}` : '');
      const taskId = String(body?.taskId ?? '');
      const links = await this.proofs.links({ id: u.id, role: u.role }, taskId, origin);
      if (links) {
        await this.audit
          .record({ actor: u.name ?? u.id, role: u.role, action: 'delivery.proof_viewed', entity: 'delivery', entityId: taskId, detail: 'Opened the proof of delivery.' })
          .catch(() => undefined);
      }
      return ok(links);
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
