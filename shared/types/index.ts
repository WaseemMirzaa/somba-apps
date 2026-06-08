/** Shared types for web, api, and mobile (prototype). */

export type Locale = "en" | "fr";

export type Currency = "USD" | "CDF";

export type MarketProfileId = "france" | "drc";

export interface Zone {
  id: string;
  name: string;
  nameFr: string;
  city: string;
  deliveryFeeUsd: number;
}

export interface FxRate {
  base: "USD";
  quote: "CDF";
  rate: number;
  effectiveAt: string;
  setBy: string;
}

export type PaymentMethod = "stripe_card" | "cod" | "airtel_money" | "wallet";

export type UserRole =
  | "customer"
  | "guest"
  | "seller"
  | "admin"
  | "admin_operations"
  | "admin_finance"
  | "admin_support"
  | "admin_marketing"
  | "admin_moderation"
  | "warehouse_staff"
  | "rider";

export type FulfillmentModel = "seller_shipped" | "platform_warehouse" | "hybrid";

export type SellerBadge = "gold" | "silver" | "bronze" | "somba_assured";

export type ProductStatus = "draft" | "pending" | "approved" | "rejected" | "live";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "returned";

export interface Address {
  id: number;
  label: string;
  line1: string;
  line2?: string;
  commune?: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
  phone: string;
  isDefault: boolean;
}

export interface WalletTransaction {
  id: string;
  type: "credit" | "debit" | "cashback" | "refund" | "topup";
  amount: number;
  balance: number;
  description: string;
  date: string;
}

export interface FraudAlert {
  id: string;
  type: "cod_risk" | "address_block" | "velocity" | "otp_fail";
  severity: "low" | "medium" | "high";
  customer: string;
  orderId?: string;
  score: number;
  status: "open" | "reviewed" | "blocked";
  date: string;
}

export interface AuditLogEntry {
  id: string;
  actor: string;
  role: UserRole;
  action: string;
  entity: string;
  entityId: string;
  before?: string;
  after?: string;
  timestamp: string;
}

export interface WarehouseHub {
  id: string;
  name: string;
  city: string;
  country: string;
  capacity: number;
  parcelsToday: number;
}

export interface CommissionRule {
  category: string;
  rate: number;
  sellerTier?: SellerBadge;
}
