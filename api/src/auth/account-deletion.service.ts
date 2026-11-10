import { BadRequestException, Injectable } from '@nestjs/common';
import { CUSTOMER_KINDS } from '../logistics/leg-rules';
import { DataSource, EntityManager, In, IsNull, Not } from 'typeorm';
import {
  CartLine,
  DeliveryTask,
  Dispute,
  Exchange,
  Order,
  Payment,
  Payout,
  Replacement,
  Review,
  StoreFollow,
  SupportTicket,
  User,
  WishlistItem,
} from '../database/entities';
import { parseShipping } from '../geo/address-input';

/** Order statuses in which the customer is still waiting for the parcel (or for the money back). The rest are final. */
export const OPEN_ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery'] as const;
const OPEN_EXCHANGE = ['requested', 'approved', 'received', 'ready', 'dispatched'];
const OPEN_REPLACEMENT = ['requested', 'approved', 'received', 'allocated', 'dispatched'];
const OPEN_TICKET = ['open', 'pending'];
const LIVE_PAYOUT = ['requested', 'sending'];

/** What the customer is shown in place of their name once the account is gone. */
export const DELETED_NAME = 'Deleted user';

export type DeletionBlockerKind =
  | 'wallet_balance'
  | 'open_order'
  | 'open_return'
  | 'open_dispute'
  | 'open_ticket'
  | 'pending_payout'
  | 'pending_refund'
  | 'pending_topup';

/** One reason an account cannot be deleted yet. `count` is the number of open items; `amountUsd` is set for money. */
export interface DeletionBlocker {
  kind: DeletionBlockerKind;
  count: number;
  amountUsd?: number;
}

const usd = (n: number) => `$${n.toFixed(2)}`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * The plain-words reason (English, as every server message is; the apps translate it, and the French of each sentence
 * is in the apps' server-error lists). Each one says what is outstanding and what to do about it.
 */
export function blockerMessage(b: DeletionBlocker): string {
  switch (b.kind) {
    case 'wallet_balance':
      return `Your wallet still holds ${usd(b.amountUsd ?? 0)}: spend it or ask support to pay it out first.`;
    case 'open_order':
      return b.count === 1
        ? 'You have 1 order that is not finished yet: wait until it is delivered, or cancel it, first.'
        : `You have ${b.count} orders that are not finished yet: wait until they are delivered, or cancel them, first.`;
    case 'open_return':
      return `You have ${b.count} open ${plural(b.count, 'return, exchange or replacement request', 'return, exchange or replacement requests')}: wait until ${plural(b.count, 'it is', 'they are')} completed first.`;
    case 'open_dispute':
      return `You have ${b.count} open ${plural(b.count, 'dispute', 'disputes')} about an order: wait until ${plural(b.count, 'it is', 'they are')} resolved first.`;
    case 'open_ticket':
      return `You have ${b.count} open support ${plural(b.count, 'request', 'requests')} about an order: wait until support closes ${plural(b.count, 'it', 'them')} first.`;
    case 'pending_payout':
      return 'A payout to you is still being processed: wait until it is paid first.';
    case 'pending_refund':
      return 'A refund to your phone or card is still on its way: wait until it arrives first.';
    case 'pending_topup':
      return 'A wallet top-up is still waiting for your approval: wait until it completes or fails first.';
  }
}

/**
 * The refusal. It travels as an ordinary `BadRequestException` (so every existing path shows its message) and carries
 * the structured list; the socket gateway spreads `code` and `blockers` into the ack so an app can word each reason
 * itself in its own language, the same way `NotServedException` does for an unserved address.
 */
export class AccountDeletionBlockedException extends BadRequestException {
  readonly code = 'account_blocked' as const;
  constructor(readonly blockers: DeletionBlocker[]) {
    super(`You cannot delete your account yet. ${blockers.map(blockerMessage).join(' ')}`);
  }
}

/** The structured fields to spread into an `ok: false` ack when the error is a deletion refusal (else nothing). */
export function accountBlockedFields(e: unknown): { code?: 'account_blocked'; blockers?: DeletionBlocker[] } {
  return e instanceof AccountDeletionBlockedException ? { code: e.code, blockers: e.blockers } : {};
}

/**
 * Deleting a customer account, the data side.
 *
 *  1. `blockers` lists what is still outstanding (money, an order on its way, an open after-sale request, an open
 *     support ticket about an order, a payout / refund / top-up in flight). Anything on that list refuses the deletion:
 *     nobody can be left holding money they cannot reach or a parcel they can no longer follow. `AuthService` calls
 *     `erase`, which re-checks inside its transaction, so the rule holds for every caller, not only the app.
 *  2. `erase` then removes what the account owned and anonymises what other people's records still say about it:
 *
 * Rule for the records that stay (they are needed by the seller, the rider and accounting): the row, its reference,
 * lines, amounts, dates, status, payment method and the PLACE (province, city, commune, delivery area) stay; the
 * customer's name becomes "Deleted user", and the street lines, phone, label, notes, map pin, Google components and any
 * other free text of the address are dropped. The phone paid from and the name on the customer's disputes, exchanges,
 * replacements, support tickets and delivery tasks go the same way; public reviews stay with the author "Deleted user".
 * Wishlist, cart and followed stores are deleted.
 */
@Injectable()
export class AccountDeletionService {
  constructor(private readonly ds: DataSource) {}

  /** Everything that blocks this account's deletion right now (empty = it can go). No side effects. */
  blockers(userId: string, manager: EntityManager = this.ds.manager): Promise<DeletionBlocker[]> {
    return collect(manager, userId);
  }

  /** Throws `AccountDeletionBlockedException` when anything is outstanding. */
  async assertCanDelete(userId: string): Promise<void> {
    const list = await this.blockers(userId);
    if (list.length) throw new AccountDeletionBlockedException(list);
  }

  /**
   * Save the already-tombstoned user and clean up around it, in ONE transaction that first re-checks the blockers
   * (an order or a credit that landed since the caller looked still stops the deletion, and nothing is half done).
   */
  async erase(user: User): Promise<void> {
    await this.ds.transaction(async (m) => {
      const list = await collect(m, user.id);
      if (list.length) throw new AccountDeletionBlockedException(list);
      await m.save(User, user);
      await this.anonymiseRecords(m, user.id);
      await m.delete(WishlistItem, { userId: user.id });
      await m.delete(CartLine, { userId: user.id });
      await m.delete(StoreFollow, { userId: user.id });
    });
  }

  /** The records other people keep about this customer, with the personal parts removed (see the class comment). */
  private async anonymiseRecords(m: EntityManager, userId: string): Promise<void> {
    const orders = await m.find(Order, { where: { customerId: userId }, select: { id: true, shippingAddress: true, customerName: true } });
    for (const o of orders) {
      await m.update(Order, { id: o.id }, { customerName: DELETED_NAME, shippingAddress: placeOnly(o.shippingAddress) });
    }
    const ids = orders.map((o) => o.id);
    if (ids.length) {
      // The legs that end at (or start from) the customer's door carry the full address and the phone inside it.
      const tasks = await m.find(DeliveryTask, { where: { orderId: In(ids), kind: In([...CUSTOMER_KINDS, 'replacement_delivery', 'return_pickup']) } });
      for (const t of tasks) {
        await m.update(DeliveryTask, { id: t.id }, {
          address: placeOnly(t.address),
          ...(t.kind === 'return_pickup' ? { pickupAddress: placeOnly(t.pickupAddress) } : {}),
        });
      }
    }
    await m.update(Dispute, { customerId: userId }, { customerName: DELETED_NAME });
    await m.update(Exchange, { customerId: userId }, { customerName: DELETED_NAME });
    await m.update(Replacement, { customerId: userId }, { customerName: DELETED_NAME });
    await m.update(SupportTicket, { userId }, { userName: DELETED_NAME });
    await m.update(Review, { userId }, { author: DELETED_NAME });
    await m.update(Payment, { userId }, { phone: null });
  }
}

/**
 * What an address keeps once its owner is gone: only where it was (area id, province, city, commune, quartier,
 * country), as the same JSON shape so everything that reads a place from it keeps working. Free text or no address
 * gives null.
 */
export function placeOnly(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const f = parseShipping(raw);
  let country: string | null = null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (v && typeof v === 'object' && typeof v.country === 'string' && v.country.trim()) country = v.country.trim();
  } catch {
    return null;
  }
  const kept: Record<string, string> = {};
  if (f.areaId) kept.areaId = f.areaId;
  if (f.commune) kept.commune = f.commune;
  if (f.city) kept.city = f.city;
  if (f.region) kept.region = f.region;
  if (f.quartier) kept.quartier = f.quartier;
  if (country) kept.country = country;
  return Object.keys(kept).length ? JSON.stringify(kept) : null;
}

