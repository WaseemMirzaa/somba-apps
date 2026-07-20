import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuditLog,
  Broadcast,
  DeliveryTask,
  Dispute,
  FraudAlert,
  Order,
  Payment,
  Payout,
  Product,
  Seller,
  User,
} from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { SellersService } from './sellers.service';
import { AnalyticsService } from './analytics.service';
import { AuditService } from './audit.service';
import { FraudService } from './fraud.service';
import { CustomersService } from './customers.service';
import { BroadcastsService } from './broadcasts.service';
import { RolesService } from './roles.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Seller,
      Product,
      Order,
      Payout,
      Payment,
      User,
      Dispute,
      DeliveryTask,
      AuditLog,
      FraudAlert,
      Broadcast,
    ]),
    NotificationsModule,
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
