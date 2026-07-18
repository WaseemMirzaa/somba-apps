import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
   * Apply a balance change atomically-ish: recompute the running balance,
   * persist the user + a transaction row, and push both live to the owner.
   * Debits that would overdraw are rejected.
   */
  async apply(
    userId: string,
    type: WalletTxType,
    amount: number,
    description: string,
  ): Promise<WalletTransaction> {
    const value = Math.abs(amount);
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');

    const isCredit = CREDIT_TYPES.includes(type);
    if (!isCredit && user.walletBalance < value) {
      throw new BadRequestException('Insufficient wallet balance.');
    }
    user.walletBalance = Number(
      (user.walletBalance + (isCredit ? value : -value)).toFixed(2),
    );
    await this.users.save(user);

    const tx = await this.txs.save(
      this.txs.create({
        userId,
        type,
        amount: value,
        balance: user.walletBalance,
        description,
      }),
    );

    this.emitter.toUser(userId, 'wallet:updated', {
      balance: user.walletBalance,
    });
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
