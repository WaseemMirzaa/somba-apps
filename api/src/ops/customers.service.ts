import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, User } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';

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

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  async list(): Promise<CustomerRow[]> {
    const customers = await this.users.find({ where: { role: 'customer' } });
    // One aggregate query instead of loading every order into memory.
    const totals = await this.orders
      .createQueryBuilder('o')
      .select('o.customerId', 'id')
      .addSelect('COUNT(*)', 'n')
      .addSelect('COALESCE(SUM(o.totalUsd), 0)', 'spend')
      .where("o.status != 'cancelled'")
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
