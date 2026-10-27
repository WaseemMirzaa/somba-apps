import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { GLOBAL_THROTTLE_LIMIT, THROTTLE_WINDOW_MS } from './auth/throttle';
import { AppController } from './app.controller';
import configuration from './config/configuration';
import { CryptoModule } from './common/crypto/crypto.module';
import { DatabaseModule } from './database/database.module';
import { RealtimeCoreModule } from './realtime/realtime-core.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { DeliveryModule } from './delivery/delivery.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WalletModule } from './wallet/wallet.module';
import { PaymentsModule } from './payments/payments.module';
import { PayoutsModule } from './payouts/payouts.module';
import { DisputesModule } from './disputes/disputes.module';
import { CatalogModule } from './catalog/catalog.module';
import { AddressesModule } from './addresses/addresses.module';
import { ContentModule } from './content/content.module';
import { OpsModule } from './ops/ops.module';
import { WarehouseModule } from './warehouse/warehouse.module';
import { LogisticsModule } from './logistics/logistics.module';
import { GeoModule } from './geo/geo.module';
import { FlowsModule } from './flows/flows.module';
import { MessagingModule } from './messaging/messaging.module';
import { UploadsModule } from './uploads/uploads.module';
import { CartModule } from './cart/cart.module';
import { SearchModule } from './search/search.module';
import { AfterSaleModule } from './after-sale/after-sale.module';
import { RealtimeModule } from './realtime/realtime.module';
import { CommerceModule } from './products/commerce.module';
import { FinanceModule } from './finance/finance.module';
import { InventoryModule } from './inventory/inventory.module';
import { TranslationModule } from './translation/translation.module';
import { SellerPlatformModule } from './sellers/seller-platform.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    // Rate-limit the REST auth endpoints (30 requests / minute / IP); /auth/refresh has its own higher limit.
    ThrottlerModule.forRoot([{ ttl: THROTTLE_WINDOW_MS, limit: GLOBAL_THROTTLE_LIMIT }]),
    CryptoModule,
    RealtimeCoreModule,
    DatabaseModule,
    TranslationModule,
    UsersModule,
    AuthModule,
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
    ContentModule,
    OpsModule,
    WarehouseModule,
    GeoModule,
    LogisticsModule,
    FlowsModule,
    MessagingModule,
    UploadsModule,
    CartModule,
    SearchModule,
    InventoryModule,
    FinanceModule,
    CommerceModule,
    SellerPlatformModule,
    AfterSaleModule,
    RealtimeModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
