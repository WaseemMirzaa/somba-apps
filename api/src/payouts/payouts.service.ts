import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payout } from '../database/entities';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { WalletService } from '../wallet/wallet.service';

const FINANCE_ROOMS = ['admin', 'admin_finance'];

@Injectable()
export class PayoutsService {
  constructor(
    @InjectRepository(Payout) private readonly payouts: Repository<Payout>,
    private readonly wallet: WalletService,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  async request(
    seller: { id: string; name: string },
    amountUsd: number,
    method = 'bank',
  ): Promise<Payout> {
    if (amountUsd <= 0) throw new BadRequestException('Amount must be positive.');
    const payout = await this.payouts.save(
      this.payouts.create({
        reference: PayoutsService.newReference(),
        sellerId: seller.id,
        sellerName: seller.name,
        amountUsd,
        method,
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
    if (payout.status !== 'requested') {
      throw new BadRequestException('Payout is not in a requestable state.');
    }
    payout.status = 'paid';
    const saved = await this.payouts.save(payout);
    // Settle to the seller's wallet (store-credit ledger).
    await this.wallet.apply(
      saved.sellerId,
      'credit',
      saved.amountUsd,
      `Payout ${saved.reference}`,
    );
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
    payout.status = 'rejected';
    payout.note = note ?? null;
    const saved = await this.payouts.save(payout);
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
    if (user.role === 'seller') {
      return this.payouts.find({
        where: { sellerId: user.id },
        order: { createdAt: 'DESC' },
      });
    }
    return this.payouts.find({ order: { createdAt: 'DESC' }, take: 200 });
  }

  private static newReference(): string {
    const n = Math.floor(1000 + Math.random() * 9000);
    return `PO-${Date.now().toString().slice(-6)}${n}`.slice(0, 24);
  }
}
