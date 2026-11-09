import { inRoleGroup } from './role-groups';

/**
 * What an admin role may see of an order (a staff member of a warehouse sees the orders of their own warehouse in full,
 * decided where the list is built). The delivery address is the customer's, encrypted at rest; it is shown only to the
 * roles that need it to deliver the parcel or to answer the customer.
 *
 * - `full`: the order with its address (Super Admin, Operations, and Support read-only).
 * - `amounts`: the same order with the address blanked (Finance, Moderation).
 * - `none`: Marketing has no business with an order.
 */
export type OrderAudience = 'full' | 'amounts' | 'none';

export function orderAudienceOf(role: string | null | undefined): OrderAudience {
  if (inRoleGroup(role, 'orderDetail')) return 'full';
  if (inRoleGroup(role, 'orderAmounts')) return 'amounts';
  return 'none';
}

/** The refusal an admin role without any order access (marketing) gets. */
export const ORDER_ACCESS_DENIED = 'Your role cannot read orders.';

/** A copy of the order with the customer's delivery address removed. Never changes the one it is given. */
export function withoutAddress<T extends { shippingAddress?: string | null }>(order: T): T {
  return Object.assign(Object.create(Object.getPrototypeOf(order)), order, { shippingAddress: null });
}

/** The order as `audience` may see it (null = not at all). */
export function orderFor<T extends { shippingAddress?: string | null }>(audience: OrderAudience, order: T): T | null {
  if (audience === 'full') return order;
  if (audience === 'amounts') return withoutAddress(order);
  return null;
}
