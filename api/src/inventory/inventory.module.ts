import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order, OrderItem, Product, Seller, StockMovement } from '../database/entities';
import { CartModule } from '../cart/cart.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsModule } from '../products/products.module';
import { InventoryGateway } from './inventory.gateway';
import { InventoryService } from './inventory.service';

/** Stock adjustments with a movement ledger, the per-store low-stock line and notices, per-option stock checks. */
@Module({
  imports: [TypeOrmModule.forFeature([Product, Seller, Order, OrderItem, StockMovement]), ProductsModule, NotificationsModule, CartModule],
  providers: [InventoryService, InventoryGateway],
  exports: [InventoryService],
})
export class InventoryModule {}
