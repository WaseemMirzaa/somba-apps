import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dispute, Order } from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { DisputesService } from './disputes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Dispute, Order]),
    NotificationsModule,
    PaymentsModule,
  ],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
