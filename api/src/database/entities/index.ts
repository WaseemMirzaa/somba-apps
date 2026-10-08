export { User } from './user.entity';
export type { UserRole } from './user.entity';
export { Seller } from './seller.entity';
export { Product } from './product.entity';
export type { ProductStatus } from './product.entity';
export { Order } from './order.entity';
export type { OrderStatus, PaymentMethod } from './order.entity';
export { OrderItem } from './order-item.entity';
export { Notification } from './notification.entity';
export { DeliveryTask } from './delivery-task.entity';
export type { DeliveryStatus } from './delivery-task.entity';
export { WalletTransaction } from './wallet-transaction.entity';
export { Payment } from './payment.entity';
export type { PaymentStatus, PaymentPurpose } from './payment.entity';
export { Payout } from './payout.entity';
export type { PayoutStatus } from './payout.entity';
export { Dispute } from './dispute.entity';
export type { DisputeType, DisputeStatus } from './dispute.entity';
export { Category } from './category.entity';
export { Address } from './address.entity';
export { Review } from './review.entity';
export { ProductQuestion } from './product-question.entity';
export { SupportTicket } from './support-ticket.entity';
export type { TicketStatus } from './support-ticket.entity';
export { Promo } from './promo.entity';
export { FlashSale } from './flash-sale.entity';
export { CmsBlock } from './cms-block.entity';
export { Setting } from './setting.entity';
export { AuditLog } from './audit-log.entity';
export { FraudAlert } from './fraud-alert.entity';
export { Broadcast } from './broadcast.entity';
export { Hub } from './hub.entity';
export { WarehouseBatch } from './warehouse-batch.entity';
export { StockTransfer } from './stock-transfer.entity';
export { Campaign } from './campaign.entity';
export type { CampaignStatus } from './campaign.entity';
export { Replacement } from './replacement.entity';
export type { ReplacementStatus } from './replacement.entity';
export { Exchange } from './exchange.entity';
export type { ExchangeStatus } from './exchange.entity';
export { WarehouseException } from './warehouse-exception.entity';
export type {
  ExceptionType,
  ExceptionSeverity,
  ExceptionStatus,
} from './warehouse-exception.entity';
export { WishlistItem } from './wishlist-item.entity';
export { DeviceToken } from './device-token.entity';
export { VerificationToken } from './verification-token.entity';
export type { VerificationKind } from './verification-token.entity';
export type { DevicePlatform, DeviceApp } from './device-token.entity';

// ── Single source of truth for the entity set (runtime + migration CLI) ──
import { User } from './user.entity';
import { Seller } from './seller.entity';
import { Product } from './product.entity';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { Notification } from './notification.entity';
import { DeliveryTask } from './delivery-task.entity';
import { WalletTransaction } from './wallet-transaction.entity';
import { Payment } from './payment.entity';
import { Payout } from './payout.entity';
import { Dispute } from './dispute.entity';
import { Category } from './category.entity';
import { Address } from './address.entity';
import { Review } from './review.entity';
import { ProductQuestion } from './product-question.entity';
import { SupportTicket } from './support-ticket.entity';
import { Promo } from './promo.entity';
import { FlashSale } from './flash-sale.entity';
import { CmsBlock } from './cms-block.entity';
import { Setting } from './setting.entity';
import { AuditLog } from './audit-log.entity';
import { FraudAlert } from './fraud-alert.entity';
import { Broadcast } from './broadcast.entity';
import { Hub } from './hub.entity';
import { WarehouseBatch } from './warehouse-batch.entity';
import { StockTransfer } from './stock-transfer.entity';
import { Campaign } from './campaign.entity';
import { Replacement } from './replacement.entity';
import { Exchange } from './exchange.entity';
import { WarehouseException } from './warehouse-exception.entity';
import { WishlistItem } from './wishlist-item.entity';
import { DeviceToken } from './device-token.entity';
import { VerificationToken } from './verification-token.entity';

export const ENTITIES = [
  User,
  Seller,
  Product,
  Order,
  OrderItem,
  Notification,
  DeliveryTask,
  WalletTransaction,
  Payment,
  Payout,
  Dispute,
  Category,
  Address,
  Review,
  ProductQuestion,
  SupportTicket,
  Promo,
  FlashSale,
  CmsBlock,
  Setting,
  AuditLog,
  FraudAlert,
  Broadcast,
  Hub,
  WarehouseBatch,
  StockTransfer,
  Campaign,
  Replacement,
  Exchange,
  WarehouseException,
  WishlistItem,
  DeviceToken,
  VerificationToken,
];
