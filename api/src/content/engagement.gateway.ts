import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { oneOf } from '../common/validate';
import { AuditService } from '../ops/audit.service';
import { sellerContext } from '../sellers/seller-context';
import type { AuthedSocket, SocketUser } from '../sellers/gateway-support';
import { fail, ok, requireUser } from '../sellers/gateway-support';
import { ReviewsService, MODERATORS, publicQuestion } from './reviews.service';

/**
 * Reviews and product Q&A on the shared Socket.IO server (RealtimeGateway authenticates the socket).
 * See docs/contracts/after-sale.md.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class EngagementGateway {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly audit: AuditService,
  ) {}

  private canModerate(role: string) {
    return MODERATORS.includes(role);
  }

  /** The store ids a seller account (or a team member) works for. */
  private async storeIds(user: SocketUser, permission: 'support' | 'any' = 'support'): Promise<string[]> {
    const ctx = await sellerContext(user, permission, { write: false });
    return ctx.ownerIds;
  }

  // ---- Reviews ------------------------------------------------------------
  /** Public. Hidden (moderated) reviews are left out; moderators may pass `includeHidden`. */
  @SubscribeMessage('reviews:list')
  async list(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { productId: string; includeHidden?: boolean }) {
    const staff = this.canModerate(client.data.user?.role ?? 'guest');
    return ok(await this.reviews.listForProduct(String(body?.productId ?? ''), staff && body?.includeHidden === true));
  }

  /** All (visible) reviews across the signed-in seller's catalogue, with the seller reply. */
  @SubscribeMessage('reviews:seller')
  async seller(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { limit?: number; offset?: number }) {
    try {
      const user = requireUser(client);
      let ids: string[];
      try {
        ids = await this.storeIds(user);
      } catch {
        return ok([]);
      }
      return ok(await this.reviews.listForSeller(ids, body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The seller of the product (or an admin) answers a review in public. */
  @SubscribeMessage('reviews:reply')
  async reply(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { reviewId: string; text: string }) {
    try {
      const user = requireUser(client);
      if (user.role === 'seller') {
        const ctx = await sellerContext(user, 'support');
        return ok(await this.reviews.reply(ctx.actor, String(body?.reviewId ?? ''), body?.text));
      }
      if (!this.canModerate(user.role)) return fail('Not allowed.');
      return ok(await this.reviews.reply(user, String(body?.reviewId ?? ''), body?.text));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** A seller asks the moderators to look at a review of their product. */
  @SubscribeMessage('reviews:report')
  async report(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string; reviewId?: string; reason: string }) {
    try {
      const user = requireUser(client);
      if (user.role !== 'seller') return fail('Sellers only.');
      const ctx = await sellerContext(user, 'support');
      return ok(await this.reviews.report({ ...ctx.actor, name: user.name }, String(body?.id ?? body?.reviewId ?? ''), body?.reason));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Moderators: the reports filed against a review. */
  @SubscribeMessage('reviews:reports')
  async reports(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string; reviewId?: string }) {
    try {
      const user = requireUser(client);
      if (!this.canModerate(user.role)) return fail('Not allowed.');
      return ok(await this.reviews.listReports(String(body?.id ?? body?.reviewId ?? '')));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Moderation: hide or restore a review (hidden ones leave public lists and the product rating). The author and the seller are told, with the reason. */
  @SubscribeMessage('reviews:setStatus')
  async setStatus(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { reviewId: string; status: 'visible' | 'hidden'; reason?: string }) {
    try {
      const user = requireUser(client);
      if (!this.canModerate(user.role)) return fail('Not allowed.');
      const status = oneOf(body?.status, ['visible', 'hidden'] as const, 'Status');
      const review = await this.reviews.setStatus(String(body?.reviewId ?? ''), status, body?.reason);
      await this.audit.record({ actor: user.name, role: user.role, action: `review.${status}`, entity: 'review', entityId: review.id, detail: body?.reason ? String(body.reason).slice(0, 200) : undefined });
      return ok(review);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Moderation queue: reviews across the catalogue (filter by status / productId / reported, paged). */
  @SubscribeMessage('reviews:admin')
  async admin(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { status?: 'visible' | 'hidden'; productId?: string; reported?: boolean; limit?: number; offset?: number }) {
    try {
      const user = requireUser(client);
      if (!this.canModerate(user.role)) return fail('Not allowed.');
      const status = body?.status === undefined ? undefined : oneOf(body.status, ['visible', 'hidden'] as const, 'Status');
      return ok(await this.reviews.listForModeration({ status, productId: body?.productId ? String(body.productId) : undefined, reported: body?.reported === true }, body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('reviews:create')
  async create(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { productId: string; rating: number; text: string }) {
    try {
      const user = requireUser(client);
      return ok(await this.reviews.create({ id: user.id, name: user.name }, body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Mark a review helpful: one vote per person (`counted` says whether this one counted). */
  @SubscribeMessage('reviews:helpful')
  async helpful(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id: string }) {
    try {
      const user = requireUser(client);
      return ok(await this.reviews.markHelpful(String(body?.id ?? ''), user.id));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Q&A ----------------------------------------------------------------
  @SubscribeMessage('questions:list')
  async questionsList(@MessageBody() body: { productId: string; limit?: number; offset?: number }) {
    return ok(await this.reviews.listQuestions(String(body?.productId ?? ''), body));
  }

  @SubscribeMessage('questions:ask')
  async ask(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { productId: string; question: string }) {
    try {
      const user = requireUser(client);
      return ok(publicQuestion(await this.reviews.ask({ id: user.id, name: user.name }, body)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The seller's inbox: questions on their products (`status`: unanswered | answered | all). */
  @SubscribeMessage('questions:seller')
  async sellerInbox(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { status?: string; limit?: number; offset?: number }) {
    try {
      const user = requireUser(client);
      if (user.role !== 'seller') return fail('Sellers only.');
      const ids = await this.storeIds(user);
      return ok(await this.reviews.listQuestionsForSeller(ids, body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** How many questions wait for an answer (the seller's badge). */
  @SubscribeMessage('questions:unanswered')
  async unanswered(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = requireUser(client);
      if (user.role !== 'seller') return fail('Sellers only.');
      return ok({ count: await this.reviews.countUnanswered(await this.storeIds(user)) });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('questions:answer')
  async answer(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id: string; answer: string }) {
    try {
      const user = requireUser(client);
      if (!String(body?.answer ?? '').trim()) return fail('Write an answer first.');
      if (!user.role.startsWith('admin')) {
        // A seller (or a team member with the support permission) may answer questions about THEIR OWN products only.
        if (user.role !== 'seller') return fail('Not allowed.');
        const ctx = await sellerContext(user, 'support');
        const pid = await this.reviews.productIdOfQuestion(body.id);
        const owner = pid ? await this.reviews.productSellerId(pid) : null;
        if (!owner || !ctx.ownerIds.includes(owner)) return fail('Not allowed.');
      }
      return ok(await this.reviews.answer(body.id, body.answer.trim().slice(0, 2000), user.name));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
