import { demoEmail } from './demo-common';
import type { UserRole } from '../entities';

/**
 * Every demo account except the store owners (those are in `demo-catalog.ts`). `scenario` is what the account is for;
 * it goes into the credentials file and the guide.
 */
export interface DemoAccount {
  key: string;
  email: string;
  name: string;
  role: UserRole;
  /** A phone number that cannot be real (the 900 prefix is unassigned). */
  phone?: string;
  locale?: 'en' | 'fr';
  /** Verified e-mail and phone (a verified account passes the checkout gate). */
  verified: boolean;
  active?: boolean;
  /** Two-factor authentication on, with its key in the credentials file. */
  twofa?: boolean;
  /** 'main' = the platform's own warehouse (Entrepôt Kinshasa), 'demo' = the demo warehouse. */
  hub?: 'main' | 'demo';
  tier?: 'operator' | 'supervisor' | 'manager';
  /** Picture file of the demo manifest (`deploy/demo/images`): a customer's drawn avatar (initials on a colour, no real face). */
  avatar?: string;
  scenario: string;
}

const a = (
  key: string,
  name: string,
  role: UserRole,
  scenario: string,
  extra: Partial<DemoAccount> = {},
): DemoAccount => ({
  key,
  email: demoEmail(key),
  name,
  role,
  verified: true,
  scenario,
  // Every customer has a drawn avatar named after the account key (`avatar-customer.full.jpg`).
  ...(role === 'customer' ? { avatar: `avatar-${key}.jpg` } : {}),
  ...extra,
});

