import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuditLog,
  Broadcast,
  DeliveryTask,
  Dispute,
  FraudAlert,
  Order,
  OrderItem,
  Payment,
  Payout,
  Product,
  ProductView,
  Review,
  Seller,
  User,
  Setting,
  WarehouseBatch,
  Hub,
} from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { ContentModule } from '../content/content.module';
import { ProductsModule } from '../products/products.module';
import { CatalogModule } from '../catalog/catalog.module';
import { SellersService } from './sellers.service';
import { AnalyticsService } from './analytics.service';
import { AuditService } from './audit.service';
import { FraudService } from './fraud.service';
import { CustomersService } from './customers.service';
import { BroadcastsService } from './broadcasts.service';
import { UsersModule } from '../users/users.module';
import { RolesService } from './roles.service';
import { LogisticsModule } from '../logistics/logistics.module';
import { GeoModule } from '../geo/geo.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Seller,
      Product,
      Order,
      OrderItem,
      Payout,
      Payment,
      ProductView,
      Review,
      WarehouseBatch,
      Hub,
      User,
      Dispute,
      DeliveryTask,
      AuditLog,
      FraudAlert,
      Broadcast,
      Setting,
    ]),
    NotificationsModule,
    PaymentsModule,
    ContentModule,
    ProductsModule,
    CatalogModule,
    UsersModule,
    LogisticsModule,
    GeoModule,
  ],
  providers: [
    SellersService,
    AnalyticsService,
    AuditService,
    FraudService,
    CustomersService,
    BroadcastsService,
    RolesService,
  ],
  exports: [
    SellersService,
    AnalyticsService,
    AuditService,
    FraudService,
    CustomersService,
    BroadcastsService,
    RolesService,
  ],
})
export class OpsModule {}
