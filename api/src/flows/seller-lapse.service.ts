import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Exchange, Replacement, Seller } from '../database/entities';
import { NotificationsService } from '../notifications/notifications.service';
import { sellerUserId } from '../orders/order-sellers';

/** Read when the module starts (not when the file loads), so a value from `.env` counts too. */
const sweepMs = () => Number(process.env.AFTER_SALE_SWEEP_MS ?? 60_000);

/**
 * Replacements and exchanges give the seller a response time too (`sellerDueAt`, the platform's `sellerResponseHours`).
 * When it runs out with no answer, nothing used to happen: an exchange kept the customer's price difference held in
 * limbo and the seller's "Overdue" pill just sat there. Now the customer, the seller and KOMORIKO support are told once
 * (`sellerLapsedAt` is the mark, set by a conditional update so two API instances cannot both tell), and support
 * can approve or refuse it on the seller's behalf, as before. The request itself keeps its status: a late answer
 * from the seller is still accepted until support decides.
 */
@Injectable()
export class SellerLapseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SellerLapseService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(Replacement) private readonly replacements: Repository<Replacement>,
    @InjectRepository(Exchange) private readonly exchanges: Repository<Exchange>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    const every = sweepMs();
    if (every > 0) {
      this.timer = setInterval(() => void this.sweep().catch((e) => this.logger.warn(`lapse sweep failed: ${(e as Error).message}`)), every);
      this.timer.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Tell everyone about the requests whose response time just ran out; returns how many were new. */
  async sweep(now = new Date()): Promise<number> {
    return (await this.lapse(this.replacements, 'replacement', now)) + (await this.lapse(this.exchanges as unknown as Repository<Replacement>, 'exchange', now));
  }

  /** Both tables carry the same fields this needs (`status`, `sellerDueAt`, `sellerLapsedAt`, `reference`…). */
  private async lapse(repo: Repository<Replacement>, type: 'replacement' | 'exchange', now: Date): Promise<number> {
    const due = await repo
      .createQueryBuilder('r')
      .where("r.status = 'requested' AND r.sellerLapsedAt IS NULL AND r.sellerDueAt IS NOT NULL AND r.sellerDueAt < :now", { now })
      .take(100)
      .getMany();
    let told = 0;
    for (const r of due) {
      const res = await repo
        .createQueryBuilder()
        .update()
        .set({ sellerLapsedAt: now } as never)
        .where("id = :id AND status = 'requested' AND sellerLapsedAt IS NULL", { id: r.id })
        .execute();
      if (!res.affected) continue;
      told++;
      const body = `${r.reference} · ${r.orderReference}`;
      if (r.customerId) await this.notifications.toUser(r.customerId, { title: 'Seller did not respond', body, type, entityId: r.id });
      if (r.sellerId) await this.notifications.toUser(await sellerUserId(r.sellerId, this.sellers), { title: 'Seller did not respond', body, type, entityId: r.id });
      await this.notifications.toRole('admin_support', { title: 'Seller did not respond', body, type, entityId: r.id });
    }
    return told;
  }
}
