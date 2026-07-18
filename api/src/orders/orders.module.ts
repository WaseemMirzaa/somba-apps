import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryTask, Order, OrderItem } from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsModule } from '../products/products.module';
import { PaymentsModule } from '../payments/payments.module';
import { WalletModule } from '../wallet/wallet.module';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, DeliveryTask]),
    ProductsModule,
    NotificationsModule,
    PaymentsModule,
    WalletModule,
  ],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
