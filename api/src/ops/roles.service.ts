import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
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
  { key: 'rider', label: 'Rider', scope: 'Deliveries, GPS, earnings' },
];

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly usersSvc: UsersService,
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
        (u) => u.role.startsWith('admin') || u.role === 'warehouse_staff' || u.role === 'rider',
      )
      .map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, active: u.active }));
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

  /**
   * A super admin creates a staff / rider account. The generated password is
   * returned ONCE; the person should change it after the first sign-in.
   */
  async createStaff(data: { email: string; name: string; role: UserRole; phone?: string | null }): Promise<{ id: string; email: string; role: UserRole; tempPassword: string }> {
    if (await this.usersSvc.findByEmail(data.email)) throw new Error('An account with this email already exists.');
    const tempPassword = randomBytes(9).toString('base64url');
    const user = await this.usersSvc.create({
      email: data.email,
      passwordHash: await bcrypt.hash(tempPassword, 12),
      name: data.name,
      role: data.role,
      phone: data.phone ?? null,
    });
    user.emailVerified = true;
    await this.usersSvc.save(user);
    this.emitter.toRoles(ADMIN_ROLES, 'roles:updated', { id: user.id, role: user.role });
    return { id: user.id, email: data.email, role: user.role, tempPassword };
  }
}
