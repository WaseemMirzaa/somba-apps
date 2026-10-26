import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryTask, Dispute, DisputeItem, DisputeMessage, Order, OrderItem, Payment, Seller } from '../database/entities';
import { ContentModule } from '../content/content.module';
import { FlowsModule } from '../flows/flows.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsModule } from '../products/products.module';
import { PaymentsModule } from '../payments/payments.module';
import { WalletModule } from '../wallet/wallet.module';
import { DisputesService } from './disputes.service';
import { PartialRefundService } from './partial-refund.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Dispute, DisputeItem, DisputeMessage, Order, OrderItem, Payment, Seller, DeliveryTask]),
    NotificationsModule,
    PaymentsModule,
    ProductsModule,
    ContentModule,
    WalletModule,
    FlowsModule,
  ],
  providers: [DisputesService, PartialRefundService],
  exports: [DisputesService, PartialRefundService],
})
export class DisputesModule {}
