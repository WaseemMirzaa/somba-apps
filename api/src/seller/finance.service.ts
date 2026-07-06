import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Seller } from '../entities/seller.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Payout } from '../entities/payout.entity';
import { OrderStatus, PayoutStatus } from '../common/enums';
import { refCode, round2 } from '../common/util';
import { RequestPayoutDto } from './dto';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(OrderItem) private readonly items: Repository<OrderItem>,
    @InjectRepository(Payout) private readonly payouts: Repository<Payout>,
  ) {}

  private requireSeller(sellerId?: string): string {
    if (!sellerId) throw new ForbiddenException('No seller profile');
    return sellerId;
  }

  private async getSeller(id: string): Promise<Seller> {
    const seller = await this.sellers.findOne({ where: { id } });
    if (!seller) throw new NotFoundException('Seller not found');
    return seller;
  }

  private deliveredItems(sellerId: string) {
    return this.items.find({
      where: {
        seller: { id: sellerId },
        fulfillmentStatus: OrderStatus.DELIVERED,
      },
      order: { order: { createdAt: 'DESC' } },
      relations: { order: true },
    });
  }

  async summary(sellerId: string | undefined) {
    const id = this.requireSeller(sellerId);
    const seller = await this.getSeller(id);
    const items = await this.deliveredItems(id);

    const gross = round2(items.reduce((s, it) => s + Number(it.lineTotal), 0));
    const commission = round2(
      items.reduce((s, it) => s + Number(it.commissionAmount), 0),
    );
    const net = round2(items.reduce((s, it) => s + Number(it.netToSeller), 0));

    const pending = await this.payouts.find({
      where: [
        { seller: { id }, status: PayoutStatus.REQUESTED },
        { seller: { id }, status: PayoutStatus.APPROVED },
      ],
    });
    const pendingPayoutsTotal = round2(
      pending.reduce((s, p) => s + Number(p.amountUsd), 0),
    );

    return {
      availableBalanceUsd: round2(Number(seller.balanceUsd)),
      lifetimeGrossUsd: gross,
      lifetimeCommissionUsd: commission,
      lifetimeNetUsd: net,
      pendingPayoutsTotalUsd: pendingPayoutsTotal,
    };
  }

  listPayouts(sellerId: string | undefined) {
    const id = this.requireSeller(sellerId);
    return this.payouts.find({
      where: { seller: { id } },
      order: { requestedAt: 'DESC' },
    });
  }

  async requestPayout(sellerId: string | undefined, dto: RequestPayoutDto) {
    const id = this.requireSeller(sellerId);
    const seller = await this.getSeller(id);

    if (dto.amountUsd <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    if (dto.amountUsd > Number(seller.balanceUsd)) {
      throw new BadRequestException('Amount exceeds available balance');
    }

    const payout = this.payouts.create({
      reference: refCode('PO'),
      seller: { id } as any,
      amountUsd: round2(dto.amountUsd),
      status: PayoutStatus.REQUESTED,
      method: dto.method || 'bank_transfer',
      note: dto.note,
    });
    const saved = await this.payouts.save(payout);

    seller.balanceUsd = round2(Number(seller.balanceUsd) - dto.amountUsd);
    await this.sellers.save(seller);

    return saved;
  }

  async transactions(sellerId: string | undefined) {
    const id = this.requireSeller(sellerId);
    const items = await this.deliveredItems(id);
    const payouts = await this.listPayouts(id);

    const saleTx = items.map((it) => ({
      type: 'sale' as const,
      date: it.order?.createdAt,
      orderCode: it.order?.code,
      gross: round2(Number(it.lineTotal)),
      commission: round2(Number(it.commissionAmount)),
      net: round2(Number(it.netToSeller)),
    }));

    const payoutTx = payouts.map((p) => ({
      type: 'payout' as const,
      date: p.requestedAt,
      reference: p.reference,
      amount: round2(Number(p.amountUsd)),
      status: p.status,
    }));

    return [...saleTx, ...payoutTx].sort(
      (a, b) =>
        (b.date ? new Date(b.date).getTime() : 0) -
        (a.date ? new Date(a.date).getTime() : 0),
    );
  }
}
