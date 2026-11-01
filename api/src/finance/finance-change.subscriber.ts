import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { EntitySubscriberInterface, InsertEvent, UpdateEvent } from 'typeorm';
import { Order, Payment, PaymentRefund, Payout } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { financeVersion } from './finance-version';

const ROOMS = ['admin', 'admin_finance'];

/**
 * Tells the finance screens that the numbers behind them moved: whenever an order, a payment, a refund or a payout is saved
 * (by any service, including their conditional UPDATEs), `finance:changed { version, updatedAt }` goes to admin and
 * admin_finance, at most once per debounce window. The web refreshes `analytics:finance` when the version differs
 * from the one it shows. Nothing is emitted when nobody could be listening.
 */
@Injectable()
export class FinanceChangeSubscriber implements EntitySubscriberInterface, OnModuleDestroy {
  private readonly logger = new Logger(FinanceChangeSubscriber.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Finance screens hear about changes within this long (many writes in a burst make one event). */
  private readonly debounceMs = Number(process.env.FINANCE_CHANGED_DEBOUNCE_MS ?? 750);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly emitter: RealtimeEmitter,
  ) {
    if (!ds.subscribers.includes(this)) ds.subscribers.push(this);
  }

  afterInsert(e: InsertEvent<unknown>): void {
    this.touch(e.metadata?.target);
  }

  afterUpdate(e: UpdateEvent<unknown>): void {
    this.touch(e.metadata?.target);
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
    const i = this.ds.subscribers.indexOf(this);
    if (i >= 0) this.ds.subscribers.splice(i, 1);
  }

  private touch(target: unknown): void {
    if (target !== Order && target !== Payment && target !== PaymentRefund && target !== Payout) return;
    if (this.timer || this.debounceMs <= 0) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      financeVersion(this.ds.manager)
        .then((v) => this.emitter.toRoles(ROOMS, 'finance:changed', v))
        .catch((err) => this.logger.warn(`finance:changed failed: ${(err as Error).message}`));
    }, this.debounceMs);
    this.timer.unref();
  }
}
