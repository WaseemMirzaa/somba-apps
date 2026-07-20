import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Campaign,
  Exchange,
  Order,
  Replacement,
  Seller,
} from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { CampaignsService } from './campaigns.service';
import { ReplacementsService } from './replacements.service';
import { ExchangesService } from './exchanges.service';

/**
 * Cross-cutting commerce flows that don't belong to a single existing domain:
 * seller marketing campaigns, item replacements, and exchanges.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, Replacement, Exchange, Order, Seller]),
    NotificationsModule,
  ],
  providers: [CampaignsService, ReplacementsService, ExchangesService],
  exports: [CampaignsService, ReplacementsService, ExchangesService],
})
export class FlowsModule {}
