import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DeliveryTask,
  Hub,
  Order,
  Product,
  StockTransfer,
  WarehouseBatch,
  WarehouseException,
} from '../database/entities';
import { WarehouseService } from './warehouse.service';
import { RiderService } from './rider.service';

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
    ]),
  ],
  providers: [WarehouseService, RiderService],
  exports: [WarehouseService, RiderService],
})
export class WarehouseModule {}
