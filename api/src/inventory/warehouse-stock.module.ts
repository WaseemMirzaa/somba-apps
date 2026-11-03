import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryTask, Hub, Product, User, WarehouseBin, WarehouseLedger, WarehouseStock } from '../database/entities';
import { LogisticsModule } from '../logistics/logistics.module';
import { ProductsModule } from '../products/products.module';
import { WarehouseStockGateway } from './warehouse-stock.gateway';
import { WarehouseStockService } from './warehouse-stock.service';

/** The warehouse stock ledger: bins, on-hand per SKU and bin, receive / move / count / stock-out. Sits on top of logistics custody. */
@Module({
  imports: [TypeOrmModule.forFeature([WarehouseBin, WarehouseStock, WarehouseLedger, DeliveryTask, Hub, Product, User]), LogisticsModule, ProductsModule],
  providers: [WarehouseStockService, WarehouseStockGateway],
  exports: [WarehouseStockService],
})
export class WarehouseStockModule {}
