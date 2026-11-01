import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { User } from '../database/entities';
import { callerLocale } from '../common/locale';
import { limitSocket } from '../common/socket-limit';
import { sellerContext } from '../sellers/seller-context';
import { FinanceService } from './finance.service';
import { financeVersion } from './finance-version';

type AuthedSocket = Socket & { data: { user?: { id: string; role: string; name?: string } } };

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (error: string) => ({ ok: false as const, error });

/** Where the socket was opened, for building absolute links to generated files. */
function originOf(client: AuthedSocket): string {
  const h = client.handshake?.headers ?? {};
  const host = String(h['x-forwarded-host'] ?? h.host ?? '');
  if (!host) return '';
  const proto = String(h['x-forwarded-proto'] ?? 'http').split(',')[0].trim();
  return `${proto}://${host}`;
}

/**
 * Seller finance events (earnings with the clearance hold, monthly statements, transactions, commission invoices)
 * on the same Socket.IO server as RealtimeGateway. A seller reads their own store; admin / admin_finance may pass
 * `sellerId` (the store id) to read any store.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class FinanceGateway {
  constructor(
    private readonly finance: FinanceService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  /**
   * Finance staff as themselves; a seller account (the owner or a team member whose role may see finance) as the store
   * OWNER. Everything here only reads or issues a document, so it stays open to a suspended store.
   */
  private async user(client: AuthedSocket): Promise<{ id: string; role: string }> {
    limitSocket(client);
    const u = client.data?.user;
    if (!u || u.role === 'guest') throw new Error('Sign in to continue.');
    if (u.role === 'admin' || u.role === 'admin_finance') return u;
    if (u.role !== 'seller') throw new Error('Not allowed.');
    return (await sellerContext({ id: u.id, role: u.role, name: u.name ?? '' }, 'finance', { write: false })).actor;
  }

  /** The language of the files we build: the request's `locale`, else the real caller's saved language (not the owner's). */
  private csvInput(client: AuthedSocket, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const input = body ?? {};
    if (input.format !== 'csv') return Promise.resolve(input);
    return callerLocale(this.ds.getRepository(User), client.data?.user?.id, input.locale).then((locale) => ({ ...input, locale }));
  }

  /** The rules the seller's money follows: commission %, minimum payout, hold hours. */
  @SubscribeMessage('finance:settings')
  async settings(@ConnectedSocket() client: AuthedSocket) {
    try {
      await this.user(client);
      return ok(await this.finance.sellerSettings());
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Earnings by line with state and `clearanceEndsAt`: `{ limit?, offset?, from?, to?, state?, q? }`. */
  @SubscribeMessage('finance:earnings')
  async earnings(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: Record<string, unknown>) {
    try {
      return ok(await this.finance.earnings(await this.user(client), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ month: '2026-10', format?: 'csv' }`; without a month, the last 12 months. */
  @SubscribeMessage('finance:statements')
  async statements(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: Record<string, unknown>) {
    try {
      const user = await this.user(client);
      return ok(await this.finance.statements(user, await this.csvInput(client, body)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ limit?, offset?, from?, to?, format?: 'csv' }` */
  @SubscribeMessage('finance:transactions')
  async transactions(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: Record<string, unknown>) {
    try {
      const user = await this.user(client);
      return ok(await this.finance.transactions(user, await this.csvInput(client, body)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The invoices issued so far, and which of the last 12 months had sales. */
  @SubscribeMessage('finance:taxDocuments')
  async taxDocuments(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: Record<string, unknown>) {
    try {
      return ok(await this.finance.taxDocuments(await this.user(client), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Issue the commission invoice (PDF) of a month: `{ period: '2026-10', locale? }`. */
  @SubscribeMessage('finance:taxDocument')
  async taxDocument(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: Record<string, unknown>) {
    try {
      return ok(await this.finance.taxDocument(await this.user(client), body ?? {}, originOf(client)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Finance staff: the cheap fingerprint of the finance figures (`analytics:finance` carries the same two fields). */
  @SubscribeMessage('finance:version')
  async version(@ConnectedSocket() client: AuthedSocket) {
    try {
      limitSocket(client);
      const u = client.data?.user;
      if (!u || (u.role !== 'admin' && u.role !== 'admin_finance')) throw new Error('Not allowed.');
      return ok(await financeVersion(this.ds.manager));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
