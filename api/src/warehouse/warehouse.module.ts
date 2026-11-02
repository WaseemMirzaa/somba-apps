import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuditLog,
  CodHandover,
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
import { CashService } from './cash.service';
import { CashGateway } from './cash.gateway';
import { LogisticsModule } from '../logistics/logistics.module';
import { GeoModule } from '../geo/geo.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsModule } from '../products/products.module';

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
      CodHandover,
      AuditLog,
    ]),
    LogisticsModule,
    GeoModule,
    NotificationsModule,
    ProductsModule,
  ],
  providers: [WarehouseService, RiderService, CashService, CashGateway],
  exports: [WarehouseService, RiderService, CashService],
})
export class WarehouseModule {}
