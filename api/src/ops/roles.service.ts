import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { DeliveryTask, Hub, User, VerificationToken } from '../database/entities';
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
  { key: 'rider', label: 'Rider', scope: 'Deliveries, GPS, work stats', scopeFr: 'Livraisons, GPS, statistiques' },
];

/** Accounts an administrator manages here: every role except the ones people sign up for themselves. */
const MANAGED_ROLES: readonly UserRole[] = ['admin', 'admin_operations', 'admin_finance', 'admin_support', 'admin_marketing', 'admin_moderation', 'warehouse_staff', 'rider'];

/** A fresh temporary password: 12 random characters from the URL-safe alphabet. Never logged, never stored in clear. */
const newTempPassword = () => randomBytes(9).toString('base64url');

/** What `roles:resetPassword` answers; `tempPassword` is shown to the admin this once. */
export interface ReissuedPassword {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tempPassword: string;
}

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly usersSvc: UsersService,
    private readonly emitter: RealtimeEmitter,
    @InjectRepository(Hub) private readonly hubs: Repository<Hub>,
    @InjectRepository(DeliveryTask) private readonly tasks?: Repository<DeliveryTask>,
    @InjectRepository(VerificationToken) private readonly tokens?: Repository<VerificationToken>,
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
        twofaEnabled: !!u.twofaEnabled,
        /** Still on the temporary password an administrator made (has not chosen their own yet). */
        mustChangePassword: !!u.mustChangePassword,
      }));
  }

  /**
   * Switch a rider or a warehouse employee off (or back on). `active` is what the routing counts: a warehouse whose riders
   * are all inactive has no rider (UC-8: the nearest staffed warehouse stands in), and an inactive rider is offered by no
   * rider list (`logistics:riders`, `warehouse:riders`, the run driver) and cannot be assigned. Switching off also revokes
   * the person's sessions (`tokenVersion`), so the caller can drop their open sockets. Their open tasks stay assigned:
   * the desk gives them to someone else (`openTasks` says how many).
   */
  async setStaffActive(id: string, active: boolean): Promise<{ id: string; name: string; email: string; role: UserRole; active: boolean; hubId: string | null; warehouseTier: WarehouseTier | null; openTasks: number }> {
    const target = await this.users.findOne({ where: { id } });
    if (!target) throw new Error('Account not found.');
    if (target.role !== 'rider' && target.role !== 'warehouse_staff') throw new Error('Only riders and warehouse staff can be switched on or off here.');
    await this.users.update({ id }, active ? { active } : { active, tokenVersion: (target.tokenVersion ?? 0) + 1 });
    const view = { id: target.id, role: target.role, active, hubId: target.hubId ?? null, warehouseTier: target.role === 'warehouse_staff' ? tierOf(target.warehouseTier) : null };
    const openTasks = target.role === 'rider' && this.tasks ? await this.tasks.count({ where: { riderId: id, status: In(['assigned', 'picked_up', 'in_transit']) } }) : 0;
    this.emitter.toRoles([...ADMIN_ROLES, 'warehouse_staff'], 'roles:updated', view);
    // The directory's rider and staff counts changed with it.
    const hub = target.hubId ? await this.hubs.findOne({ where: { id: target.hubId } }) : null;
    if (hub) this.emitter.toRoles([...ADMIN_ROLES, 'warehouse_staff'], 'hub:updated', hub);
    return { ...view, name: target.name, email: target.email, openTasks };
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
   * returned ONCE and is a temporary one: the account is flagged `mustChangePassword`, so the person can do nothing
   * but change it at their first sign-in (see auth/password-change.ts).
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
    const tempPassword = newTempPassword();
    const user = await this.usersSvc.create({
      email: data.email,
      passwordHash: await bcrypt.hash(tempPassword, 12),
      name: data.name,
      role: data.role,
      phone: data.phone ?? null,
    });
    user.emailVerified = true;
    user.mustChangePassword = true;
    user.hubId = hubId;
    user.warehouseTier = tier;
    await this.usersSvc.save(user);
    this.emitter.toRoles(ADMIN_ROLES, 'roles:updated', { id: user.id, role: user.role, hubId, warehouseTier: tier });
    return { id: user.id, email: data.email, role: user.role, tempPassword, hubId, warehouseTier: tier };
  }

  /**
   * The account behind a staff action: must exist and be one an administrator manages here. Customers and sellers are
   * never touched (their password and e-mail are theirs).
   */
  private async managedAccount(id: string): Promise<User> {
    const target = id ? await this.users.findOne({ where: { id } }) : null;
    if (!target) throw new Error('Account not found.');
    if (!MANAGED_ROLES.includes(target.role)) throw new Error('Only staff, riders and administrators are managed here. Customers and sellers manage their own account.');
    return target;
  }

  /** Links in an e-mail sent before the change (password reset, verification) must not outlive it. */
  private async burnPendingLinks(userId: string): Promise<void> {
    await this.tokens?.update({ userId, usedAt: IsNull() }, { usedAt: new Date() });
  }

  /**
   * Issue a NEW temporary password for a staff member, rider or department admin who lost theirs. The password is generated
   * here, returned once to the caller and nowhere else (not logged, not audited, only its hash is stored). The account
   * is flagged `mustChangePassword` again and its sessions end (`tokenVersion`); the caller drops the open sockets.
   * Two-factor authentication stays as it was: the new password alone does not sign anyone in past a second factor.
   */
  async reissuePassword(id: string): Promise<ReissuedPassword> {
    const target = await this.managedAccount(id);
    const tempPassword = newTempPassword();
    await this.users.update({ id }, { passwordHash: await bcrypt.hash(tempPassword, 12), mustChangePassword: true, tokenVersion: (target.tokenVersion ?? 0) + 1 });
    await this.burnPendingLinks(id);
    this.emitter.toRoles(ADMIN_ROLES, 'roles:updated', { id, role: target.role, mustChangePassword: true }); // the staff lists show "temporary password" again
    return { id, email: target.email, name: target.name, role: target.role, tempPassword };
  }

  /**
   * Correct the e-mail of a staff member, rider or administrator: trimmed and lower-cased like at creation, unique across
   * all accounts, and valid. The new address counts as not verified yet, and any link sent to the old one stops working.
   */
  async updateStaffEmail(id: string, rawEmail: string): Promise<{ id: string; email: string; previousEmail: string; role: UserRole }> {
    const target = await this.managedAccount(id);
    const email = String(rawEmail ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) throw new Error('Enter a valid email.');
    const emailHash = UsersService.emailHash(email);
    const clash = await this.users.findOne({ where: { emailHash } });
    if (clash && clash.id !== id) throw new Error('An account with this email already exists.');
    const previousEmail = target.email;
    if (clash) return { id, email, previousEmail, role: target.role }; // same address: nothing to change
    target.email = email;
    target.emailHash = emailHash;
    target.emailVerified = false;
    await this.users.save(target);
    await this.burnPendingLinks(id);
    this.emitter.toRoles(ADMIN_ROLES, 'roles:updated', { id, role: target.role });
    return { id, email, previousEmail, role: target.role };
  }
}
