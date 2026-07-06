import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payout } from '../entities/payout.entity';
import { Seller } from '../entities/seller.entity';
import { OrderItem } from '../entities/order-item.entity';
import { OrderStatus, PayoutStatus } from '../common/enums';
import { AuthUser } from '../common/decorators';
import { round2 } from '../common/util';
import { AuditService } from './audit.service';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(Payout) private readonly payouts: Repository<Payout>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(OrderItem) private readonly items: Repository<OrderItem>,
    private readonly audit: AuditService,
  ) {}

  async overview() {
    const salesRow = await this.items
      .createQueryBuilder('i')
      .leftJoin('i.order', 'o')
      .select('COALESCE(SUM(i.lineTotal), 0)', 'gross')
      .addSelect('COALESCE(SUM(i.commissionAmount), 0)', 'commission')
      .addSelect('COALESCE(SUM(i.netToSeller), 0)', 'net')
      .where('o.status = :status', { status: OrderStatus.DELIVERED })
      .getRawOne<{ gross: string; commission: string; net: string }>();

    const requestedRow = await this.payouts
      .createQueryBuilder('p')
      .select('COUNT(p.id)', 'count')
      .addSelect('COALESCE(SUM(p.amountUsd), 0)', 'sum')
      .where('p.status = :status', { status: PayoutStatus.REQUESTED })
      .getRawOne<{ count: string; sum: string }>();

    const paidRow = await this.payouts
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amountUsd), 0)', 'sum')
      .where('p.status = :status', { status: PayoutStatus.PAID })
      .getRawOne<{ sum: string }>();

    return {
      grossSales: round2(parseFloat(salesRow?.gross ?? '0')),
      commissionRevenue: round2(parseFloat(salesRow?.commission ?? '0')),
      netToSellers: round2(parseFloat(salesRow?.net ?? '0')),
      payoutsRequested: {
        count: parseInt(requestedRow?.count ?? '0', 10),
        sum: round2(parseFloat(requestedRow?.sum ?? '0')),
      },
      payoutsPaid: round2(parseFloat(paidRow?.sum ?? '0')),
    };
  }

  listPayouts(opts: { status?: PayoutStatus }) {
    const qb = this.payouts
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.seller', 's')
      .orderBy('p.requestedAt', 'DESC');
    if (opts.status) qb.andWhere('p.status = :status', { status: opts.status });
    return qb.getMany();
  }

  private async getPayout(id: string) {
    const payout = await this.payouts.findOne({ where: { id } });
    if (!payout) throw new NotFoundException('Payout not found');
    return payout;
  }

  async approve(id: string, user: AuthUser) {
    const payout = await this.getPayout(id);
    if (payout.status !== PayoutStatus.REQUESTED) {
      throw new BadRequestException('Only requested payouts can be approved');
    }
    payout.status = PayoutStatus.APPROVED;
    payout.processedBy = user.email;
    const saved = await this.payouts.save(payout);
    await this.audit.log(user, 'payout.approve', 'Payout', id);
    return saved;
  }

  async markPaid(id: string, user: AuthUser) {
    const payout = await this.getPayout(id);
    if (payout.status !== PayoutStatus.APPROVED) {
      throw new BadRequestException('Only approved payouts can be marked paid');
    }
    payout.status = PayoutStatus.PAID;
    payout.processedBy = user.email;
    payout.processedAt = new Date();
    const saved = await this.payouts.save(payout);
    await this.audit.log(user, 'payout.mark-paid', 'Payout', id);
    return saved;
  }

  async reject(id: string, reason: string, user: AuthUser) {
    const payout = await this.getPayout(id);
    if (payout.status === PayoutStatus.PAID) {
      throw new BadRequestException('Paid payouts cannot be rejected');
    }
    const alreadyRejected = payout.status === PayoutStatus.REJECTED;
    payout.status = PayoutStatus.REJECTED;
    payout.processedBy = user.email;
    payout.note = reason;
    const saved = await this.payouts.save(payout);

    if (!alreadyRejected && payout.seller) {
      const seller = await this.sellers.findOne({
        where: { id: payout.seller.id },
      });
      if (seller) {
        seller.balanceUsd = round2(seller.balanceUsd + payout.amountUsd);
        await this.sellers.save(seller);
      }
    }

    await this.audit.log(user, 'payout.reject', 'Payout', id, reason);
    return saved;
  }
}
