import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { In, Not, Repository } from 'typeorm';
import { Seller, SellerTeamMember, TEAM_STAFF_ROLES, User } from '../database/entities';
import type { TeamRole } from '../database/entities';
import { RateWindow } from '../common/rate-window';
import { MessagingService } from '../messaging/messaging.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { UsersService } from '../users/users.service';
import { permissionForEvent, permissionsOf } from './seller-permissions';
import { PlanGateService, seatError, seatsOf } from './plan-gate';
import { redactForStaff } from './staff-view';
import { TeamDirectory } from './team-directory';
import type { SellerContext } from './seller-context';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const INVITE_TTL_MS = 7 * 24 * 3_600_000;
/** Invitation e-mails one store may send per hour (a seat limit does not stop re-sending the same invitation). */
export const INVITES_PER_HOUR = 20;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface TeamMemberView {
  id: string;
  userId: string | null;
  email: string;
  name: string | null;
  role: TeamRole;
  status: 'invited' | 'active';
  isOwner: boolean;
  invitedAt: Date | null;
  acceptedAt: Date | null;
  inviteExpiresAt: Date | null;
}

export interface TeamListView {
  seller: { id: string; name: string };
  /** Seats of the plan: staff accounts besides the owner (max null = unlimited). */
  seats: { used: number; max: number | null };
  members: TeamMemberView[];
}

/** What the invitation page shows before the invitee signs in. */
export interface InvitePreview {
  storeName: string;
  role: TeamRole;
  /** The address the invitation was sent to: the account that accepts must use it. */
  email: string;
  expired: boolean;
}

@Injectable()
export class TeamService implements OnModuleInit {
  private readonly invites = new RateWindow(INVITES_PER_HOUR, 3_600_000);

  constructor(
    @InjectRepository(SellerTeamMember) private readonly team: Repository<SellerTeamMember>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly messaging: MessagingService,
    private readonly emitter: RealtimeEmitter,
    private readonly directory: TeamDirectory,
    private readonly planGate: PlanGateService,
  ) {}

  /** Live events addressed to a store owner (orders, listings, payouts…) also reach the staff whose role handles them. */
  onModuleInit(): void {
    this.emitter.registerMirror(async (userId, event, payload) => {
      const permission = permissionForEvent(event);
      if (!permission) return [];
      const ids = await this.directory.recipientsFor(userId, permission);
      // The store object an owner receives carries their KYC papers: staff get it without.
      const copy = event === 'seller:updated' ? redactForStaff(payload) : payload;
      return ids.map((to) => ({ to, payload: copy }));
    });
  }

