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
  /** Riders and warehouse staff always belong to one warehouse. */
  hubId?: string | null;
  /** Warehouse staff only: operator scans, supervisor also assigns riders, manager also runs the hub. */
  warehouseTier?: "operator" | "supervisor" | "manager" | null;
  twofaEnabled?: boolean;
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

/** One leg of the journey as a customer may see it (no phone, address or code of anyone else). */
export interface TrackingLegView {
  id: string;
  kind: string;
  status: string;
  riderFirstName?: string | null;
  readyAt?: string | null;
  receivedAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  attempts?: number;
  failureReason?: string | null;
  fromHub?: { id: string; name: string; city?: string | null } | null;
  toHub?: { id: string; name: string; city?: string | null } | null;
  /** Multi-hop transfers: 1-based hop and the number of hops; the hub names are there for convenience. */
  hop?: number | null;
  hops?: number | null;
  fromHubName?: string | null;
  toHubName?: string | null;
  runId?: string | null;
  runReference?: string | null;
}

export interface OrderTracking {
  carrier?: string;
  currentLeg?: string | null;
  riderFirstName?: string | null;
  lastUpdateAt?: string | null;
  legs: TrackingLegView[];
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
  /** Legacy (history only): zones are gone, delivery is routed through warehouses. */
  zoneId?: string | null;
  /** The warehouse nearest the customer: it makes the last leg. */
  destinationHubId?: string | null;
  /** One origin warehouse per seller on the order. */
  originHubIds?: string[] | null;
  riderId: string | null;
  /** Expected delivery day (YYYY-MM-DD): order day + the slowest line's seller-set delivery time. */
  estimatedDeliveryDate?: string | null;
  /** Only in the customer's own view, only while shipped / out for delivery: who to call. */
  rider?: { name: string; phone: string | null } | null;
  /** The journey of the parcel from its legs (customer and seller views): one transfer entry per hop. */
  tracking?: OrderTracking | null;
  /** Planned route per seller: the warehouses a parcel passes through (admin/staff payloads). */
  routeBySeller?: Record<string, string[]> | null;
  /** Area routing (docs/contracts/areas.md). */
  destinationAreaId?: string | null;
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
  /** The whole gallery, cover first (`image` is `images[0]`). */
  images?: string[] | null;
  sku?: string | null;
  brand?: string | null;
  weightGrams?: number | null;
  stock: number;
  rating: number;
  reviewsCount: number;
  deliveryDays: number;
  status: string;
  sellerId: string | null;
  sellerName: string | null;
  /** The store is away: hide "Add to cart" and show `sellerVacationNotice[locale]`. */
  sellerOnVacation?: boolean;
  sellerVacationUntil?: string | null;
  sellerHandlingDays?: number;
  /** `deliveryDays` + the store's handling time. */
  totalDeliveryDays?: number;
  sellerVacationNotice?: { en: string; fr: string } | null;
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
  zoneId?: string | null;
  /** Google Maps pin the customer picked (absent when the address was typed by hand). */
  geo?: { lat: number; lng: number; placeId?: string; formatted?: string } | null;
  /** The most specific area of the address (docs/contracts/areas.md) and its chain, province → commune. */
  areaId?: string | null;
  areaChain?: import("@/lib/areas").AreaChain | null;
  /** False when no active warehouse covers the area: checkout refuses it. */
  served?: boolean;
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
  /** What the leg is: pickup, transfer, delivery, return_pickup, return_transfer, return_to_seller, replacement_delivery. */
  kind?: import("@/lib/logistics").LegKind;
  riderId: string | null;
  riderName?: string | null;
  status: DeliveryStatus;
  zoneId?: string | null;
  hubId?: string | null;
  fromHubId?: string | null;
  toHubId?: string | null;
  sellerId?: string | null;
  sellerName?: string | null;
  parentTaskId?: string | null;
  disputeId?: string | null;
  replacementId?: string | null;
  exchangeId?: string | null;
  codAmountUsd: number;
  lat: number | null;
  lng: number | null;
  createdAt: string;
  updatedAt: string;
  from?: import("@/lib/logistics").Endpoint | null;
  to?: import("@/lib/logistics").Endpoint | null;
  fromHub?: import("@/lib/logistics").Endpoint | null;
  toHub?: import("@/lib/logistics").Endpoint | null;
  items?: import("@/lib/logistics").LegItem[];
  collectOld?: boolean;
  needsCode?: boolean;
  orderFlow?: boolean;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  receivedAt?: string | null;
  /** Transfer runs and multi-hop routes (docs/contracts/areas.md). */
  runId?: string | null;
  runReference?: string | null;
  hop?: number | null;
  hops?: number | null;
  finalHubId?: string | null;
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

export interface DisputeItem {
  id: string;
  disputeId: string;
  orderItemId: string;
  productId: string;
  productName: string;
  productNameFr?: string | null;
  variant?: string | null;
  variantFr?: string | null;
  qty: number;
  unitPriceUsd: number;
  refundUsd: number;
  condition: "resellable" | "damaged" | "unsellable" | null;
  restockedQty: number;
}

export interface DisputeMessage {
  id: string;
  disputeId: string;
  authorId: string;
  authorName: string;
  role: string;
  text: string;
  attachments: string[];
  createdAt: string;
}

export type DisputeStage =
  | "awaiting_seller"
  | "seller_replied"
  | "seller_rejected"
  | "seller_timeout"
  | "escalated"
  | "approved"
  | "pickup"
  | "received"
  | "closed";

export type DisputeOutcome = "refund_full" | "refund_partial" | "replacement" | "reject" | "return_refund";

/** A return or a dispute as the server sends it (`DisputeView`). */
export interface Dispute {
  id: string;
  reference: string;
  orderId: string;
  orderReference: string;
  customerId: string;
  customerName: string;
  type: "dispute" | "return";
  category?: string | null;
  reason: string;
  status: "open" | "resolved" | "rejected";
  stage?: DisputeStage;
  attachments?: string[];
  items?: DisputeItem[];
  sellerId?: string | null;
  sellerDueAt?: string | null;
  sellerRespondedAt?: string | null;
  sellerReason?: string | null;
  escalatedAt?: string | null;
  resolution: string | null;
  /** The decision in French (the stock phrases translated; an agent's own words unchanged). */
  resolutionFr?: string | null;
  outcome?: DisputeOutcome | null;
  refundUsd?: number | null;
  refundTo?: "wallet" | "phone" | null;
  receivedAt?: string | null;
  gradedAt?: string | null;
  pickupTaskId?: string | null;
  canEscalate?: boolean;
  canCancel?: boolean;
  messages?: DisputeMessage[];
  messageCount?: number;
  createdAt: string;
  updatedAt?: string;
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

/**
 * Standard ack envelope returned by every request→ack socket handler. A refusal may carry structured fields next to
 * `error` (e.g. `code: 'not_served'` with `areaName`, `areaNameEn` and `servedCities`, docs/contracts/areas.md).
 */
export type Ack<T> = { ok: true; data: T } | ({ ok: false; error: string; code?: string } & Record<string, unknown>);

/** The Error `socketClient.request` rejects with: the localised message, plus the server's own sentence and fields. */
export type RequestError = Error & {
  /** The server's English sentence, whatever language `message` is in. */
  raw?: string;
  /** The machine-readable reason, when the server sent one (e.g. `not_served`). */
  code?: string;
  /** The whole refusal as sent (every structured field next to `error`). */
  ack?: Record<string, unknown>;
};
