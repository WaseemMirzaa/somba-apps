import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Seller, SellerTeamMember, User } from '../database/entities';
import type { TeamRole } from '../database/entities';
import { SettingsService } from '../content/settings.service';
import { SUSPENDED_READABLE, permissionsOf, roleAllows } from './seller-permissions';
import type { SellerPermission } from './seller-permissions';

/** The signed-in account, as the gateway knows it. */
export interface SellerCaller {
  id: string;
  role: string;
  name: string;
}

/** The identity services use for "the seller": the store OWNER's account, because payouts, listings and notices are keyed by it. */
export interface OwnerIdentity {
  id: string;
  name: string;
  role: 'seller';
}

export interface SellerContext {
  /** The store the caller works for. */
  seller: Seller;
  /** The caller's role in it ('owner' for the account that opened the store). */
  member: TeamRole;
  isOwner: boolean;
  /** The real caller (a team member keeps their own id and name). */
  user: SellerCaller;
  /**
   * Pass THIS to services that take "the seller" as a user (`payouts.request(ctx.actor…)`, `orders.sellerReady(ctx.actor…)`,
   * `campaigns.create(ctx.actor…)`): they key everything by the owner's account. The name stays the caller's, so audit
   * lines and replies show who really acted.
   */
  actor: OwnerIdentity;
  /** Ids a store's listings / order lines may carry (the store id, and the owner's user id on older demo data). */
  ownerIds: string[];
  /** The store is suspended: only reading orders and earnings is allowed. */
  suspended: boolean;
  permissions: SellerPermission[];
}

export const SELLER_ERRORS = {
  sellersOnly: 'Sellers only.',
  noStore: 'Open a store first.',
  suspended: 'Your store is suspended: you can only view orders and earnings until it is reinstated.',
  twofaRequired: 'Two-factor authentication is required for seller accounts. Turn it on in Settings > Security.',
  role: (role: TeamRole) => `Your team role (${role}) does not allow this. Ask the store owner.`,
} as const;

export interface ContextOptions {
  /** Default true. `false` = the handler only reads. */
  write?: boolean;
  /**
   * Let a suspended store through, for the few calls whose service explains the suspension itself (a suspended store
   * trying to resubmit its application, or to buy a plan). Never use it for ordinary work.
   */
  allowSuspended?: boolean;
}

let current: SellerContextService | null = null;

/**
 * Resolve "my seller" for a signed-in account and enforce the team role. THE helper every seller-scoped handler uses:
 *
 *   const ctx = await sellerContext(user, 'orders');                 // write access to orders
 *   const ctx = await sellerContext(user, 'finance', { write: false }); // read-only is enough
 *   await this.payouts.request(ctx.actor, …)                          // services key by the owner account
 *
 * Throws an Error with a message safe to show (the handler's `catch` turns it into `{ ok: false, error }`).
 */
export function sellerContext(user: SellerCaller, permission: SellerPermission, opts: ContextOptions = {}): Promise<SellerContext> {
  if (!current) throw new Error('Seller context is not ready yet.');
  return current.resolve(user, permission, opts);
}

@Injectable()
export class SellerContextService {
  constructor(
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(SellerTeamMember) private readonly team: Repository<SellerTeamMember>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly settings: SettingsService,
  ) {
    current = this;
  }

  /** The store an account works for and in which role, with no permission check; null when it works for none. */
  async membership(userId: string): Promise<{ seller: Seller; member: TeamRole } | null> {
    const own = await this.sellers.findOne({ where: { userId } });
    if (own) return { seller: own, member: 'owner' };
    const row = await this.team.findOne({ where: { userId, status: 'active' } });
    if (!row) return null;
    const seller = await this.sellers.findOne({ where: { id: row.sellerId } });
    return seller ? { seller, member: row.role } : null;
  }

  async resolve(user: SellerCaller, permission: SellerPermission, opts: ContextOptions = {}): Promise<SellerContext> {
    if (!user || user.role !== 'seller') throw new Error(SELLER_ERRORS.sellersOnly);
    const found = await this.membership(user.id);
    if (!found) throw new Error(SELLER_ERRORS.noStore);
    const { seller, member } = found;
    if (!roleAllows(member, permission)) throw new Error(SELLER_ERRORS.role(member));
    const suspended = seller.status === 'suspended';
    const write = opts.write !== false;
    if (suspended && !opts.allowSuspended && (write || !SUSPENDED_READABLE.includes(permission))) throw new Error(SELLER_ERRORS.suspended);
    if (member === 'owner' && permission !== 'any' && (await this.settings.get('seller2faRequired')) === 'true') {
      const row = await this.users.findOne({ where: { id: user.id }, select: { id: true, twofaEnabled: true } });
      if (!row?.twofaEnabled) throw new Error(SELLER_ERRORS.twofaRequired);
    }
    return {
      seller,
      member,
      isOwner: member === 'owner',
      user,
      actor: { id: seller.userId ?? user.id, name: user.name, role: 'seller' },
      ownerIds: [seller.id, ...(seller.userId ? [seller.userId] : [])],
      suspended,
      permissions: permissionsOf(member),
    };
  }
}
