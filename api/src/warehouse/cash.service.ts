import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, CodHandover, DeliveryTask, User } from '../database/entities';
import { Actor } from '../logistics/logistics.service';
import { tierAllows } from '../logistics/tiers';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { CASH_DESK_ADMINS } from '../common/staff-access';

/** Half a cent: amounts closer than this are the same amount (the cash record is in whole cents, stored as doubles). */
export const HALF_CENT = 0.005;
/** Money rounded to whole cents. */
export const cents = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const usd = (n: number): string => `$${cents(n).toFixed(2)}`;

/** The cash a rider holds: collected on COD deliveries and not yet handed in at the warehouse. */
export interface CashBalance {
  collectedUsd: number;
  handedOverUsd: number;
  heldUsd: number;
  /** Deliveries that still have cash on them. */
  openTasks: number;
}

/** One receipt as clients see it. */
export interface HandoverView {
  id: string;
  riderId: string;
  riderName: string;
  hubId: string | null;
  amountUsd: number;
  heldBeforeUsd: number;
  heldAfterUsd: number;
  receivedById: string;
  receivedByName: string;
  note: string | null;
  createdAt: Date;
}

const view = (h: CodHandover): HandoverView => ({
  id: h.id,
  riderId: h.riderId,
  riderName: h.riderName,
  hubId: h.hubId ?? null,
  amountUsd: h.amountUsd,
  heldBeforeUsd: h.heldBeforeUsd,
  heldAfterUsd: cents(h.heldBeforeUsd - h.amountUsd),
  receivedById: h.receivedById,
  receivedByName: h.receivedByName,
  note: h.note ?? null,
  createdAt: h.createdAt,
});

/**
 * The cash a rider takes on cash-on-delivery orders and hands in at the warehouse (C-cod). The collection itself is
 * written by `DeliveryService.updateStatus` on the delivery task; this service keeps the hand-over side: the rider's
 * balance, the receipts (a supervisor or manager of the rider's warehouse records who received how much and when) and
 * their audit trail. A receipt may be partial and can never be more than the rider holds (C-cod-cap): the amount is
 * spread over the rider's oldest unsettled deliveries with a conditional update on each one, in one transaction, so two
 * receipts racing for the same cash cannot both succeed.
 */
