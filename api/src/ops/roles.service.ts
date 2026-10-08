import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities';
import type { UserRole } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';

/** Static sub-admin role/department catalogue used by the admin roles page. */
export const ROLE_DEFS = [
  { key: 'admin', label: 'Super Admin', scope: 'Full access' },
  { key: 'admin_operations', label: 'Operations', scope: 'Orders, fulfilment, riders' },
  { key: 'admin_finance', label: 'Finance', scope: 'Payments, payouts, refunds' },
  { key: 'admin_support', label: 'Support', scope: 'Tickets, disputes' },
  { key: 'admin_marketing', label: 'Marketing', scope: 'Promos, CMS, broadcasts' },
  { key: 'admin_moderation', label: 'Moderation', scope: 'Sellers, products, reviews' },
  { key: 'warehouse_staff', label: 'Warehouse', scope: 'Hubs, parcels, inventory' },
];

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  defs() {
    return ROLE_DEFS;
  }

  /** All admin/staff accounts and their role. */
  async staff() {
    const rows = await this.users.find();
    return rows
      .filter(
        (u) => u.role.startsWith('admin') || u.role === 'warehouse_staff',
      )
      .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }));
  }

  async setRole(id: string, role: UserRole): Promise<void> {
    const target = await this.users.findOne({ where: { id } });
    if (!target) throw new Error('Account not found.');
    if (target.role === 'admin' && role !== 'admin') {
      const admins = await this.users.count({ where: { role: 'admin', active: true } });
      if (admins <= 1) throw new Error('You cannot remove the last administrator.');
    }
    // New role => old tokens must stop working (they carry the old privileges).
    await this.users.update({ id }, { role, tokenVersion: (target.tokenVersion ?? 0) + 1 });
    this.emitter.toRoles(ADMIN_ROLES, 'roles:updated', { id, role });
  }
}
