import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Hub, Setting, User } from '../database/entities';
import { parsePreferredZones } from '../common/zones/hub-scope';
import { parseZones } from '../common/zones/zone-match';
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
    @InjectRepository(Setting) private readonly settings: Repository<Setting>,
  ) {}

  /**
   * Tie a rider or warehouse staff member to their home warehouse (null = not tied: sees every warehouse), and set a
   * rider's preferred zones (offered first). The caller then reconnects the user so they join the right rooms.
   */
  async setHub(userId: string, hubId: string | null, preferredZones?: unknown) {
    const target = await this.users.findOne({ where: { id: userId } });
    if (!target || (target.role !== 'rider' && target.role !== 'warehouse_staff')) {
      throw new Error('Only riders and warehouse staff have a home warehouse.');
    }
    if (hubId) {
      const hub = await this.hubs.findOne({ where: { id: hubId } });
      if (!hub) throw new Error('Pick a warehouse from the list.');
      if (!hub.active) throw new Error('That warehouse is switched off. Switch it on first.');
    }
    const patch: Partial<User> = { hubId: hubId || null };
    if (preferredZones !== undefined) {
      if (target.role !== 'rider') throw new Error('Only riders have preferred zones.');
      const wanted = Array.isArray(preferredZones) ? preferredZones.map(String) : [];
      const row = await this.settings.findOne({ where: { key: 'deliveryZones' } });
      const zones = parseZones(row?.value);
      const known = new Set(zones.filter((z) => !hubId || !z.hubId || z.hubId === hubId).map((z) => z.id));
      const unknown = wanted.filter((id) => !known.has(id));
      if (unknown.length) throw new Error("A preferred zone is not one of this warehouse's zones.");
      patch.preferredZones = JSON.stringify([...new Set(wanted)].slice(0, 50));
    }
    await this.users.update({ id: userId }, patch);
    const saved = (await this.users.findOne({ where: { id: userId } }))!;
    const view = { id: saved.id, role: saved.role, hubId: saved.hubId ?? null, preferredZones: parsePreferredZones(saved.preferredZones) };
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
        preferredZones: parsePreferredZones(u.preferredZones),
      }));
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
