// Shapes mirrored from the API (api/src/database/entities). Kept minimal —
// only what the web needs from real-time payloads.

export type BackendRole =
  | "customer"
  | "seller"
  | "admin"
  | "admin_operations"
  | "admin_finance"
  | "admin_support"
  | "admin_marketing"
  | "admin_moderation"
  | "warehouse_staff"
  | "rider";

export interface BackendUser {
  id: string;
  email: string;
  name: string;
  role: BackendRole;
  phone: string | null;
  locale: "en" | "fr";
  walletBalance: number;
  active: boolean;
}

export interface AuthResult {
  user: BackendUser;
  accessToken: string;
  refreshToken: string;
}

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "returned";

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  /** The line's name in French, snapshotted when the order was placed (absent on an old server). */
  productNameFr?: string | null;
  variant: string;
  /** The chosen options in French (`variant` stays the canonical purchase key). */
  variantFr?: string | null;
  qty: number;
  /** Unit price actually charged (after flash sale / campaign). */
  priceUsd: number;
  /** The normal listing price at the time of the order. */
  listPriceUsd?: number | null;
  campaignId?: string | null;
  campaignPct?: number | null;
  /** The listing's seller at order time (a cart may mix sellers; each packs their own lines). */
  sellerId?: string | null;
  sellerName?: string | null;
  /** The line on the seller's side: packing → packed → at the hub, or cancelled by the seller. */
  fulfilment?: ItemFulfilment;
  readyAt?: string | null;
  receivedAt?: string | null;
  /** Why the seller cancelled this line. */
  cancelReason?: string | null;
  /** Money refunded for this line alone (seller cancellation). */
  refundedUsd?: number;
  /** Platform commission rate (%) frozen when the order was placed. */
  commissionPct?: number;
  /** Commission on this line in USD, frozen when the order was placed. */
  commissionUsd?: number;
}

export type ItemFulfilment = "open" | "ready" | "received" | "cancelled";

/**
 * One seller's package on an order, as the server derives it (`OrdersService.packageStatus`):
 * all their lines cancelled → cancelled; unpaid non-COD order → pending; every live line at the
 * hub → the order's delivery status (or "at_hub" before it ships); every live line packed → ready.
 */
export type PackageStatus =
  | "pending"
  | "to_pack"
  | "ready"
  | "at_hub"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "returned"
  | "cancelled";

/** What `orders:list` / order pushes return to a SELLER: their lines only, their subtotal, their package status. */
export interface SellerOrderView {
  id: string;
  reference: string;
  status: OrderStatus;
  packageStatus: PackageStatus;
  paymentMethod: Order["paymentMethod"];
  /** Expected delivery day (YYYY-MM-DD): order day + the slowest line's seller-set delivery time. */
  estimatedDeliveryDate?: string | null;
  createdAt: string;
  customerName: string;
  items: OrderItem[];
  subtotalUsd: number;
  totalUsd: number;
  /** How many sellers share this order (1 = only this seller). */
  sellerCount: number;
  /** How many OTHER sellers still have to pack their part (the parcel leaves when this is 0). */
  otherSellersPacking?: number;
}

