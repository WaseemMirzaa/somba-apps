import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CmsBlock,
  Order,
  FlashSale,
  Hub,
  Product,
  ProductQuestion,
  Promo,
  Review,
  ReviewHelpful,
  ReviewReport,
  Seller,
  Setting,
  SupportMessage,
  SupportTicket,
  User,
  WishlistItem,
} from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsModule } from '../products/products.module';
import { ReviewsService } from './reviews.service';
import { SupportService } from './support.service';
import { PromosService } from './promos.service';
import { CouponsService } from './coupons.service';
import { CmsService } from './cms.service';
import { SettingsService } from './settings.service';
import { WishlistService } from './wishlist.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Review,
      ReviewReport,
      ReviewHelpful,
      ProductQuestion,
      Product,
      SupportTicket,
      SupportMessage,
      User,
      Promo,
      FlashSale,
      CmsBlock,
      Setting,
      WishlistItem,
      Order,
      Seller,
      Hub,
    ]),
    NotificationsModule,
    ProductsModule,
  ],
  providers: [
    ReviewsService,
    SupportService,
    PromosService,
    CouponsService,
    CmsService,
    SettingsService,
    WishlistService,
  ],
  exports: [
    ReviewsService,
    SupportService,
    PromosService,
    CouponsService,
    CmsService,
    SettingsService,
    WishlistService,
  ],
})
export class ContentModule {}
