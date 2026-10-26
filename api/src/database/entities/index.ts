export { User } from './user.entity';
export type { UserRole } from './user.entity';
export { Seller } from './seller.entity';
export { Product } from './product.entity';
export type { ProductStatus } from './product.entity';
export { Order } from './order.entity';
export type { OrderStatus, PaymentMethod } from './order.entity';
export { OrderItem } from './order-item.entity';
export type { ItemFulfilment } from './order-item.entity';
export { Notification } from './notification.entity';
export { DeliveryTask } from './delivery-task.entity';
export type { DeliveryStatus, DeliveryKind } from './delivery-task.entity';
export { DELIVERY_KINDS } from './delivery-task.entity';
export { WalletTransaction } from './wallet-transaction.entity';
export { Payment } from './payment.entity';
export type { PaymentStatus, PaymentPurpose } from './payment.entity';
export { Payout } from './payout.entity';
export type { PayoutStatus } from './payout.entity';
export { PayoutStatementLine } from './payout-statement-line.entity';
export type { StatementLineKind } from './payout-statement-line.entity';
export { Dispute } from './dispute.entity';
export type { DisputeType, DisputeStatus, DisputeStage, DisputeOutcome } from './dispute.entity';
export { DisputeItem } from './dispute-item.entity';
export type { ReturnCondition } from './dispute-item.entity';
export { DisputeMessage } from './dispute-message.entity';
export { ReviewReport } from './review-report.entity';
export type { ReviewReportStatus } from './review-report.entity';
export { ReviewHelpful } from './review-helpful.entity';
export { SupportMessage } from './support-message.entity';
export { NotificationRead } from './notification-read.entity';
export { Category } from './category.entity';
export { Address } from './address.entity';
export { CartLine } from './cart-line.entity';
export { Review } from './review.entity';
export type { ReviewStatus } from './review.entity';
export { ProductView } from './product-view.entity';
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
export { GeoArea } from './geo-area.entity';
export type { AreaLevel } from './geo-area.entity';
export { HubCoverage } from './hub-coverage.entity';
export { HubLane } from './hub-lane.entity';
export { TransferRun } from './transfer-run.entity';
export type { TransferRunStatus } from './transfer-run.entity';
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
export { Translation } from './translation.entity';
export type { TranslationEntityType, TranslationOrigin } from './translation.entity';
export { TranslationJob } from './translation-job.entity';
export type { TranslationJobStatus } from './translation-job.entity';
export { SellerTeamMember, TEAM_STAFF_ROLES } from './seller-team.entity';
export type { TeamRole, TeamStatus } from './seller-team.entity';
export { Conversation } from './conversation.entity';
export { ConversationMessage } from './conversation-message.entity';
export type { ChatSide } from './conversation-message.entity';
export { PrivateFile } from './private-file.entity';
export type { PrivateFileKind } from './private-file.entity';
export { StockMovement, STOCK_REASONS, MANUAL_REASONS } from './stock-movement.entity';
export type { StockReason } from './stock-movement.entity';
export { TaxDocument } from './tax-document.entity';
export { serializeVariantStock } from './product.entity';
export type { FlashSaleStatus, FlashSalePhase } from './flash-sale.entity';
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
import { PayoutStatementLine } from './payout-statement-line.entity';
import { Dispute } from './dispute.entity';
import { DisputeItem } from './dispute-item.entity';
import { DisputeMessage } from './dispute-message.entity';
import { ReviewReport } from './review-report.entity';
import { ReviewHelpful } from './review-helpful.entity';
import { SupportMessage } from './support-message.entity';
import { NotificationRead } from './notification-read.entity';
import { Category } from './category.entity';
import { Address } from './address.entity';
import { CartLine } from './cart-line.entity';
import { Review } from './review.entity';
import { ProductView } from './product-view.entity';
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
import { GeoArea } from './geo-area.entity';
import { HubCoverage } from './hub-coverage.entity';
import { HubLane } from './hub-lane.entity';
import { TransferRun } from './transfer-run.entity';
import { WarehouseBatch } from './warehouse-batch.entity';
import { StockTransfer } from './stock-transfer.entity';
import { Campaign } from './campaign.entity';
import { Replacement } from './replacement.entity';
import { Exchange } from './exchange.entity';
import { WarehouseException } from './warehouse-exception.entity';
import { WishlistItem } from './wishlist-item.entity';
import { DeviceToken } from './device-token.entity';
import { VerificationToken } from './verification-token.entity';
import { Translation } from './translation.entity';
import { TranslationJob } from './translation-job.entity';
import { StockMovement } from './stock-movement.entity';
import { TaxDocument } from './tax-document.entity';

import { SellerTeamMember } from './seller-team.entity';
import { Conversation } from './conversation.entity';
import { ConversationMessage } from './conversation-message.entity';
import { PrivateFile } from './private-file.entity';

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
  PayoutStatementLine,
  Dispute,
  DisputeItem,
  DisputeMessage,
  ReviewReport,
  ReviewHelpful,
  SupportMessage,
  NotificationRead,
  Category,
  Address,
  CartLine,
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
  GeoArea,
  HubCoverage,
  HubLane,
  TransferRun,
  WarehouseBatch,
  StockTransfer,
  Campaign,
  Replacement,
  Exchange,
  WarehouseException,
  WishlistItem,
  DeviceToken,
  VerificationToken,
  ProductView,
  Translation,
  TranslationJob,
  StockMovement,
  TaxDocument,
  SellerTeamMember,
  Conversation,
  ConversationMessage,
  PrivateFile,
];
