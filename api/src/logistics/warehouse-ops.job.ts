import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AgedParcelsService } from './aged-parcels.service';
import { LogisticsService } from './logistics.service';

/** How often the warehouse job runs (ms). 0 switches it off (tests, or a second instance that should not sweep). */
const EVERY_MS = () => Number(process.env.WAREHOUSE_OPS_SWEEP_MS ?? 5 * 60_000);

/**
 * The warehouse operations job, one interval like the other sweepers (disputes, flash sales, campaigns): raise the aged-parcel
 * alerts that became due and give out the legs auto-assignment could not take earlier (made while a warehouse was closed).
 * Both steps are idempotent, so overlapping or repeated runs change nothing; a run that is still going when the next tick
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
  async run(now: Date = new Date()): Promise<{ aged: Awaited<ReturnType<AgedParcelsService['sweep']>>; autoAssigned: number } | null> {
    if (this.running) return null;
    this.running = true;
    try {
      const aged = await this.aged.sweep(now);
      const autoAssigned = await this.logistics.autoAssignWaiting(now);
      return { aged, autoAssigned };
    } finally {
      this.running = false;
    }
  }
}
