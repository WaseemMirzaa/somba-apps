import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DisputesService } from '../disputes/disputes.service';
import { ExchangesService } from '../flows/exchanges.service';
import { ReplacementsService } from '../flows/replacements.service';
import { LogisticsService } from '../logistics/logistics.service';
import type { LogisticsEvent } from '../logistics/logistics.service';

/**
 * Follows the delivery tasks logistics creates for after-sale requests:
 *  - the return pickup scanned in at the warehouse -> the return is `received` (and, if the seller or support said
 *    yes, the returned items are refunded);
 *  - the last leg of a replacement / exchange picked up -> `dispatched`, delivered -> `delivered` (the dead end the
 *    old `dispatched` status was is closed).
 */
@Injectable()
export class AfterSaleLogisticsListener implements OnModuleInit {
  private readonly logger = new Logger(AfterSaleLogisticsListener.name);

  constructor(
    private readonly logistics: LogisticsService,
    private readonly disputes: DisputesService,
    private readonly replacements: ReplacementsService,
    private readonly exchanges: ExchangesService,
  ) {}

  onModuleInit(): void {
    this.logistics.registerListener((e) => this.handle(e));
  }

  async handle({ type, task }: LogisticsEvent): Promise<void> {
    try {
      if (task.kind === 'return_pickup' && task.disputeId && (type === 'scanned_in' || type === 'delivered')) {
        await this.disputes.onReturnReceived(task.disputeId);
        return;
      }
      if (task.kind === 'replacement_delivery' && (type === 'picked_up' || type === 'in_transit' || type === 'delivered')) {
        if (task.replacementId) await this.replacements.syncFromDelivery(task.replacementId, type);
        if (task.exchangeId) await this.exchanges.syncFromDelivery(task.exchangeId, type);
      }
    } catch (e) {
      // "Already received" and the like: the request is where it should be.
      this.logger.debug(`${type} ${task.id}: ${(e as Error).message}`);
    }
  }
}
