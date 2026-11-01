import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { ContentModule } from '../content/content.module';
import { Order, OrderItem, Product, Seller } from '../database/entities';
import { FlowsModule } from '../flows/flows.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OpsModule } from '../ops/ops.module';
import { OrdersModule } from '../orders/orders.module';
import { SellerOrdersService } from '../orders/seller-orders.service';
import { CommerceGateway } from './commerce.gateway';
import { ProductImportService } from './product-import.service';
import { ProductsModule } from './products.module';

/** Bulk import, store coupons, flash-sale nominations, campaign tracking and the seller's paged orders. */
@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Product, Seller]),
    ProductsModule,
    CatalogModule,
    ContentModule,
    FlowsModule,
    NotificationsModule,
    OpsModule,
    OrdersModule,
  ],
  providers: [CommerceGateway, ProductImportService, SellerOrdersService],
})
export class CommerceModule {}
