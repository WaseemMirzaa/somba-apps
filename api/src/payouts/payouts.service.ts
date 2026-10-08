import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Order, Payout, Product, Seller } from '../database/entities';
import { SettingsService } from '../content/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { WalletService } from '../wallet/wallet.service';

const FINANCE_ROOMS = ['admin', 'admin_finance'];

@Injectable()
export class PayoutsService {
  constructor(
    @InjectRepository(Payout) private readonly payouts: Repository<Payout>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly settings: SettingsService,
    private readonly wallet: WalletService,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  /**
   * What a seller may withdraw right now: sales of THEIR products on orders that
   * were DELIVERED (and have cleared the hold, 48h by default in production),
   * minus the platform commission, minus everything already requested or paid.
   */
  async available(userId: string): Promise<{ earned: number; committed: number; available: number; commissionPct: number }> {
    const seller = await this.sellers.findOne({ where: { userId } });
    const sellerIds = [userId, ...(seller ? [seller.id] : [])];
    const mine = new Set((await this.products.find({ where: { sellerId: In(sellerIds) }, select: { id: true } })).map((p) => p.id));
    const commissionPct = Math.min(100, Math.max(0, Number((await this.settings.get('commissionPct')) ?? 12)));
    const holdHours = Number(process.env.PAYOUT_CLEARANCE_HOURS ?? (process.env.NODE_ENV === 'production' ? 48 : 0));
    const cutoff = new Date(Date.now() - holdHours * 3_600_000);
    let gross = 0;
    if (mine.size) {
      const rows = await this.orders
        .createQueryBuilder('o')
        .innerJoinAndSelect('o.items', 'i')
        .where("o.status = 'delivered' AND o.updatedAt <= :cutoff AND i.productId IN (:...ids)", { cutoff, ids: [...mine] })
        .getMany();
      for (const o of rows) {
        for (const i of o.items ?? []) if (mine.has(i.productId)) gross += i.priceUsd * i.qty;
      }
    }
    const earned = Number((gross * (1 - commissionPct / 100)).toFixed(2));
    const open = await this.payouts.find({ where: { sellerId: userId, status: In(['requested', 'approved', 'paid']) } });
    const committed = Number(open.reduce((t, p) => t + p.amountUsd, 0).toFixed(2));
    return { earned, committed, available: Number(Math.max(0, earned - committed).toFixed(2)), commissionPct };
  }

  async request(
    seller: { id: string; name: string },
    amountUsd: number,
    method = 'bank',
  ): Promise<Payout> {
    if (!(amountUsd >= 10)) throw new BadRequestException('The minimum payout is $10.');
    const { available } = await this.available(seller.id);
    if (amountUsd > available + 0.001) {
      throw new BadRequestException(`You can withdraw up to $${available.toFixed(2)} right now.`);
    }
    const payout = await this.payouts.save(
      this.payouts.create({
        reference: PayoutsService.newReference(),
        sellerId: seller.id,
        sellerName: seller.name,
        amountUsd,
        method: ['bank', 'mobile_money', 'wallet'].includes(method) ? method : 'bank',
        status: 'requested',
      }),
    );
    this.emitter.toUser(seller.id, 'payout:created', payout);
    this.emitter.toRoles(FINANCE_ROOMS, 'payout:created', payout);
    await this.notifications.toRole('admin_finance', {
      title: 'Payout requested',
      body: `${payout.reference} · ${seller.name} · $${amountUsd.toFixed(2)}`,
      type: 'payout',
      entityId: payout.id,
    });
    return payout;
  }

  async approve(payoutId: string): Promise<Payout> {
    const payout = await this.payouts.findOne({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found.');
    // Atomic: two finance users clicking at once pay it out exactly once, and the
    // wallet credit commits together with the status change.
    const won = await this.payouts.manager.transaction(async (m) => {
      const res = await m
        .createQueryBuilder()
        .update(Payout)
        .set({ status: 'paid' })
        .where("id = :id AND status = 'requested'", { id: payoutId })
        .execute();
      if (!res.affected) return false;
      await this.wallet.apply(payout.sellerId, 'credit', payout.amountUsd, `Payout ${payout.reference}`, m);
      return true;
    });
    if (!won) throw new BadRequestException('This payout is no longer awaiting approval.');
    const saved = (await this.payouts.findOne({ where: { id: payoutId } }))!;
    this.emitter.toUser(saved.sellerId, 'payout:updated', saved);
    this.emitter.toRoles(FINANCE_ROOMS, 'payout:updated', saved);
    await this.notifications.toUser(saved.sellerId, {
      title: 'Payout paid',
      body: `${saved.reference} · $${saved.amountUsd.toFixed(2)} settled to your wallet.`,
      type: 'payout',
      entityId: saved.id,
    });
    return saved;
  }

  async reject(payoutId: string, note?: string): Promise<Payout> {
    const payout = await this.payouts.findOne({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found.');
    const res = await this.payouts
      .createQueryBuilder()
      .update(Payout)
      .set({ status: 'rejected', note: note?.trim().slice(0, 250) || null })
      .where("id = :id AND status = 'requested'", { id: payoutId })
      .execute();
    if (!res.affected) throw new BadRequestException('Only a pending payout can be rejected.');
    const saved = (await this.payouts.findOne({ where: { id: payoutId } }))!;
    this.emitter.toUser(saved.sellerId, 'payout:updated', saved);
    this.emitter.toRoles(FINANCE_ROOMS, 'payout:updated', saved);
    await this.notifications.toUser(saved.sellerId, {
      title: 'Payout rejected',
      body: `${saved.reference}${note ? ` — ${note}` : ''}.`,
      type: 'payout',
      entityId: saved.id,
    });
    return saved;
  }

  list(user: { id: string; role: string }): Promise<Payout[]> {
    // Finance sees everything; any other role only its own payouts.
    if (user.role === 'admin' || user.role === 'admin_finance') {
      return this.payouts.find({ order: { createdAt: 'DESC' }, take: 200 });
    }
    return this.payouts.find({ where: { sellerId: user.id }, order: { createdAt: 'DESC' } });
  }

  private static newReference(): string {
    const n = Math.floor(1000 + Math.random() * 9000);
    return `PO-${Date.now().toString().slice(-6)}${n}`.slice(0, 24);
  }
}
