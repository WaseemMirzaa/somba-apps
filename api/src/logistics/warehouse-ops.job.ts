import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AgedParcelsService } from './aged-parcels.service';
import { LogisticsService } from './logistics.service';

/** How often the warehouse job runs (ms). 0 switches it off (tests, or a second instance that should not sweep). */
const EVERY_MS = () => Number(process.env.WAREHOUSE_OPS_SWEEP_MS ?? 5 * 60_000);

/** The steps of one pass, in order: the aged-parcel alerts, auto-assignment of waiting legs, and planning of waiting (split) orders. */
export const JOB_STEPS = ['aged', 'assign', 'split'] as const;
export type JobStep = (typeof JOB_STEPS)[number];

/** What one pass did: alert levels raised, legs given to riders, customer legs planned (a partial leg after the split limit, or one a scan-in failed to create). */
export interface JobResult {
  aged: Awaited<ReturnType<AgedParcelsService['sweep']>>;
  autoAssigned: number;
  split: number;
}

/**
 * The warehouse operations job, one interval like the other sweepers (disputes, flash sales, campaigns): raise the aged-parcel
 * alerts that became due, give out the legs auto-assignment could not take earlier (made while a warehouse was closed), then plan
 * the customer legs of orders whose parcels have waited at the destination warehouse longer than `splitDeliveryAfterHours`.
 * Every step is idempotent, so overlapping or repeated runs change nothing; a run that is still going when the next tick
 * arrives is skipped.
 */
@Injectable()
export class WarehouseOpsJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WarehouseOpsJob.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly aged: AgedParcelsService,
    private readonly logistics: LogisticsService,
  ) {}

  onModuleInit(): void {
    const every = EVERY_MS();
    if (every > 0) {
      this.timer = setInterval(() => void this.run().catch((e) => this.logger.warn(`warehouse job failed: ${(e as Error).message}`)), every);
      this.timer.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass. Returns what it did (also used by tests and the smoke through `warehouseOps:runNow`). */
  async run(now: Date = new Date(), only: readonly JobStep[] = JOB_STEPS): Promise<JobResult | null> {
    if (this.running) return null;
    this.running = true;
    try {
      const aged = only.includes('aged') ? await this.aged.sweep(now) : { checked: 0, alerted: 0, skipped: 0 };
      const autoAssigned = only.includes('assign') ? await this.logistics.autoAssignWaiting(now) : 0;
      const split = only.includes('split') ? await this.logistics.planWaiting(now) : 0;
      return { aged, autoAssigned, split };
    } finally {
      this.running = false;
    }
  }
}
