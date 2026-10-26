import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Hub, User } from '../database/entities';
import { WAREHOUSE_TIERS, WarehouseTier, tierOf } from '../logistics/tiers';
import type { UserRole } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';

/** What `roles:defs` serves for one role: the English text and its French (`scopeFr`) for the admin roles page. */
export interface RoleDef {
  key: string;
  label: string;
  scope: string;
  scopeFr: string;
}

/** Static sub-admin role/department catalogue used by the admin roles page. */
export const ROLE_DEFS: RoleDef[] = [
  { key: 'admin', label: 'Super Admin', scope: 'Full access', scopeFr: 'Accès complet' },
  { key: 'admin_operations', label: 'Operations', scope: 'Orders, fulfilment, riders', scopeFr: 'Commandes, préparation, livreurs' },
  { key: 'admin_finance', label: 'Finance', scope: 'Payments, payouts, refunds', scopeFr: 'Paiements, versements, remboursements' },
  { key: 'admin_support', label: 'Support', scope: 'Tickets, disputes', scopeFr: 'Tickets d’assistance, litiges' },
  { key: 'admin_marketing', label: 'Marketing', scope: 'Promos, CMS, broadcasts', scopeFr: 'Promotions, contenu (CMS), diffusions' },
  { key: 'admin_moderation', label: 'Moderation', scope: 'Sellers, products, reviews', scopeFr: 'Vendeurs, produits, avis' },
  { key: 'warehouse_staff', label: 'Warehouse', scope: 'Hubs, parcels, inventory', scopeFr: 'Entrepôts, colis, inventaire' },
  { key: 'rider', label: 'Rider', scope: 'Deliveries, GPS, earnings', scopeFr: 'Livraisons, GPS, gains' },
];

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly usersSvc: UsersService,
    private readonly emitter: RealtimeEmitter,
    @InjectRepository(Hub) private readonly hubs: Repository<Hub>,
  ) {}

  /**
   * Tie a rider or warehouse staff member to their home warehouse. Both must belong to one (no "sees every
   * warehouse" accounts any more). The caller then reconnects the user so they join the right rooms.
   */
  async setHub(userId: string, hubId: string | null) {
    const target = await this.users.findOne({ where: { id: userId } });
    if (!target || (target.role !== 'rider' && target.role !== 'warehouse_staff')) {
      throw new Error('Only riders and warehouse staff have a home warehouse.');
    }
    if (!hubId) throw new Error('Riders and warehouse staff must belong to a warehouse. Pick one from the list.');
    const hub = await this.hubs.findOne({ where: { id: hubId } });
    if (!hub) throw new Error('Pick a warehouse from the list.');
    if (!hub.active) throw new Error('That warehouse is switched off. Switch it on first.');
    await this.users.update({ id: userId }, { hubId });
    const saved = (await this.users.findOne({ where: { id: userId } }))!;
    const view = { id: saved.id, role: saved.role, hubId: saved.hubId ?? null, warehouseTier: saved.role === 'warehouse_staff' ? tierOf(saved.warehouseTier) : null };
    this.emitter.toRoles([...ADMIN_ROLES, 'warehouse_staff'], 'roles:updated', view);
    return view;
  }

  defs() {
    return ROLE_DEFS;
  }

  /** All admin/staff accounts and their role. */
  async staff() {
    const rows = await this.users.find({
      where: { role: In(['admin', 'admin_operations', 'admin_finance', 'admin_support', 'admin_marketing', 'admin_moderation', 'warehouse_staff', 'rider']) },
      order: { createdAt: 'ASC' },
      take: 1000,
    });
    return rows
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        active: u.active,
        hubId: u.hubId ?? null,
        warehouseTier: u.role === 'warehouse_staff' ? tierOf(u.warehouseTier) : null,
      }));
  }

  async setRole(id: string, role: UserRole, hubId?: string | null): Promise<void> {
    const target = await this.users.findOne({ where: { id } });
    if (!target) throw new Error('Account not found.');
    // A rider or warehouse staff member always belongs to a warehouse: name it here, or have one already.
    if (role === 'rider' || role === 'warehouse_staff') {
      const wanted = hubId ?? target.hubId ?? null;
      if (!wanted) throw new Error('Riders and warehouse staff must belong to a warehouse. Pick one from the list.');
      const hub = await this.hubs.findOne({ where: { id: wanted } });
      if (!hub || !hub.active) throw new Error('Pick an active warehouse from the list.');
      await this.users.update({ id }, { hubId: wanted, ...(role === 'warehouse_staff' && !target.warehouseTier ? { warehouseTier: 'operator' as WarehouseTier } : {}) });
    }
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
  async createStaff(data: { email: string; name: string; role: UserRole; phone?: string | null; hubId?: string | null; warehouseTier?: string | null }): Promise<{ id: string; email: string; role: UserRole; tempPassword: string; hubId: string | null; warehouseTier: WarehouseTier | null }> {
    if (await this.usersSvc.findByEmail(data.email)) throw new Error('An account with this email already exists.');
    // Riders and warehouse staff must belong to an active warehouse; staff get a tier (operator unless told otherwise).
    let hubId: string | null = null;
    let tier: WarehouseTier | null = null;
    if (data.role === 'rider' || data.role === 'warehouse_staff') {
      if (!data.hubId) throw new Error('Riders and warehouse staff must belong to a warehouse. Pick one from the list.');
      const hub = await this.hubs.findOne({ where: { id: data.hubId } });
      if (!hub || !hub.active) throw new Error('Pick an active warehouse from the list.');
      hubId = hub.id;
      if (data.role === 'warehouse_staff') {
        if (data.warehouseTier && !(WAREHOUSE_TIERS as readonly string[]).includes(data.warehouseTier)) throw new Error(`Tier must be one of: ${WAREHOUSE_TIERS.join(', ')}.`);
        tier = (data.warehouseTier as WarehouseTier | null | undefined) ?? 'operator';
      }
    }
    const tempPassword = randomBytes(9).toString('base64url');
    const user = await this.usersSvc.create({
      email: data.email,
      passwordHash: await bcrypt.hash(tempPassword, 12),
      name: data.name,
      role: data.role,
      phone: data.phone ?? null,
    });
    user.emailVerified = true;
    user.hubId = hubId;
    user.warehouseTier = tier;
    await this.usersSvc.save(user);
    this.emitter.toRoles(ADMIN_ROLES, 'roles:updated', { id: user.id, role: user.role, hubId, warehouseTier: tier });
    return { id: user.id, email: data.email, role: user.role, tempPassword, hubId, warehouseTier: tier };
  }
}
