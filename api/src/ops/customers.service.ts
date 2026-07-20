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
    const orders = await this.orders.find();
    return customers.map((c) => {
      const own = orders.filter((o) => o.customerId === c.id);
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        walletBalance: c.walletBalance,
        active: c.active,
        orders: own.length,
        spendUsd: Number(own.reduce((s, o) => s + o.totalUsd, 0).toFixed(2)),
        createdAt: c.createdAt,
      };
    });
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await this.users.update({ id }, { active });
    this.emitter.toRoles(ADMIN_ROLES, 'customer:updated', { id, active });
  }
}
