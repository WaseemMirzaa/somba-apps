import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import type { Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { limitSocket } from '../common/socket-limit';
import { User } from '../database/entities';
import { Actor } from '../logistics/logistics.service';
import { tierOf } from '../logistics/tiers';
import { WarehouseStockService } from './warehouse-stock.service';

type AuthedSocket = Socket & { data: { user?: { id: string; role: string; name: string } } };
type Body = Record<string, unknown>;

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (error: string) => ({ ok: false as const, error });

/**
 * The warehouse stock ledger (WS-C): bins, on-hand by SKU and bin, receiving (from a scanned parcel or by hand), moves, cycle
 * counts, stock-outs and the history. Same Socket.IO server as RealtimeGateway (which authenticates the socket and sets
 * `client.data.user`). Staff act on THEIR warehouse and the tier is enforced by {@link WarehouseStockService}; admins name a
 * warehouse (`hubId`), and only `admin` / `admin_operations` may change stock. Every event answers `{ ok, data | error }`.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class WarehouseStockGateway {
  constructor(
    private readonly stock: WarehouseStockService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** The caller as the desk sees them: role from the socket, warehouse and tier from the database (they can change while connected). */
  private async actor(client: AuthedSocket): Promise<Actor> {
    limitSocket(client);
    const u = client.data?.user;
    if (!u || u.role === 'guest') throw new Error('Sign in to continue.');
    if (u.role.startsWith('admin')) return { id: u.id, role: u.role, name: u.name, hubId: null, tier: null };
    if (u.role !== 'warehouse_staff') throw new Error('Staff only.');
    const row = await this.users.findOne({ where: { id: u.id }, select: ['id', 'hubId', 'warehouseTier', 'active'] });
    if (!row?.hubId || row.active === false) throw new Error('Your account is not linked to a warehouse. Ask an administrator.');
    return { id: u.id, role: u.role, name: u.name, hubId: row.hubId, tier: tierOf(row.warehouseTier) };
  }

  private async run<T>(client: AuthedSocket, fn: (a: Actor) => Promise<T>) {
    try {
      return ok(await fn(await this.actor(client)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('stock:bins')
  bins(@ConnectedSocket() c: AuthedSocket, @MessageBody() b?: Body) {
    return this.run(c, (a) => this.stock.listBins(a, b ?? {}));
  }

  /** Supervisor+: `{ hubId?, code, label? }`. */
  @SubscribeMessage('stock:binCreate')
  binCreate(@ConnectedSocket() c: AuthedSocket, @MessageBody() b: Body) {
    return this.run(c, (a) => this.stock.createBin(a, b ?? {}));
  }

  /** Supervisor+: `{ hubId?, binId, label?, active? }` (a bin that holds stock cannot be switched off). */
  @SubscribeMessage('stock:binUpdate')
  binUpdate(@ConnectedSocket() c: AuthedSocket, @MessageBody() b: Body) {
    return this.run(c, (a) => this.stock.updateBin(a, b ?? {}));
  }

  /** `{ hubId?, search?, binId?, productId?, limit?, offset? }` -> `{ total, units, rows: [{ sku, name, variant, onHand, bins }] }`. */
  @SubscribeMessage('stock:onHand')
  onHand(@ConnectedSocket() c: AuthedSocket, @MessageBody() b?: Body) {
    return this.run(c, (a) => this.stock.onHand(a, b ?? {}));
  }

  /** The ledger, newest first: `{ hubId?, productId?, variant?, binId?, kind?, orderId?, limit?, offset? }`. */
  @SubscribeMessage('stock:history')
  history(@ConnectedSocket() c: AuthedSocket, @MessageBody() b?: Body) {
    return this.run(c, (a) => this.stock.history(a, b ?? {}));
  }

  /** A scanned or typed code: `{ hubId?, code }` -> the bin it names and the products it matches (SKU label, id or name). */
  @SubscribeMessage('stock:lookup')
  lookup(@ConnectedSocket() c: AuthedSocket, @MessageBody() b: Body) {
    return this.run(c, (a) => this.stock.lookup(a, b ?? {}));
  }

  /** What a parcel carries and what of it is already in stock: `{ hubId?, taskId }`. */
  @SubscribeMessage('stock:parcel')
  parcel(@ConnectedSocket() c: AuthedSocket, @MessageBody() b: Body) {
    return this.run(c, (a) => this.stock.parcel(a, b ?? {}));
  }

  /** Put a scanned-in parcel away: `{ hubId?, taskId, binId?|binCode?, lines?: [{ productId, variant?, qty }], note?, clientRef? }`. */
  @SubscribeMessage('stock:receiveParcel')
  receiveParcel(@ConnectedSocket() c: AuthedSocket, @MessageBody() b: Body) {
    return this.run(c, (a) => this.stock.receiveParcel(a, b ?? {}));
  }

  /** A manual receipt: `{ hubId?, productId, variant?, qty, binId?|binCode?, reason?, note?, clientRef? }`. */
  @SubscribeMessage('stock:receive')
  receive(@ConnectedSocket() c: AuthedSocket, @MessageBody() b: Body) {
    return this.run(c, (a) => this.stock.receive(a, b ?? {}));
  }

  /** Between bins: `{ hubId?, productId, variant?, qty, fromBinId?|fromBinCode?, toBinId?|toBinCode?, note?, clientRef? }`. */
  @SubscribeMessage('stock:move')
  move(@ConnectedSocket() c: AuthedSocket, @MessageBody() b: Body) {
    return this.run(c, (a) => this.stock.move(a, b ?? {}));
  }

  /** Units leave by hand: `{ hubId?, productId, variant?, qty, binId?|binCode?, reason, note?, clientRef? }` (never below zero). */
  @SubscribeMessage('stock:out')
  out(@ConnectedSocket() c: AuthedSocket, @MessageBody() b: Body) {
    return this.run(c, (a) => this.stock.stockOut(a, b ?? {}));
  }

  /** Supervisor+: `{ hubId?, binId?|binCode?, lines: [{ productId, variant?, counted, expected? }], note?, clientRef? }` -> the variance per line. */
  @SubscribeMessage('stock:count')
  count(@ConnectedSocket() c: AuthedSocket, @MessageBody() b: Body) {
    return this.run(c, (a) => this.stock.count(a, b ?? {}));
  }
}