@Injectable()
export class CashService {
  constructor(
    @InjectRepository(DeliveryTask) private readonly tasks: Repository<DeliveryTask>,
    @InjectRepository(CodHandover) private readonly handovers: Repository<CodHandover>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  /** What a rider holds. `hubId` limits it to the cash collected on one warehouse's deliveries (a staff member's view). */
  async balance(riderId: string, hubId?: string | null): Promise<CashBalance> {
    const qb = this.tasks
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.codCollectedUsd), 0)', 'collected')
      .addSelect('COALESCE(SUM(t.codHandedOverUsd), 0)', 'handed')
      .addSelect(`COALESCE(SUM(CASE WHEN t.codCollectedUsd - t.codHandedOverUsd > ${HALF_CENT} THEN 1 ELSE 0 END), 0)`, 'open')
      .where('t.riderId = :riderId AND t.codCollectedUsd IS NOT NULL', { riderId });
    if (hubId) qb.andWhere('(t.hubId = :hubId OR t.fromHubId = :hubId OR t.toHubId = :hubId)', { hubId });
    const r = await qb.getRawOne<{ collected: string; handed: string; open: string }>();
    const collectedUsd = cents(Number(r?.collected ?? 0));
    const handedOverUsd = cents(Number(r?.handed ?? 0));
    return { collectedUsd, handedOverUsd, heldUsd: Math.max(0, cents(collectedUsd - handedOverUsd)), openTasks: Number(r?.open ?? 0) };
  }

  /** The rider's own view: what they hold and their latest receipts. */
  async forRider(riderId: string, limit = 20): Promise<CashBalance & { handovers: HandoverView[] }> {
    const rows = await this.handovers.find({ where: { riderId }, order: { createdAt: 'DESC', id: 'DESC' }, take: limit });
    return { ...(await this.balance(riderId)), handovers: rows.map(view) };
  }

  /** Latest receipts of a warehouse (every warehouse for an admin), optionally of one rider. Supervisors and managers (and the cash admins) read. */
  async history(actor: Actor, opts: { hubId?: string | null; riderId?: string | null; limit?: number } = {}): Promise<HandoverView[]> {
    this.requireStaff(actor);
    // The cash admins (requireStaff) read any warehouse's cash; warehouse staff by tier.
    if (actor.role === 'warehouse_staff' && !tierAllows(actor.role, actor.tier, 'oversee')) throw new BadRequestException('Only supervisors and managers can see cash hand-overs.');
    const hubId = actor.hubId ?? opts.hubId ?? null;
    const where: Record<string, string> = {};
    if (hubId) where.hubId = String(hubId);
    if (opts.riderId) where.riderId = String(opts.riderId);
    const rows = await this.handovers.find({ where: where as never, order: { createdAt: 'DESC', id: 'DESC' }, take: Math.min(Math.max(Number(opts.limit) || 100, 1), 300) });
    return rows.map(view);
  }

  /**
   * A supervisor or manager records that a rider handed in `amountUsd` of cash. Staff can only take cash from riders of
   * their own warehouse and only what was collected on that warehouse's deliveries; admins can take any rider's.
   */
  async handOver(actor: Actor, input: { riderId: unknown; amountUsd: unknown; note?: unknown; clientRef?: unknown }): Promise<{ handover: HandoverView; balance: CashBalance }> {
    this.requireStaff(actor);
    if (actor.role === 'warehouse_staff' && !tierAllows(actor.role, actor.tier, 'assign')) throw new BadRequestException("Only supervisors and managers can record a rider's cash hand-over.");
    const amount = CashService.amount(input.amountUsd);
    const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 200) : null;
    const clientRef = typeof input.clientRef === 'string' && input.clientRef.trim() ? input.clientRef.trim().slice(0, 64) : null;

    const rider = await this.users.findOne({ where: { id: String(input.riderId ?? '') } });
    if (!rider || rider.role !== 'rider') throw new NotFoundException('Rider not found.');
    if (actor.hubId && rider.hubId !== actor.hubId) throw new BadRequestException('This rider belongs to another warehouse.');
    const scope = actor.hubId ?? null;

    // The same receipt sent twice (a double tap, a retry after a lost answer) is recorded once.
    if (clientRef) {
      const seen = await this.handovers.findOne({ where: { clientRef } });
      if (seen) {
        if (seen.riderId !== rider.id || Math.abs(seen.amountUsd - amount) > HALF_CENT) throw new BadRequestException('This receipt reference was already used for a different hand-over.');
        return { handover: view(seen), balance: await this.balance(rider.id, scope) };
      }
    }

    const saved = await this.tasks.manager.transaction(async (m) => {
      const qb = m
        .getRepository(DeliveryTask)
        .createQueryBuilder('t')
        .where('t.riderId = :riderId AND t.codCollectedUsd IS NOT NULL', { riderId: rider.id })
        .andWhere(`t.codCollectedUsd - t.codHandedOverUsd > ${HALF_CENT}`)
        .orderBy('t.codCollectedAt', 'ASC')
        .addOrderBy('t.id', 'ASC');
      if (scope) qb.andWhere('(t.hubId = :hubId OR t.fromHubId = :hubId OR t.toHubId = :hubId)', { hubId: scope });
      const open = await qb.getMany();
      const held = cents(open.reduce((s, t) => s + (t.codCollectedUsd as number) - t.codHandedOverUsd, 0));
      // C-cod-cap: never more than the rider holds (checked here, and again by the conditional update on every task below).
      if (amount > held + HALF_CENT) {
        throw new BadRequestException(held < HALF_CENT ? `${rider.name} holds no cash to hand in.` : `${rider.name} holds ${usd(held)}: you cannot record ${usd(amount)}.`);
      }
      let left = amount;
      for (const t of open) {
        if (left < HALF_CENT) break;
        const take = cents(Math.min(left, (t.codCollectedUsd as number) - t.codHandedOverUsd));
        const claim = await m
          .getRepository(DeliveryTask)
          .createQueryBuilder()
          .update(DeliveryTask)
          .set({ codHandedOverUsd: () => 'codHandedOverUsd + :take' })
          .where(`id = :id AND codHandedOverUsd + :take <= codCollectedUsd + ${HALF_CENT}`, { id: t.id, take })
          .execute();
        // Someone else settled this delivery's cash a moment ago: nothing is recorded, the caller reloads and tries again.
        if (!claim.affected) throw new BadRequestException("This rider's cash was just updated. Refresh and try again.");
        left = cents(left - take);
      }
      const row = await m.getRepository(CodHandover).save(
        m.getRepository(CodHandover).create({
          riderId: rider.id,
          riderName: rider.name,
          hubId: actor.hubId ?? rider.hubId ?? null,
          amountUsd: amount,
          heldBeforeUsd: held,
          receivedById: actor.id,
          receivedByName: actor.name,
          receivedByRole: actor.role,
          note,
          clientRef,
        }),
      );
      // The audit line is part of the same transaction: no receipt without its trail.
      await m.getRepository(AuditLog).save(
        m.getRepository(AuditLog).create({
          actor: actor.name,
          role: actor.role,
          action: 'cod.handover',
          entity: 'rider',
          entityId: rider.id,
          detail: `${rider.name}: ${usd(amount)} received by ${actor.name}; still holds ${usd(held - amount)}${note ? ` (${note})` : ''}`,
        }),
      );
      return row;
    });

    const balance = await this.balance(rider.id, scope);
    const payload = { ...balance, handover: view(saved) };
    this.emitter.toUser(rider.id, 'cash:updated', payload);
    if (saved.hubId) this.emitter.toHub(saved.hubId, 'cash:updated', { riderId: rider.id, ...payload });
    this.emitter.toRoles([...CASH_DESK_ADMINS], 'cash:updated', { riderId: rider.id, ...payload });
    return { handover: view(saved), balance };
  }

  /**
   * Who may touch rider cash: the Super Admin, Finance and Operations, and warehouse staff (their tier is checked by the
   * caller). The other admin roles (support, marketing, moderation) have no business with it.
   */
  private requireStaff(actor: Actor): void {
    if (actor.role.startsWith('admin')) {
      if (!CASH_DESK_ADMINS.includes(actor.role)) throw new BadRequestException('Not allowed.');
      return;
    }
    if (actor.role !== 'warehouse_staff') throw new BadRequestException('Staff only.');
  }

  /** A positive USD amount in whole cents. */
  static amount(x: unknown): number {
    const n = typeof x === 'number' ? x : Number(x);
    if (x === null || x === undefined || x === '' || !Number.isFinite(n) || n <= 0 || n > 1_000_000) throw new BadRequestException('Enter the amount received, more than 0.');
    if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) throw new BadRequestException('Enter the amount in dollars and cents, for example 25.50.');
    return cents(n);
  }
}
