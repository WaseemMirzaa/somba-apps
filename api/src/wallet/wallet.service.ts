import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { User, WalletTransaction } from '../database/entities';
import type { WalletTxType } from '../database/entities/wallet-transaction.entity';
import { RealtimeEmitter } from '../realtime/realtime-emitter';

/** Transaction types that ADD to the balance; the rest subtract. */
const CREDIT_TYPES: WalletTxType[] = ['credit', 'cashback', 'refund', 'topup'];

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(WalletTransaction)
    private readonly txs: Repository<WalletTransaction>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  async getBalance(userId: string): Promise<number> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    return user.walletBalance;
  }

  list(userId: string): Promise<WalletTransaction[]> {
    return this.txs.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  /**
   * Apply a balance change ATOMICALLY. The balance is changed with a single
   * conditional `UPDATE` (a debit only matches while enough money is left), so
   * concurrent requests can never double-spend, and the ledger row is written
   * in the same transaction. Pass `manager` to join a caller's transaction.
   */
  async apply(
    userId: string,
    type: WalletTxType,
    amount: number,
    description: string,
    manager?: EntityManager,
  ): Promise<WalletTransaction> {
    const value = Number(Math.abs(amount).toFixed(2));
    if (!(value > 0)) throw new BadRequestException('Amount must be greater than zero.');
    const isCredit = CREDIT_TYPES.includes(type);

    const run = async (m: EntityManager) => {
      const res = await m
        .createQueryBuilder()
        .update(User)
        .set({ walletBalance: () => `ROUND(walletBalance ${isCredit ? '+' : '-'} ${value}, 2)` })
        .where(isCredit ? 'id = :id' : 'id = :id AND walletBalance >= :v', { id: userId, v: value })
        .execute();
      if (!res.affected) {
        const exists = await m.findOne(User, { where: { id: userId } });
        if (!exists) throw new NotFoundException('User not found.');
        throw new BadRequestException('Insufficient wallet balance.');
      }
      const user = (await m.findOne(User, { where: { id: userId } }))!;
      const tx = await m.save(
        m.create(WalletTransaction, { userId, type, amount: value, balance: user.walletBalance, description }),
      );
      return { tx, balance: user.walletBalance };
    };

    const { tx, balance } = manager ? await run(manager) : await this.users.manager.transaction(run);
    this.emitter.toUser(userId, 'wallet:updated', { balance });
    this.emitter.toUser(userId, 'wallet:transaction', tx);
    return tx;
  }

  topUp(userId: string, amount: number, method = 'card'): Promise<WalletTransaction> {
    if (amount <= 0) throw new BadRequestException('Top-up must be positive.');
    return this.apply(userId, 'topup', amount, `Wallet top-up via ${method}`);
  }

  debit(userId: string, amount: number, description: string) {
    return this.apply(userId, 'debit', amount, description);
  }

  refund(userId: string, amount: number, description: string) {
    return this.apply(userId, 'refund', amount, description);
  }
}
