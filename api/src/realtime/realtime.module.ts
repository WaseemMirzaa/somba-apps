import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallet/wallet.module';
import { PaymentsModule } from '../payments/payments.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { DisputesModule } from '../disputes/disputes.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AddressesModule } from '../addresses/addresses.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    ProductsModule,
    OrdersModule,
    DeliveryModule,
    NotificationsModule,
    WalletModule,
    PaymentsModule,
    PayoutsModule,
    DisputesModule,
    CatalogModule,
    AddressesModule,
  ],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
