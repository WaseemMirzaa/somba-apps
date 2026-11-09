import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import type { Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { limitSocket } from '../common/socket-limit';
import { User } from '../database/entities';
import { Actor } from '../logistics/logistics.service';
import { tierOf } from '../logistics/tiers';
import { RIDER_COMPLIANCE_ADMINS, RiderComplianceService } from './rider-compliance.service';

type AuthedSocket = Socket & { data: { user?: { id: string; role: string; name: string } } };

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (error: string) => ({ ok: false as const, error });

/**
 * Rider vehicle and compliance documents (docs/contracts/rider-compliance.md). A separate gateway on the same Socket.IO server as
 * RealtimeGateway (which authenticates the socket and sets `client.data.user`).
 *
 * A rider: `rider:vehicle`, `rider:documents`, `rider:documentUpload` (their own, nobody else's).
 * Staff: `riderCompliance:get`, `riderCompliance:updateVehicle`, `riderCompliance:reviewDocument`. An operations admin reaches every
 * rider, a warehouse supervisor or manager the riders of their own warehouse; the service decides and audits. A document scan is
 * opened with the existing `private:link` event.
 *
 * Pushes: `rider:vehicle:updated` and `rider:document:updated` to the rider, `riderCompliance:updated { riderId }` to staff.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RiderComplianceGateway {
  constructor(
    private readonly svc: RiderComplianceService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  private rider(client: AuthedSocket): { id: string } {
    limitSocket(client);
    const u = client.data?.user;
    if (!u || u.role === 'guest') throw new Error('Sign in to continue.');
    if (u.role !== 'rider') throw new Error('Riders only.');
    return { id: u.id };
  }

  /** The caller as the desk sees them: role from the socket, warehouse and tier from the database (they can change while connected). */
  private async staff(client: AuthedSocket): Promise<Actor> {
    limitSocket(client);
    const u = client.data?.user;
    if (!u || u.role === 'guest') throw new Error('Sign in to continue.');
    if (u.role.startsWith('admin')) {
      // Riders' vehicles and documents: the Super Admin and Operations (`RIDER_COMPLIANCE_ADMINS`); no other admin department.
      if (!RIDER_COMPLIANCE_ADMINS.includes(u.role)) throw new Error('Not allowed.');
      return { id: u.id, role: u.role, name: u.name, hubId: null, tier: null };
    }
    if (u.role !== 'warehouse_staff') throw new Error('Not allowed.');
    const row = await this.users.findOne({ where: { id: u.id }, select: ['id', 'hubId', 'warehouseTier', 'active'] });
    if (!row?.hubId || row.active === false) throw new Error('Your account is not linked to a warehouse. Ask an administrator.');
    return { id: u.id, role: u.role, name: u.name, hubId: row.hubId, tier: tierOf(row.warehouseTier) };
  }

  /** The rider's own vehicle (all fields null until staff save it). */
  @SubscribeMessage('rider:vehicle')
  async vehicle(@ConnectedSocket() client: AuthedSocket) {
    try {
      return ok(await this.svc.mineVehicle(this.rider(client).id));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The rider's own documents, newest first, each with its status and expiry state. */
  @SubscribeMessage('rider:documents')
  async documents(@ConnectedSocket() client: AuthedSocket) {
    try {
      return ok(await this.svc.mineDocuments(this.rider(client).id));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ type, number?, expiresOn?, fileId }`: send a document whose scan was uploaded to `POST /api/v1/private-uploads`. Starts pending. */
  @SubscribeMessage('rider:documentUpload')
  async upload(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: unknown) {
    try {
      return ok(await this.svc.upload(this.rider(client).id, body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ riderId }`: the rider's vehicle and documents. */
  @SubscribeMessage('riderCompliance:get')
  async get(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { riderId?: string }) {
    try {
      return ok(await this.svc.staffView(await this.staff(client), body?.riderId));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ riderId, model?, type?, plate?, colour?, odometerKm?, fuel?, insuranceValidUntil?, lastServiceOn?, nextServiceOn? }`. */
  @SubscribeMessage('riderCompliance:updateVehicle')
  async updateVehicle(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: Record<string, unknown>) {
    try {
      const { riderId, ...patch } = body ?? {};
      return ok(await this.svc.updateVehicle(await this.staff(client), riderId, patch));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ id, decision: 'approve' | 'reject', reason? }`: a rejection needs a reason. */
  @SubscribeMessage('riderCompliance:reviewDocument')
  async review(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { id?: string; decision?: string; reason?: string }) {
    try {
      return ok(await this.svc.review(await this.staff(client), body?.id, body?.decision, body?.reason));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
