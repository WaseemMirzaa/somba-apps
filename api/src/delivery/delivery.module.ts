import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryTask, Order } from '../database/entities';
import { PaymentsModule } from '../payments/payments.module';
import { ContentModule } from '../content/content.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { DeliveryService } from './delivery.service';

@Module({
  imports: [TypeOrmModule.forFeature([DeliveryTask, Order]), PaymentsModule, ContentModule, LogisticsModule],
  providers: [DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
