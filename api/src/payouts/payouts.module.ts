import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payout } from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { WalletModule } from '../wallet/wallet.module';
import { PayoutsService } from './payouts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payout]),
    WalletModule,
    NotificationsModule,
  ],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
