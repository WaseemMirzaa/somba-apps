export * from './user.entity';
export * from './seller.entity';
export * from './category.entity';
export * from './product.entity';
export * from './product-image.entity';
export * from './order.entity';
export * from './order-item.entity';
export * from './payout.entity';
export * from './promotion.entity';
export * from './dispute.entity';
export * from './audit-log.entity';
export * from './upload.entity';
export * from './address.entity';
export * from './review.entity';
export * from './favorite.entity';
export * from './coupon.entity';

import { User } from './user.entity';
import { Seller } from './seller.entity';
import { Category } from './category.entity';
import { Product } from './product.entity';
import { ProductImage } from './product-image.entity';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { Payout } from './payout.entity';
import { Promotion } from './promotion.entity';
import { Dispute } from './dispute.entity';
import { AuditLog } from './audit-log.entity';
import { Upload } from './upload.entity';
import { Address } from './address.entity';
import { Review } from './review.entity';
import { Favorite } from './favorite.entity';
import { Coupon } from './coupon.entity';

export const ALL_ENTITIES = [
  User,
  Seller,
  Category,
  Product,
  ProductImage,
  Order,
  OrderItem,
  Payout,
  Promotion,
  Dispute,
  AuditLog,
  Upload,
  Address,
  Review,
  Favorite,
  Coupon,
];