export const DEMO_ACCOUNTS: DemoAccount[] = [
  // ── Customers ──
  a(
    'customer.full',
    'Grace Mbuyi',
    'customer',
    'The full customer: verified, a large wallet, two pinned addresses, orders in every state, wishlist, cart, followed stores, reviews with photos, chats, tickets.',
    { phone: '+243 900 000 101' },
  ),
  a(
    'customer.new',
    'Patrick Kasongo',
    'customer',
    'A new, verified customer with no address, no orders and no wallet: every empty state, then the first address and the first order.',
    { phone: '+243 900 000 102' },
  ),
  a(
    'customer.unverified',
    'Chantal Ilunga',
    'customer',
    'An unverified customer: checkout is blocked and the verification prompt appears.',
    { phone: '+243 900 000 103', verified: false },
  ),
  a(
    'customer.fr',
    'Jean-Baptiste Mukendi',
    'customer',
    'French-language customer (locale fr): French screens, translated product text and chat with a seller who writes English.',
    { phone: '+243 900 000 104', locale: 'fr' },
  ),
  a(
    'customer.suspended',
    'Albert Tshibangu',
    'customer',
    'A suspended customer: sign-in is refused.',
    { phone: '+243 900 000 105', active: false },
  ),
  a(
    'customer.fraud',
    'Rita Banza',
    'customer',
    'A customer with open fraud alerts: shown in the admin fraud screen.',
    { phone: '+243 900 000 106' },
  ),
  a(
    'reviewer.1',
    'Esther Kabongo',
    'customer',
    'Supporting account: a past buyer whose reviews, photos and helpful votes fill the product pages.',
    { phone: '+243 900 000 111' },
  ),
  a(
    'reviewer.2',
    'Samuel Kitenge',
    'customer',
    'Supporting account: a past buyer (reviews, helpful votes).',
    { phone: '+243 900 000 112' },
  ),
  a(
    'reviewer.3',
    'Naomi Mulumba',
    'customer',
    'Supporting account: a past buyer (reviews, helpful votes).',
    { phone: '+243 900 000 113' },
  ),
  a(
    'reviewer.4',
    'Daniel Ngandu',
    'customer',
    'Supporting account: a past buyer (reviews, helpful votes).',
    { phone: '+243 900 000 114' },
  ),
  a(
    'customer.vip',
    'Marie-Claire Tshimanga',
    'customer',
    'The VIP, French language: a large wallet, three pinned addresses, 14 orders over 90 days (twelve delivered, with reviews and "rate me" orders, then one out for delivery, one on the way, one being prepared and one just placed), a cart and a wishlist.',
    { phone: '+243 900 000 141', locale: 'fr' },
  ),
  a(
    'customer.regular.fr',
    'Joël Kabasele',
    'customer',
    'A regular, French language: ten orders over 75 days, a return refused by support, an exchange that was delivered, one order out for delivery, one on the way, one just placed.',
    { phone: '+243 900 000 142', locale: 'fr' },
  ),
  a(
    'customer.regular.en',
    'Priscilla Nsimba',
    'customer',
    'A regular, English language: eleven orders over 85 days and one case at each after-sale stage (a return waiting for a rider, a return she withdrew, a dispute settled with a partial refund, a replacement delivered, a replacement refused), an order with one line cancelled by the seller.',
    { phone: '+243 900 000 143' },
  ),
  a(
    'customer.business',
    'Olivier Kasongo',
    'customer',
    'A business buyer (Kasongo & Fils, a hardware shop in Kasa-Vubu), French language: bulk orders (30 to 50 units a line), a two-store basket, a coupon, a large wallet, and an express order when express is on.',
    { phone: '+243 900 000 144', locale: 'fr' },
  ),
  a(
    'customer.cancelled',
    'Fabrice Lumbu',
    'customer',
    'Only cancelled and returned history: cancelled by the customer, by the seller and by KOMORIKO support, an order nobody could deliver, and a returned order, each with its refund to the wallet.',
    { phone: '+243 900 000 145' },
  ),
  a(
    'customer.expat',
    'Sarah Whitfield',
    'customer',
    'An international customer paying with mobile money: paid by Airtel and Orange, awaiting payment, declined and expired payments (these need the mobile-money sandbox or manual mode, see the guide), plus wallet orders.',
    { phone: '+243 900 000 146' },
  ),
  a(
    'customer.newfr',
    'Aimée Mavungu',
    'customer',
    'A new customer, French language: one address, a small wallet, a wishlist and no orders yet.',
    { phone: '+243 900 000 147', locale: 'fr' },
  ),
  a(
    'customer.cart',
    'Amina Diallo',
    'customer',
    'A new customer who is ready to buy: a cart worth more than the coupon minimums, items saved for later, a wishlist, a pinned address and a wallet; apply DEMOWELCOME or MAISON5 at checkout.',
    { phone: '+243 900 000 148' },
  ),
  // ── Staff ──
  a(
    'admin.super',
    'Demo Super Admin',
    'admin',
    'Super admin. Can do everything, including creating staff: REMOVE this account before launch.',
    { twofa: true },
  ),
  a(
    'admin.moderation',
    'Demo Moderation',
    'admin_moderation',
    'Moderation admin: product queue, seller approvals, reported reviews, fraud review.',
    { twofa: true },
  ),
  a(
    'admin.operations',
    'Demo Operations',
    'admin_operations',
    'Operations admin: settings, geography, warehouses, orders, seller approval.',
    { twofa: true },
  ),
  a(
    'admin.finance',
    'Demo Finance',
    'admin_finance',
    'Finance admin: payments, refunds, payouts, finance figures.',
    { twofa: true },
  ),
  a(
    'admin.marketing',
    'Demo Marketing',
    'admin_marketing',
    'Marketing admin: CMS banners, promo codes, flash sales, campaigns, broadcasts.',
    { twofa: true },
  ),
  a(
    'admin.support',
    'Demo Support',
    'admin_support',
    'Support admin: tickets, disputes and returns, customer accounts.',
    { twofa: true },
  ),
  a(
    'warehouse.manager',
    'Demo Warehouse Manager',
    'warehouse_staff',
    'Manager of Entrepôt Kinshasa: all tiers, analytics, warehouse settings and stock.',
    { hub: 'main', tier: 'manager', phone: '+243 900 000 121' },
  ),
  a(
    'warehouse.supervisor',
    'Demo Warehouse Supervisor',
    'warehouse_staff',
    'Supervisor of Entrepôt Kinshasa: assigns riders, transfer runs, returns, exceptions.',
    { hub: 'main', tier: 'supervisor', phone: '+243 900 000 122' },
  ),
  a(
    'warehouse.operator',
    'Demo Warehouse Operator',
    'warehouse_staff',
    'Operator of Entrepôt Kinshasa: scans parcels in and out, custody.',
    { hub: 'main', tier: 'operator', phone: '+243 900 000 123' },
  ),
  a(
    'rider',
    'Demo Rider',
    'rider',
    'Rider of Entrepôt Kinshasa: assigned pickups and deliveries, delivery code, "My work".',
    { hub: 'main', phone: '+243 900 000 131' },
  ),
  a(
    'warehouse.maluku',
    'Demo Maluku Supervisor',
    'warehouse_staff',
    'Supervisor of the demo warehouse Entrepôt Maluku (démo): receives the transfer runs.',
    { hub: 'demo', tier: 'supervisor', phone: '+243 900 000 124' },
  ),
  a(
    'rider.maluku',
    'Demo Maluku Rider',
    'rider',
    'Rider of the demo warehouse: last leg to the Maluku address.',
    { hub: 'demo', phone: '+243 900 000 132' },
  ),
];

/** Members of store A's team: one per role (the owner is `seller.a`). */
export const DEMO_TEAM: {
  key: string;
  name: string;
  role: 'manager' | 'catalog' | 'orders' | 'finance' | 'support';
  phone: string;
}[] = [
  {
    key: 'team.manager',
    name: 'Léa Kabeya (manager)',
    role: 'manager',
    phone: '+243 900 000 211',
  },
  {
    key: 'team.catalog',
    name: 'Michel Tshisekedi (catalog)',
    role: 'catalog',
    phone: '+243 900 000 212',
  },
  {
    key: 'team.orders',
    name: 'Josée Mbombo (orders)',
    role: 'orders',
    phone: '+243 900 000 213',
  },
  {
    key: 'team.finance',
    name: 'Alain Mpoyi (finance)',
    role: 'finance',
    phone: '+243 900 000 214',
  },
  {
    key: 'team.support',
    name: 'Bénédicte Lukusa (support)',
    role: 'support',
    phone: '+243 900 000 215',
  },
];