async function collect(m: EntityManager, userId: string): Promise<DeletionBlocker[]> {
  const out: DeletionBlocker[] = [];
  const user = await m.findOne(User, { where: { id: userId } });
  const balance = Math.round((user?.walletBalance ?? 0) * 100) / 100;
  if (balance > 0) out.push({ kind: 'wallet_balance', count: 1, amountUsd: balance });

  const orders = await m.count(Order, { where: { customerId: userId, status: In([...OPEN_ORDER_STATUSES]) } });
  if (orders) out.push({ kind: 'open_order', count: orders });

  const returns =
    (await m.count(Dispute, { where: { customerId: userId, type: 'return', status: 'open' } })) +
    (await m.count(Exchange, { where: { customerId: userId, status: In(OPEN_EXCHANGE) } })) +
    (await m.count(Replacement, { where: { customerId: userId, status: In(OPEN_REPLACEMENT) } }));
  if (returns) out.push({ kind: 'open_return', count: returns });

  const disputes = await m.count(Dispute, { where: { customerId: userId, type: 'dispute', status: 'open' } });
  if (disputes) out.push({ kind: 'open_dispute', count: disputes });

  const tickets = await m.count(SupportTicket, { where: { userId, status: In(OPEN_TICKET), orderId: Not(IsNull()) } });
  if (tickets) out.push({ kind: 'open_ticket', count: tickets });

  const payouts = await m.count(Payout, { where: { sellerId: userId, status: In(LIVE_PAYOUT) } });
  if (payouts) out.push({ kind: 'pending_payout', count: payouts });

  const refunds = await m.count(Payment, { where: { userId, refundStatus: 'sending' } });
  if (refunds) out.push({ kind: 'pending_refund', count: refunds });

  const topups = await m.count(Payment, { where: { userId, purpose: 'topup', status: 'pending' } });
  if (topups) out.push({ kind: 'pending_topup', count: topups });
  return out;
}
