import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryTask, Order } from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { DeliveryService } from './delivery.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeliveryTask, Order]),
    NotificationsModule,
    PaymentsModule,
  ],
  providers: [DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
