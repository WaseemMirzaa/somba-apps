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
} from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReviewsService } from './reviews.service';
import { SupportService } from './support.service';
import { PromosService } from './promos.service';
import { CmsService } from './cms.service';
import { SettingsService } from './settings.service';

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
    ]),
    NotificationsModule,
  ],
  providers: [
    ReviewsService,
    SupportService,
    PromosService,
    CmsService,
    SettingsService,
  ],
  exports: [
    ReviewsService,
    SupportService,
    PromosService,
    CmsService,
    SettingsService,
  ],
})
export class ContentModule {}
