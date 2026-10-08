import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentModule } from '../content/content.module';
import { Order, Payment } from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { WalletModule } from '../wallet/wallet.module';
import { MOBILE_MONEY_PROVIDER, createMobileMoneyProvider } from './mobile-money.provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order]),
    WalletModule,
    NotificationsModule,
    ContentModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    { provide: MOBILE_MONEY_PROVIDER, useFactory: createMobileMoneyProvider },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
