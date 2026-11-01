import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Seller, SellerTeamMember } from '../database/entities';
import { SellerContextService } from './seller-context';
import { PlanGateService, seatsOf } from './plan-gate';
import { PrivateFilesService } from './private-files.service';
import { SellerScoringService } from './seller-scoring.service';
import { StorefrontService } from './storefront.service';
import { fail, ok, requireUser } from './gateway-support';
import type { AuthedSocket } from './gateway-support';

/**
 * The seller platform's smaller events (docs/contracts/seller-platform.md): goals, payout account, plan perks,
 * private-document links and the admin re-score. Same Socket.IO server as RealtimeGateway.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class PlatformGateway {
  constructor(
    private readonly ctx: SellerContextService,
    private readonly storefront: StorefrontService,
    private readonly planGate: PlanGateService,
    private readonly files: PrivateFilesService,
    private readonly scoring: SellerScoringService,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(SellerTeamMember) private readonly team: Repository<SellerTeamMember>,
  ) {}

  /** The seller's targets: `{ revenueUsd, orders, rating, products }` (null = no goal). Replaces the browser-storage copy. */
  @SubscribeMessage('sellers:goals:get')
  async goalsGet(@ConnectedSocket() client: AuthedSocket) {
    try {
      return ok(this.storefront.goals(await this.ctx.resolve(requireUser(client), 'insight', { write: false })));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('sellers:goals:set')
  async goalsSet(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      const out = await this.storefront.setGoals(await this.ctx.resolve(requireUser(client), 'storefront'), body ?? {});
      return ok(out);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ method, account, masked, set }`. Only the owner receives the full account; staff see the masked one. */
  @SubscribeMessage('sellers:payoutAccount:get')
  async payoutAccountGet(@ConnectedSocket() client: AuthedSocket) {
    try {
      return ok(this.storefront.payoutAccount(await this.ctx.resolve(requireUser(client), 'finance', { write: false })));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Owner only: `{ method: 'bank'|'mobile_money', account }` or `{ clear: true }`. */
  @SubscribeMessage('sellers:payoutAccount:set')
  async payoutAccountSet(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { method?: string; account?: string; clear?: boolean }) {
    try {
      const ctx = await this.ctx.resolve(requireUser(client), 'payout_account');
      return ok(await this.storefront.setPayoutAccount(ctx, body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The plan in force and what it unlocks, so the portal can lock what the plan does not include. */
  @SubscribeMessage('sellers:plan')
  async plan(@ConnectedSocket() client: AuthedSocket) {
    try {
      const ctx = await this.ctx.resolve(requireUser(client), 'any', { write: false });
      const plan = await this.planGate.planOf(ctx.seller);
      const used = await this.team.count({ where: [{ sellerId: ctx.seller.id, status: 'active' }, { sellerId: ctx.seller.id, status: 'invited' }] });
      return ok({
        plan: plan ?? null,
        perks: {
          promotions: plan?.perks?.promotions !== false,
          flashNomination: plan?.perks?.flashNomination !== false,
          coupons: plan?.perks?.coupons !== false,
          bulkImport: plan?.perks?.bulkImport !== false,
        },
        maxProducts: plan?.maxProducts ?? null,
        teamSeats: { used, max: seatsOf(plan) },
      });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ id }`: a 5-minute link that opens a private document in a browser tab. Owner and reviewers only. */
  @SubscribeMessage('private:link')
  async link(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string }) {
    try {
      const u = requireUser(client);
      const host = client.handshake.headers.host;
      const proto = (client.handshake.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
      const origin = process.env.PUBLIC_API_URL ?? (host ? `${proto}://${host}` : undefined);
      return ok(await this.files.link({ id: u.id, role: u.role }, String(body?.id ?? ''), origin));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Admin: recompute one store's rating / badge now (`{ sellerId }`), or every store. */
  @SubscribeMessage('sellers:rescore')
  async rescore(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { sellerId?: string }) {
    try {
      const u = requireUser(client);
      if (!['admin', 'admin_operations', 'admin_moderation'].includes(u.role)) return fail('Not allowed.');
      if (body?.sellerId) {
        const s = await this.sellers.findOne({ where: { id: String(body.sellerId) } });
        if (!s) return fail('Seller not found.');
        const saved = await this.scoring.recompute(s);
        return ok({ updated: 1, rating: saved.rating, ratingCount: saved.ratingCount, fulfilmentRate: saved.fulfilmentRate, badge: saved.badge });
      }
      return ok({ updated: await this.scoring.recomputeAll() });
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
