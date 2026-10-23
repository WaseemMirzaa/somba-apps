import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DeliveryTask,
  Hub,
  Order,
  Product,
  Setting,
  StockTransfer,
  User,
  WarehouseBatch,
  WarehouseException,
} from '../database/entities';
import { WarehouseService } from './warehouse.service';
import { RiderService } from './rider.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Hub,
      WarehouseBatch,
      StockTransfer,
      DeliveryTask,
      Product,
      Order,
      WarehouseException,
      User,
      Setting,
    ]),
    NotificationsModule,
  ],
  providers: [WarehouseService, RiderService],
  exports: [WarehouseService, RiderService],
})
export class WarehouseModule {}
