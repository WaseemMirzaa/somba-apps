import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryTask, Hub, Order, OrderItem, Seller, User } from '../database/entities';
import { DeliveryModule } from '../delivery/delivery.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { ContentModule } from '../content/content.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsModule } from '../products/products.module';
import { PaymentsModule } from '../payments/payments.module';
import { WalletModule } from '../wallet/wallet.module';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, DeliveryTask, Seller, Hub, User]),
    DeliveryModule,
    LogisticsModule,
    ProductsModule,
    NotificationsModule,
    PaymentsModule,
    WalletModule,
    ContentModule,
  ],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
