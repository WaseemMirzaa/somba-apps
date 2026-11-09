import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuditLog,
  Broadcast,
  DeliveryTask,
  Dispute,
  FraudAlert,
  FraudSignal,
  Order,
  OrderItem,
  Payment,
  PaymentRefund,
  Payout,
  Product,
  ProductView,
  Review,
  Seller,
  User,
  Setting,
  WarehouseBatch,
  Hub,
  WalletTransaction,
  VerificationToken,
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
import { FraudRulesService } from './fraud-rules.service';
import { FraudSignalsModule } from './fraud-signals.module';
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
      VerificationToken,
      Dispute,
      DeliveryTask,
      AuditLog,
      FraudAlert,
      FraudSignal,
      PaymentRefund,
      Broadcast,
      Setting,
      WalletTransaction,
    ]),
    NotificationsModule,
    PaymentsModule,
    ContentModule,
    ProductsModule,
    CatalogModule,
    UsersModule,
    LogisticsModule,
    GeoModule,
    FraudSignalsModule,
  ],
  providers: [
    SellersService,
    AnalyticsService,
    AuditService,
    FraudService,
    FraudRulesService,
    CustomersService,
    BroadcastsService,
    RolesService,
  ],
  exports: [
    SellersService,
    AnalyticsService,
    AuditService,
    FraudService,
    FraudRulesService,
    CustomersService,
    BroadcastsService,
    RolesService,
  ],
})
export class OpsModule {}
