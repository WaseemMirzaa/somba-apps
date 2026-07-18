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
  variant: string;
  qty: number;
  priceUsd: number;
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
  totalUsd: number;
  zoneId: string | null;
  riderId: string | null;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  nameFr: string | null;
  price: number;
  category: string;
  image: string | null;
  stock: number;
  rating: number;
  status: string;
  sellerName: string | null;
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
  type: string;
  entityId: string | null;
  read: boolean;
  createdAt: string;
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

/** Standard ack envelope returned by every request→ack socket handler. */
export type Ack<T> = { ok: true; data: T } | { ok: false; error: string };
