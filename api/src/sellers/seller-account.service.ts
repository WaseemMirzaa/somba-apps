import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Order, OrderItem, Payout, Seller } from '../database/entities';
import { SellersService } from '../ops/sellers.service';
import { PayoutsService } from '../payouts/payouts.service';
import { SellerContextService } from './seller-context';
import { TeamService } from './team.service';

/** Order statuses in which a store still owes the customer something. */
const IN_FLIGHT = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery'];
const LIVE_PAYOUT = ['requested', 'approved', 'sending'];
export const DELETED_REASON = 'The owner deleted the account.';

/**
 * Deleting a seller account. A team member simply leaves their seat. An owner closes the store: `check` refuses
 * while orders are still in flight, a payout is pending or earnings are unpaid (nothing may be lost on either side);
 * `finish` then closes the store (listings come down, staff seats end).
 */
@Injectable()
export class SellerAccountService {
  constructor(
    @InjectRepository(OrderItem) private readonly items: Repository<OrderItem>,
    @InjectRepository(Payout) private readonly payoutRows: Repository<Payout>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly ctx: SellerContextService,
    private readonly team: TeamService,
    private readonly sellersSvc: SellersService,
    private readonly payouts: PayoutsService,
  ) {}

  /** Can this account be deleted right now? Throws the reason when not. No side effects. */
  async check(user: { id: string }): Promise<void> {
    const found = await this.ctx.membership(user.id);
    if (!found || found.member !== 'owner') return;
    const seller = found.seller;
    const ids = [seller.id, ...(seller.userId ? [seller.userId] : [])];
    const inFlight = await this.items
      .createQueryBuilder('i')
      .innerJoin(Order, 'o', 'o.id = i.orderId')
      .select('COUNT(DISTINCT o.id)', 'n')
      .where("i.sellerId IN (:...ids) AND i.fulfilment <> 'cancelled' AND o.status IN (:...open)", { ids, open: IN_FLIGHT })
      .getRawOne<{ n: string }>();
    const n = Number(inFlight?.n ?? 0);
    if (n > 0) throw new BadRequestException(`You still have ${n} order${n === 1 ? '' : 's'} in progress. Finish or cancel ${n === 1 ? 'it' : 'them'} before deleting your account.`);
    if (await this.payoutRows.count({ where: { sellerId: seller.userId ?? seller.id, status: In(LIVE_PAYOUT) } })) {
      throw new BadRequestException('A payout is still being processed. Wait until it is paid before deleting your account.');
    }
    const balance = await this.payouts.available(seller.userId ?? seller.id);
    if (balance.available > 0.009) {
      throw new BadRequestException(`You still have $${balance.available.toFixed(2)} to withdraw. Request a payout first, then delete your account.`);
    }
  }

  /** The account was erased: a team member's seat ends; an owner's store is closed (listings come down, staff seats end). */
  async finish(user: { id: string; name: string }): Promise<void> {
    const found = await this.ctx.membership(user.id);
    if (!found) return;
    if (found.member !== 'owner') {
      await this.team.leave(user);
      return;
    }
    await this.team.releaseAll(found.seller);
    if (found.seller.status !== 'suspended') await this.sellersSvc.setStatus(found.seller.id, 'suspended', DELETED_REASON);
  }
}
