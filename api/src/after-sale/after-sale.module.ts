import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { EngagementGateway } from '../content/engagement.gateway';
import { SupportGateway } from '../content/support.gateway';
import { DisputesGateway } from '../disputes/disputes.gateway';
import { DisputesModule } from '../disputes/disputes.module';
import { AfterSaleGateway } from '../flows/after-sale.gateway';
import { FlowsModule } from '../flows/flows.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { NotificationsModule } from '../notifications/notifications.module';
import { OpsModule } from '../ops/ops.module';
import { AfterSaleLogisticsListener } from './logistics-listener';

/**
 * The after-sale and engagement handlers (returns, disputes, replacements, exchanges, Q&A, reviews, support, the
 * bell) as gateways of their own on the shared Socket.IO server, plus the listener that follows logistics tasks.
 * Contract: docs/contracts/after-sale.md.
 */
@Module({
  imports: [DisputesModule, FlowsModule, ContentModule, NotificationsModule, OpsModule, LogisticsModule],
  providers: [DisputesGateway, AfterSaleGateway, EngagementGateway, SupportGateway, NotificationsGateway, AfterSaleLogisticsListener],
})
export class AfterSaleModule {}
