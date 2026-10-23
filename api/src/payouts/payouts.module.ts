import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentModule } from '../content/content.module';
import { Order, Payout, PayoutStatementLine, Product, Seller } from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { WalletModule } from '../wallet/wallet.module';
import { PaymentsModule } from '../payments/payments.module';
import { PayoutsService } from './payouts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payout, PayoutStatementLine, Order, Product, Seller]),
    WalletModule,
    NotificationsModule,
    ContentModule,
    PaymentsModule,
  ],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