export interface Order {
  id: string;
  reference: string;
  customerId: string;
  customerName: string;
  status: OrderStatus;
  paymentMethod: "stripe_card" | "cod" | "airtel_money" | "wallet";
  subtotalUsd: number;
  deliveryFeeUsd: number;
  /** Promo-code discount already deducted from the total. */
  discountUsd?: number;
  /** Campaign discount already deducted from subtotalUsd / totalUsd. */
  campaignDiscountUsd?: number;
  totalUsd: number;
  zoneId: string | null;
  riderId: string | null;
  /** Expected delivery day (YYYY-MM-DD): order day + the slowest line's seller-set delivery time. */
  estimatedDeliveryDate?: string | null;
  /** Only in the customer's own view, only while shipped / out for delivery: who to call. */
  rider?: { name: string; phone: string | null } | null;
  shippingAddress: string | null;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export type TranslationState = "done" | "pending" | "failed" | "off";

export interface Product {
  id: string;
  name: string;
  nameFr: string | null;
  description: string | null;
  /** French description (null when there is none, absent on an old server). */
  descriptionFr?: string | null;
  price: number;
  originalPrice: number | null;
  discount: number;
  category: string;
  categoryFr: string | null;
  /** The category row the product belongs to (filters compare ids, not names). */
  categoryId?: string | null;
  image: string | null;
  stock: number;
  rating: number;
  reviewsCount: number;
  deliveryDays: number;
  status: string;
  sellerId: string | null;
  sellerName: string | null;
  /** The stored listing price (before flash sale / campaign). */
  basePrice?: number;
  /** Percent off from the winning campaign; 0 when no campaign set the price. */
  campaignPct?: number;
  campaignId?: string | null;
  campaignName?: string | null;
  /** The campaign's name in French (additive; `campaignName` is English). */
  campaignNameFr?: string | null;
  priceSource?: "base" | "flash" | "campaign";
  /** Options the shopper picks (JSON text or array from the API): see lib/variants.ts. */
  variants?: string | { name: string; options: string[] }[] | null;
  /** Display labels of the option groups per language, index-aligned with `variants` (never used as purchase keys). */
  variantLabels?: { en: { name: string; options: string[] }[]; fr: { name: string; options: string[] }[] } | null;
  /** Language the seller wrote the listing in. */
  sourceLang?: "en" | "fr";
  /** Served field names that came from the machine translator, e.g. ["nameFr","descriptionFr"]. */
  machineTranslated?: string[];
  translationStatus?: TranslationState;
}

export interface Category {
  id: string;
  name: string;
  nameFr: string | null;
  icon: string | null;
  image: string | null;
  sortOrder: number;
  sourceLang?: "en" | "fr";
  /** Live products in this category. */
  productCount?: number;
  /** Listings (live or not, never removed) that point at it: the server refuses to delete a category that has any. */
  usedBy?: number;
}

export interface Address {
  id: string;
  userId: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  commune: string | null;
  region: string | null;
  country: string | null;
  postalCode: string | null;
  phone: string | null;
  zoneId: string | null;
  /** Google Maps pin the customer picked (absent when the address was typed by hand). */
  geo?: { lat: number; lng: number; placeId?: string; formatted?: string } | null;
  isDefault: boolean;
  createdAt: string;
}

export type DeliveryStatus =
  | "unassigned"
  | "assigned"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "failed";

export interface DeliveryTask {
  id: string;
  orderId: string;
  orderReference: string;
  riderId: string | null;
  status: DeliveryStatus;
  zoneId: string | null;
  codAmountUsd: number;
  lat: number | null;
  lng: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  userId: string | null;
  role: string | null;
  title: string;
  body: string;
  /** French title / body computed by the server (absent on an old server: the English text is shown). */
  titleFr?: string | null;
  bodyFr?: string | null;
  type: string;
  entityId: string | null;
  read: boolean;
  createdAt: string;
  /** The page this notice opens in the recipient's portal (sent by the server; same as the push's `link`). */
  link?: string;
}

export interface RiderLocation {
  taskId: string;
  orderId: string;
  lat: number;
  lng: number;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  type: "credit" | "debit" | "cashback" | "refund" | "topup";
  amount: number;
  balance: number;
  description: string;
  /** French wording of the description (the server writes both). */
  descriptionFr?: string | null;
  createdAt: string;
}

export interface Payment {
  id: string;
  reference: string;
  orderId: string;
  orderReference: string;
  userId: string;
  method: string;
  amountUsd: number;
  status: "pending" | "succeeded" | "failed" | "refunded";
  createdAt: string;
}

export interface Payout {
  id: string;
  reference: string;
  sellerId: string;
  sellerName: string;
  amountUsd: number;
  method: string;
  /** One step: requested → paid (or rejected); `sending` while a pawaPay transfer is on its way. */
  status: "requested" | "sending" | "rejected" | "paid";
  note: string | null;
  createdAt: string;
  /** Settlement statement totals (absent on payouts issued before statements existed). */
  statementGrossUsd?: number | null;
  statementCommissionUsd?: number | null;
  statementRefundsUsd?: number | null;
  statementNetUsd?: number | null;
  openingBalanceUsd?: number | null;
  closingBalanceUsd?: number | null;
}

export interface Dispute {
  id: string;
  reference: string;
  orderId: string;
  orderReference: string;
  customerId: string;
  customerName: string;
  type: "dispute" | "return";
  reason: string;
  status: "open" | "resolved" | "rejected";
  resolution: string | null;
  createdAt: string;
}

export interface Seller {
  id: string;
  name: string;
  userId: string | null;
  status: "pending" | "approved" | "rejected" | "suspended";
  badge: "gold" | "silver" | "bronze" | "somba_assured";
  rating: number;
  productCount: number;
  /** Public storefront branding (platform upload URLs) and short description. */
  logoUrl?: string | null;
  bannerUrl?: string | null;
  description?: string | null;
  descriptionFr?: string | null;
  /** KYC filed with the application: visible to the owner and to admins only (never on the public storefront). */
  legalName?: string | null;
  phone?: string | null;
  idNumber?: string | null;
  rccm?: string | null;
  taxNumber?: string | null;
  documentUrls?: string[];
  termsAcceptedAt?: string | null;
  kycSubmittedAt?: string | null;
  /** Why the last moderation decision was taken (shown to the seller) and when. */
  statusReason?: string | null;
  statusChangedAt?: string | null;
  createdAt: string;
}

export interface SellerStats {
  products: number;
  orders: number;
  revenue: number;
  paidOut: number;
  pendingPayouts: number;
}

export interface Review {
  id: string;
  productId: string;
  productName?: string;
  productNameFr?: string;
  userId: string;
  author: string;
  rating: number;
  text: string;
  createdAt: string;
  status?: "visible" | "hidden";
  /** The seller's public answer to this review. */
  sellerReply?: string | null;
  sellerReplyAt?: string | null;
  /** Detected language of the review text (absent on an old server). */
  sourceLang?: "en" | "fr" | null;
}

/** Standard ack envelope returned by every request→ack socket handler. */
export type Ack<T> = { ok: true; data: T } | { ok: false; error: string };
