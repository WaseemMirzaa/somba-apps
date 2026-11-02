import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, User, WalletTransaction } from '../database/entities';
import { localizeWalletDescription } from '../notifications/localize';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';
import { pageOf } from '../common/paging';

export interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  walletBalance: number;
  active: boolean;
  orders: number;
  spendUsd: number;
  createdAt: Date;
}

/** A customer's wallet as an admin reads it: the balance and the newest ledger lines, with the text in both languages. */
export interface CustomerWallet {
  balance: number;
  transactions: (WalletTransaction & { descriptionFr: string })[];
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(WalletTransaction) private readonly walletTxs: Repository<WalletTransaction>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  async list(paging?: unknown): Promise<CustomerRow[]> {
    const { take, skip } = pageOf(paging);
    const customers = await this.users.find({ where: { role: 'customer' }, order: { createdAt: 'DESC', id: 'ASC' }, take, skip });
    // One aggregate query instead of loading every order into memory.
    const totals = await this.orders
      .createQueryBuilder('o')
      .select('o.customerId', 'id')
      .addSelect('COUNT(*)', 'n')
      .addSelect('COALESCE(SUM(o.totalUsd), 0)', 'spend')
      .where("o.status != 'cancelled'")
      .andWhere(customers.length ? 'o.customerId IN (:...cids)' : '1 = 0', { cids: customers.map((c) => c.id) })
      .groupBy('o.customerId')
      .getRawMany<{ id: string; n: string; spend: string }>();
    const byId = new Map(totals.map((t) => [t.id, t]));
    return customers.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      walletBalance: c.walletBalance,
      active: c.active,
      orders: Number(byId.get(c.id)?.n ?? 0),
      spendUsd: Number(Number(byId.get(c.id)?.spend ?? 0).toFixed(2)),
      createdAt: c.createdAt,
    }));
  }

  /** Read-only: a customer's balance and their latest wallet transactions (`limit` / `offset`, 20 by default). */
  async wallet(id: string, paging?: unknown): Promise<CustomerWallet> {
    const customer = await this.users.findOne({ where: { id, role: 'customer' } });
    if (!customer) throw new Error('Customer not found.');
    const { take, skip } = pageOf(paging, { def: 20, max: 100 });
    const rows = await this.walletTxs.find({ where: { userId: id }, order: { createdAt: 'DESC', id: 'ASC' }, take, skip });
    return { balance: customer.walletBalance, transactions: rows.map((t) => ({ ...t, descriptionFr: localizeWalletDescription(t.description, 'fr') })) };
  }

  /**
   * Suspend / reactivate an account. Only customers and sellers can be suspended
   * here (staff are managed through roles), never yourself. Bumping `tokenVersion`
   * revokes every issued token, so suspension takes effect immediately.
   */
  async setActive(id: string, active: boolean, actorId: string): Promise<void> {
    const target = await this.users.findOne({ where: { id } });
    if (!target || id === actorId) throw new Error('Account not found.');
    if (target.role !== 'customer' && target.role !== 'seller') {
      throw new Error('Staff accounts are managed in Roles.');
    }
    await this.users.update({ id }, { active, tokenVersion: (target.tokenVersion ?? 0) + 1 });
    this.emitter.toRoles(ADMIN_ROLES, 'customer:updated', { id, active });
  }
}
