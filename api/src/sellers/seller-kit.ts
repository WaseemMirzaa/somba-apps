import { Injectable } from '@nestjs/common';
import { ChatService } from '../chat/chat.service';
import { SellersService, validateKyc } from '../ops/sellers.service';
import { PlanGateService } from './plan-gate';
import { PrivateFilesService } from './private-files.service';
import { SellerAccountService } from './seller-account.service';
import { SellerContextService } from './seller-context';
import type { ContextOptions, SellerCaller, SellerContext } from './seller-context';
import { permissionsOf } from './seller-permissions';
import type { SellerPermission } from './seller-permissions';
import { redactForStaff } from './staff-view';
import { StorefrontService } from './storefront.service';
import { TeamService } from './team.service';
import type { TeamRole } from '../database/entities';

/**
 * One injectable that gives RealtimeGateway everything the seller platform adds, so the gateway's constructor grows
 * by a single parameter (the other builders edit it too).
 */
@Injectable()
export class SellerPlatformKit {
  constructor(
    readonly ctx: SellerContextService,
    readonly planGate: PlanGateService,
    readonly storefront: StorefrontService,
    readonly account: SellerAccountService,
    readonly files: PrivateFilesService,
    readonly chat: ChatService,
    readonly team: TeamService,
    private readonly sellersSvc: SellersService,
  ) {}

  /** The context for a seller-role account, or null when it works for no store (or is not a seller); a role that is not allowed still throws. */
  async orNull(user: SellerCaller, permission: SellerPermission, opts: ContextOptions = {}): Promise<SellerContext | null> {
    if (user.role !== 'seller') return null;
    if (!(await this.ctx.membership(user.id))) return null;
    return this.ctx.resolve(user, permission, opts);
  }

  /** `sellers:mine`: the store as its owner / staff see it, plus the viewer's seat. Null when the account has no store. */
  async mine(user: SellerCaller) {
    if (user.role !== 'seller') return null;
    const found = await this.ctx.membership(user.id);
    if (!found) return null;
    const view = (await this.sellersSvc.withPlanState(found.seller)) as unknown as Record<string, unknown>;
    const membership = { role: found.member as TeamRole, isOwner: found.member === 'owner', permissions: permissionsOf(found.member) };
    if (found.member === 'owner') return { ...view, membership };
    return { ...redactForStaff(view), membership };
  }

  /**
   * KYC documents leave the public folder: validate the application first (nothing moves for a bad one), then move
   * any public upload behind the login and require that private files are the applicant's own.
   */
  async kycBody<T extends { documentUrls?: unknown }>(userId: string, body: T): Promise<T> {
    validateKyc(body as never);
    const urls = (body.documentUrls as string[]).map(String);
    const adopted = await this.files.adopt(urls, userId);
    return { ...body, documentUrls: adopted };
  }
}