  private get webUrl(): string {
    return (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  }
  private get expose(): boolean {
    return process.env.NODE_ENV !== 'production';
  }

  private static view(m: SellerTeamMember): TeamMemberView {
    return {
      id: m.id,
      userId: m.userId,
      email: m.email,
      name: m.name,
      role: m.role,
      status: m.status === 'active' ? 'active' : 'invited',
      isOwner: false,
      invitedAt: m.createdAt,
      acceptedAt: m.acceptedAt,
      inviteExpiresAt: m.status === 'invited' ? m.inviteExpiresAt : null,
    };
  }

  // ── Reading ─────────────────────────────────────────────────────────────
  async list(ctx: SellerContext): Promise<TeamListView> {
    const rows = await this.team.find({ where: { sellerId: ctx.seller.id, status: Not('removed') }, order: { createdAt: 'ASC' } });
    const owner = ctx.seller.userId ? await this.users.findById(ctx.seller.userId) : null;
    const plan = await this.planGate.planOf(ctx.seller);
    // Show the name the person has NOW (they may have renamed their account since they joined).
    const ids = rows.map((r) => r.userId).filter((x): x is string => !!x);
    const accounts = new Map((ids.length ? await this.userRepo.find({ where: { id: In(ids) }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
    return {
      seller: { id: ctx.seller.id, name: ctx.seller.name },
      seats: { used: rows.length, max: seatsOf(plan) },
      members: [
        {
          id: 'owner',
          userId: ctx.seller.userId,
          email: owner?.email ?? '',
          name: owner?.name ?? ctx.seller.name,
          role: 'owner',
          status: 'active',
          isOwner: true,
          invitedAt: null,
          acceptedAt: null,
          inviteExpiresAt: null,
        },
        ...rows.map((m) => ({ ...TeamService.view(m), name: (m.userId ? accounts.get(m.userId) : undefined) ?? m.name })),
      ],
    };
  }

  /** Who I am in my store: the role and what it allows (the seller portal hides what the role cannot do). */
  me(ctx: SellerContext) {
    return {
      seller: { id: ctx.seller.id, name: ctx.seller.name, status: ctx.seller.status },
      role: ctx.member,
      isOwner: ctx.isOwner,
      suspended: ctx.suspended,
      permissions: ctx.permissions,
    };
  }

  private async push(ctx: SellerContext): Promise<void> {
    if (ctx.seller.userId) this.emitter.toUser(ctx.seller.userId, 'team:updated', await this.list(ctx));
  }

  // ── Inviting ────────────────────────────────────────────────────────────
  async invite(ctx: SellerContext, input: { email?: unknown; role?: unknown; name?: unknown }) {
    const email = String(input?.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 200) throw new BadRequestException('Enter a valid e-mail address.');
    const role = String(input?.role ?? '');
    if (!(TEAM_STAFF_ROLES as readonly string[]).includes(role)) {
      throw new BadRequestException(`Choose a role: ${TEAM_STAFF_ROLES.join(', ')}.`);
    }
    const name = input?.name == null || input.name === '' ? null : String(input.name).trim().slice(0, 100) || null;
    const emailHash = UsersService.emailHash(email);

    const owner = ctx.seller.userId ? await this.users.findById(ctx.seller.userId) : null;
    if (owner && owner.emailHash === emailHash) throw new BadRequestException('You already own this store.');

    // The account behind the address, if any, must be able to work for a store.
    const account = await this.users.findByEmail(email);
    if (account) {
      if (account.role !== 'seller') {
        throw new BadRequestException('This e-mail belongs to a shopper or staff account. Invite another address, or ask the person to open a separate seller account.');
      }
      if (await this.sellers.findOne({ where: { userId: account.id } })) {
        throw new BadRequestException('This person already owns a store. A store owner cannot join another store as staff.');
      }
      const elsewhere = await this.team.findOne({ where: { userId: account.id, status: 'active', sellerId: Not(ctx.seller.id) } });
      if (elsewhere) throw new BadRequestException('This person already works for another store.');
    }

    const existing = await this.team.findOne({ where: { sellerId: ctx.seller.id, emailHash } });
    if (existing?.status === 'active') throw new ConflictException('This person is already on your team.');

    // Seats: an open invitation being re-sent does not take a second one.
    const plan = await this.planGate.planOf(ctx.seller);
    const max = seatsOf(plan);
    if (max !== null && (!existing || existing.status === 'removed')) {
      const used = await this.team.count({ where: { sellerId: ctx.seller.id, status: In(['invited', 'active']) } });
      if (used >= max) throw new BadRequestException(seatError(plan, max));
    }

    if (!this.invites.take(ctx.seller.id)) throw new BadRequestException('You are sending too many invitations. Try again in an hour.');
    const token = randomBytes(32).toString('hex');
    const fields = {
      role: role as TeamRole,
      name: name ?? existing?.name ?? null,
      status: 'invited' as const,
      userId: null,
      inviteTokenHash: sha(token),
      inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
      invitedBy: ctx.user.id,
      acceptedAt: null,
      removedAt: null,
    };
    const saved = existing
      ? await this.team.save(Object.assign(existing, fields))
      : await this.team.save(this.team.create({ sellerId: ctx.seller.id, emailHash, email, ...fields }));
    this.directory.invalidate();

    const link = `${this.webUrl}/seller/team/accept?token=${token}`;
    const sent = await this.messaging.sendEmail(
      email,
      `${ctx.seller.name} invited you to join their team on Somba&Teka / ${ctx.seller.name} vous invite à rejoindre son équipe sur Somba&Teka`,
      `Hello${saved.name ? ` ${saved.name}` : ''},\n\n${ctx.seller.name} invited you to help run their store on Somba&Teka as "${role}".\nCreate your seller account with this e-mail address (or sign in), then open:\n${link}\n\nThe invitation expires in 7 days.\n\n---\n\nBonjour${saved.name ? ` ${saved.name}` : ''},\n\n${ctx.seller.name} vous invite à gérer sa boutique sur Somba&Teka avec le rôle « ${role} ».\nCréez votre compte vendeur avec cette adresse e-mail (ou connectez-vous), puis ouvrez :\n${link}\n\nL’invitation expire dans 7 jours.`,
    );
    if (account) {
      await this.notifications.toUser(account.id, {
        title: 'Team invitation',
        body: `${ctx.seller.name} invited you to join their store team (${role}).`,
        type: 'team',
        entityId: saved.id,
      });
    }
    await this.push(ctx);
    return { member: TeamService.view(saved), sent, ...(this.expose ? { devToken: token } : {}) };
  }

  /** Public: what the invitation page shows. The same answer for a wrong token as for a used one. */
  async preview(token: string): Promise<InvitePreview> {
    const row = await this.byToken(token);
    const seller = await this.sellers.findOne({ where: { id: row.sellerId } });
    if (!seller) throw new NotFoundException('This invitation is no longer valid.');
    return { storeName: seller.name, role: row.role, email: row.email, expired: !!row.inviteExpiresAt && row.inviteExpiresAt.getTime() < Date.now() };
  }

  private async byToken(token: unknown): Promise<SellerTeamMember> {
    const t = String(token ?? '');
    const row = /^[0-9a-f]{64}$/.test(t) ? await this.team.findOne({ where: { inviteTokenHash: sha(t), status: 'invited' } }) : null;
    if (!row) throw new NotFoundException('This invitation is no longer valid.');
    return row;
  }

  // ── Accepting ───────────────────────────────────────────────────────────
  /** The invited person (signed in with the invited address) takes the seat. */
  async accept(caller: { id: string; role: string; name: string }, token: unknown) {
    if (caller.role !== 'seller') throw new BadRequestException('Sign in with your seller account to accept this invitation.');
    const row = await this.byToken(token);
    if (row.inviteExpiresAt && row.inviteExpiresAt.getTime() < Date.now()) throw new BadRequestException('This invitation has expired. Ask the store owner to send a new one.');
    const user = await this.users.findById(caller.id);
    if (!user) throw new NotFoundException('Account not found.');
    if (user.emailHash !== row.emailHash) {
      throw new BadRequestException(`This invitation was sent to another e-mail address. Sign in with ${maskEmail(row.email)}.`);
    }
    if (await this.sellers.findOne({ where: { userId: user.id } })) {
      throw new BadRequestException('A store owner cannot join another store as staff.');
    }
    if (await this.team.findOne({ where: { userId: user.id, status: 'active' } })) {
      throw new BadRequestException('You already work for a store. Leave it first to join another one.');
    }
    const seller = await this.sellers.findOne({ where: { id: row.sellerId } });
    if (!seller) throw new NotFoundException('This invitation is no longer valid.');
    row.userId = user.id;
    row.status = 'active';
    row.acceptedAt = new Date();
    row.inviteTokenHash = null;
    row.inviteExpiresAt = null;
    row.name = user.name;
    await this.team.save(row);
    this.directory.invalidate();
    if (seller.userId) {
      await this.notifications.toUser(seller.userId, {
        title: 'Team member joined',
        body: `${user.name} joined your store team as ${row.role}.`,
        type: 'team',
        entityId: row.id,
      });
      this.emitter.toUser(seller.userId, 'team:updated', await this.listFor(seller));
    }
    return { seller: { id: seller.id, name: seller.name, status: seller.status }, role: row.role, permissions: permissionsOf(row.role) };
  }

  /** Read-only view of a store's team for staff of the platform. */
  async listOf(sellerId: string): Promise<TeamListView> {
    const seller = sellerId ? await this.sellers.findOne({ where: { id: sellerId } }) : null;
    if (!seller) throw new NotFoundException('Store not found.');
    return this.listFor(seller);
  }

  private async listFor(seller: Seller): Promise<TeamListView> {
    return this.list({ seller } as SellerContext);
  }

  // ── Changing ────────────────────────────────────────────────────────────
  async setRole(ctx: SellerContext, input: { memberId?: unknown; role?: unknown }) {
    const role = String(input?.role ?? '');
    if (!(TEAM_STAFF_ROLES as readonly string[]).includes(role)) throw new BadRequestException(`Choose a role: ${TEAM_STAFF_ROLES.join(', ')}.`);
    const row = await this.mine(ctx, input?.memberId);
    row.role = role as TeamRole;
    await this.team.save(row);
    this.directory.invalidate();
    if (row.userId) {
      await this.notifications.toUser(row.userId, {
        title: 'Team role changed',
        body: `Your role in "${ctx.seller.name}" is now ${role}.`,
        type: 'team',
        entityId: row.id,
      });
      this.emitter.toUser(row.userId, 'team:me', { seller: { id: ctx.seller.id, name: ctx.seller.name }, role, permissions: permissionsOf(row.role) });
    }
    await this.push(ctx);
    return TeamService.view(row);
  }

  async remove(ctx: SellerContext, input: { memberId?: unknown }) {
    const row = await this.mine(ctx, input?.memberId);
    await this.release(row, ctx.seller, 'removed');
    await this.push(ctx);
    return { id: row.id, removed: true };
  }

  /** A member steps down by themselves. */
  async leave(caller: { id: string; name: string }) {
    const row = await this.team.findOne({ where: { userId: caller.id, status: 'active' } });
    if (!row) throw new NotFoundException('You do not work for a store.');
    const seller = await this.sellers.findOne({ where: { id: row.sellerId } });
    await this.release(row, seller, 'left');
    if (seller?.userId) {
      await this.notifications.toUser(seller.userId, {
        title: 'Team member left',
        body: `${caller.name} left your store team.`,
        type: 'team',
        entityId: row.id,
      });
      this.emitter.toUser(seller.userId, 'team:updated', await this.listFor(seller));
    }
    return { left: true };
  }

  /** Every staff seat of a store ends (the owner closed the store). */
  async releaseAll(seller: Seller): Promise<number> {
    const rows = await this.team.find({ where: { sellerId: seller.id, status: In(['invited', 'active']) } });
    for (const row of rows) await this.release(row, seller, 'removed');
    return rows.length;
  }

  private async release(row: SellerTeamMember, seller: Seller | null, why: 'removed' | 'left'): Promise<void> {
    const wasActiveUser = row.status === 'active' ? row.userId : null;
    row.status = 'removed';
    row.removedAt = new Date();
    row.inviteTokenHash = null;
    row.inviteExpiresAt = null;
    await this.team.save(row);
    this.directory.invalidate();
    if (wasActiveUser && why === 'removed') {
      await this.notifications.toUser(wasActiveUser, {
        title: 'Removed from store team',
        body: `You no longer have access to "${seller?.name ?? 'the store'}".`,
        type: 'team',
        entityId: row.id,
      });
    }
    if (wasActiveUser) this.emitter.toUser(wasActiveUser, 'team:removed', { sellerId: row.sellerId });
  }

  private async mine(ctx: SellerContext, memberId: unknown): Promise<SellerTeamMember> {
    const row = await this.team.findOne({ where: { id: String(memberId ?? ''), sellerId: ctx.seller.id } });
    if (!row || row.status === 'removed') throw new NotFoundException('Team member not found.');
    return row;
  }
}

/** a***@b.com */
export function maskEmail(email: string): string {
  const [u, d] = email.split('@');
  return d ? `${u.slice(0, 1)}***@${d}` : '***';
}
