import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryTask, Order, User } from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { ContentModule } from '../content/content.module';
import { DeliveryService } from './delivery.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeliveryTask, Order, User]),
    NotificationsModule,
    PaymentsModule,
    ContentModule,
  ],
  providers: [DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
