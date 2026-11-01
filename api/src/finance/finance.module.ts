import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentModule } from '../content/content.module';
import { Order, OrderItem, Payout, PayoutStatementLine, Product, Seller, TaxDocument, User } from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { FinanceChangeSubscriber } from './finance-change.subscriber';
import { FinanceGateway } from './finance.gateway';
import { FinanceService } from './finance.service';

/** Seller finance: earnings under the clearance hold, monthly statements, transactions, commission invoices. */
@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, Payout, PayoutStatementLine, Product, Seller, TaxDocument, User]), ContentModule, PayoutsModule, NotificationsModule],
  providers: [FinanceService, FinanceGateway, FinanceChangeSubscriber],
  exports: [FinanceService],
})
export class FinanceModule {}
