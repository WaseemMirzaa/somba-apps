import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CmsBlock,
  FlashSale,
  Product,
  ProductQuestion,
  Promo,
  Review,
  Setting,
  SupportTicket,
  WishlistItem,
} from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReviewsService } from './reviews.service';
import { SupportService } from './support.service';
import { PromosService } from './promos.service';
import { CmsService } from './cms.service';
import { SettingsService } from './settings.service';
import { WishlistService } from './wishlist.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Review,
      ProductQuestion,
      Product,
      SupportTicket,
      Promo,
      FlashSale,
      CmsBlock,
      Setting,
      WishlistItem,
    ]),
    NotificationsModule,
  ],
  providers: [
    ReviewsService,
    SupportService,
    PromosService,
    CmsService,
    SettingsService,
    WishlistService,
  ],
  exports: [
    ReviewsService,
    SupportService,
    PromosService,
    CmsService,
    SettingsService,
    WishlistService,
  ],
})
export class ContentModule {}
