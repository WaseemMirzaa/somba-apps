import { Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentModule } from '../content/content.module';
import { DeliveryTask, Order, Payment } from '../database/entities';
import { ProductsModule } from '../products/products.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WalletModule } from '../wallet/wallet.module';
import { MOBILE_MONEY_PROVIDER, createMobileMoneyProvider } from './mobile-money.provider';
import { PAWAPAY_CLIENT, PawapayClient, PawapayMobileMoneyProvider, createPawapayClient } from './pawapay.provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order, DeliveryTask]),
    WalletModule,
    NotificationsModule,
    ContentModule,
    ProductsModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    { provide: PAWAPAY_CLIENT, useFactory: createPawapayClient },
    {
      provide: MOBILE_MONEY_PROVIDER,
      inject: [PAWAPAY_CLIENT],
      useFactory: (pawapay: PawapayClient | null) => {
        if ((process.env.MM_PROVIDER ?? '').toLowerCase() !== 'pawapay') return createMobileMoneyProvider();
        if (!pawapay) {
          // Fail closed until the token is set: mobile money is refused rather than faked.
          new Logger('PaymentsModule').warn('MM_PROVIDER=pawapay but PAWAPAY_API_TOKEN is empty: mobile money is off.');
          return null;
        }
        return new PawapayMobileMoneyProvider(pawapay);
      },
    },
  ],
  exports: [PaymentsService, PAWAPAY_CLIENT],
})
export class PaymentsModule {}
