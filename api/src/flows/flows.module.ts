import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Campaign,
  Exchange,
  Order,
  OrderItem,
  Product,
  Replacement,
  Seller,
} from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsModule } from '../products/products.module';
import { ContentModule } from '../content/content.module';
import { WalletModule } from '../wallet/wallet.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { LogisticsBridge } from '../after-sale/logistics-bridge';
import { CampaignsService } from './campaigns.service';
import { ReplacementsService } from './replacements.service';
import { ExchangesService } from './exchanges.service';
import { AfterSaleNames } from './after-sale-names';
import { SellerLapseService } from './seller-lapse.service';

/**
 * Cross-cutting commerce flows that don't belong to a single existing domain:
 * seller marketing campaigns, item replacements, and exchanges.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, Replacement, Exchange, Order, OrderItem, Seller, Product]),
    NotificationsModule,
    ProductsModule,
    ContentModule,
    WalletModule,
    LogisticsModule,
  ],
  providers: [CampaignsService, ReplacementsService, ExchangesService, AfterSaleNames, LogisticsBridge, SellerLapseService],
  exports: [CampaignsService, ReplacementsService, ExchangesService, LogisticsBridge, SellerLapseService],
})
export class FlowsModule {}
