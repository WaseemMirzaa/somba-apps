import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CaseSellerMessage, DeliveryTask, Dispute, DisputeMessage, Exchange, Replacement, Seller } from '../database/entities';
import { ContentModule } from '../content/content.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OpsModule } from '../ops/ops.module';
import { AfterSaleAccessService } from './after-sale-access.service';
import { CaseThreadService } from './case-thread.service';
import { SellerAfterSaleGateway } from './seller-after-sale.gateway';
import { SellerAfterSaleViewService } from './seller-after-sale.service';

/**
 * The seller portal's read-only after-sale view (docs/contracts/admin-controls.md §13): the section switches, the redacted views,
 * the pushes and notices, the private seller <-> support threads. Imported by the modules that publish cases (disputes, flows) and
 * by the after-sale gateways; it imports none of them. The seller context and the team directory are global.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Seller, DeliveryTask, CaseSellerMessage, Dispute, DisputeMessage, Exchange, Replacement]), ContentModule, NotificationsModule, OpsModule],
  providers: [AfterSaleAccessService, SellerAfterSaleViewService, CaseThreadService, SellerAfterSaleGateway],
  exports: [AfterSaleAccessService, SellerAfterSaleViewService, CaseThreadService],
})
export class SellerAfterSaleModule {}
