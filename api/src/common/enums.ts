/** Domain enums shared across the API (mirrors shared/types). */

export enum UserRole {
  CUSTOMER = 'customer',
  GUEST = 'guest',
  SELLER = 'seller',
  ADMIN = 'admin',
  ADMIN_OPERATIONS = 'admin_operations',
  ADMIN_FINANCE = 'admin_finance',
  ADMIN_SUPPORT = 'admin_support',
  ADMIN_MARKETING = 'admin_marketing',
  ADMIN_MODERATION = 'admin_moderation',
  WAREHOUSE_STAFF = 'warehouse_staff',
  RIDER = 'rider',
}

/** Every role that may reach the admin console (super + sub-roles). */
export const ADMIN_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.ADMIN_OPERATIONS,
  UserRole.ADMIN_FINANCE,
  UserRole.ADMIN_SUPPORT,
  UserRole.ADMIN_MARKETING,
  UserRole.ADMIN_MODERATION,
];

export enum SellerStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  REJECTED = 'rejected',
}

export enum SellerBadge {
  GOLD = 'gold',
  SILVER = 'silver',
  BRONZE = 'bronze',
  SOMBA_ASSURED = 'somba_assured',
}

export enum ProductStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  LIVE = 'live',
}

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  OUT_FOR_DELIVERY = 'out_for_delivery',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  RETURNED = 'returned',
}

export enum PaymentMethod {
  STRIPE_CARD = 'stripe_card',
  COD = 'cod',
  AIRTEL_MONEY = 'airtel_money',
  WALLET = 'wallet',
}

export enum PayoutStatus {
  REQUESTED = 'requested',
  APPROVED = 'approved',
  PAID = 'paid',
  REJECTED = 'rejected',
}

export enum PromotionStatus {
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  ENDED = 'ended',
  PAUSED = 'paused',
}

export enum PromotionType {
  PERCENT = 'percent',
  FLAT = 'flat',
  FLASH_SALE = 'flash_sale',
}

export enum DisputeStatus {
  OPEN = 'open',
  IN_REVIEW = 'in_review',
  RESOLVED = 'resolved',
  REJECTED = 'rejected',
}

/** Storage sub-paths under the single UPLOAD_DIR base (same env, different path). */
export enum UploadContext {
  PRODUCT = 'products',
  SELLER_KYC = 'seller-kyc',
  SELLER_LOGO = 'seller-logo',
  PROMOTION = 'promotions',
  DISPUTE = 'disputes',
  CATEGORY = 'categories',
  MISC = 'misc',
}
