import { Injectable, Logger } from '@nestjs/common';
import { LogisticsService } from '../logistics/logistics.service';

/** `LogisticsService.createReturnPickup` (docs/WAREHOUSE-SELLER-FLOWS-PLAN.md §7). */
export interface ReturnPickupInput {
  disputeId: string;
  orderId: string;
  items: { orderItemId: string; productId: string; qty: number }[];
}

/** `LogisticsService.createReplacementDelivery`: bring the new unit and collect the old one on the same trip. */
export interface ReplacementDeliveryInput {
  replacementId?: string;
  exchangeId?: string;
  orderId: string;
}

/**
 * The after-sale flows ask logistics to create delivery tasks; they never write tasks themselves. A refusal (an order
 * with no destination warehouse, say) is logged and leaves the request without a task: staff then dispatch by hand,
 * and the request itself is not lost.
 */
@Injectable()
export class LogisticsBridge {
  private readonly logger = new Logger(LogisticsBridge.name);

  constructor(private readonly logistics: LogisticsService) {}

  /** The task that collects the returned goods from the customer, or null when logistics could not create one. */
  async returnPickup(input: ReturnPickupInput): Promise<{ id: string } | null> {
    try {
      return (await this.logistics.createReturnPickup(input)) ?? null;
    } catch (e) {
      this.logger.warn(`createReturnPickup(${input.disputeId}) failed: ${(e as Error).message}`);
      return null;
    }
  }

  /** The first leg of the chain that brings the new unit (and takes the old one back). */
  async replacementDelivery(input: ReplacementDeliveryInput): Promise<{ id: string } | null> {
    try {
      return (await this.logistics.createReplacementDelivery(input)) ?? null;
    } catch (e) {
      this.logger.warn(`createReplacementDelivery(${input.replacementId ?? input.exchangeId}) failed: ${(e as Error).message}`);
      return null;
    }
  }
}
