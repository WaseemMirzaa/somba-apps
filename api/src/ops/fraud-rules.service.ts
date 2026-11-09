import { Injectable, Logger, Optional } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { Dispute, FraudAlert, FraudSignal, Order, Payment, PaymentRefund, User } from '../database/entities';
import { SettingsService } from '../content/settings.service';
import { ROLE_GROUPS } from '../common/role-groups';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { FRAUD_THRESHOLDS, FraudAlertType, FraudThresholdName } from './fraud-rules.config';
import { FraudService } from './fraud.service';
import { FraudSignalsService } from './fraud-signals.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** How often the sweep runs, in ms (0 = off). Read when the app starts, so `.env` is loaded by then. */
const sweepMs = (): number => Number(process.env.FRAUD_SWEEP_MS ?? 600_000);
const SWEEP_LIMIT = 500;

export type Thresholds = Record<FraudThresholdName, number>;

/** What a rule found: the numbers, and the sentence an admin reads (English and French). */
interface Finding {
  type: FraudAlertType;
  value: number;
  limit: number;
  reason: string;
  reasonFr: string;
}

/**
 * The fraud rules beyond cash on delivery. Each rule counts something about one customer over a window, compares it
 * with a platform setting (the thresholds, defaults in fraud-rules.config.ts) and, when it is reached, raises
 * ONE alert with the reason, at most once per rule per customer per day (`dedupeKey`). The rules run right after an order
 * is placed, when an address or device signal is recorded, and on a sweep every few minutes (for what no order
 * triggers, such as failed payments and returns). A rule failing never breaks the flow that triggered it.
 */
@Injectable()
export class FraudRulesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FraudRulesService.name);
  private sweeper: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(FraudAlert) private readonly alerts: Repository<FraudAlert>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Dispute) private readonly disputes: Repository<Dispute>,
    @InjectRepository(PaymentRefund) private readonly refunds: Repository<PaymentRefund>,
    @InjectRepository(FraudSignal) private readonly signals: Repository<FraudSignal>,
    private readonly settings: SettingsService,
    private readonly fraud: FraudService,
    private readonly emitter: RealtimeEmitter,
    @Optional() private readonly signalSource?: FraudSignalsService,
  ) {}

  onModuleInit(): void {
    this.fraud.useRules(this);
    // A failed check (a database error) is logged, never an unhandled rejection that would end the process.
    this.signalSource?.onSignal((userId) =>
      this.evaluate(userId).then(
        () => undefined,
        (e) => this.logger.warn(`fraud check after a signal failed: ${(e as Error).message}`),
      ),
    );
    const every = sweepMs();
    if (every > 0) {
      this.sweeper = setInterval(() => void this.sweep().catch((e) => this.logger.warn(`sweep failed: ${(e as Error).message}`)), every);
      this.sweeper.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  /** The thresholds in force: the setting when it is a valid whole number in range, otherwise the default. */
  async thresholds(): Promise<Thresholds> {
    const out = {} as Thresholds;
    for (const [name, t] of Object.entries(FRAUD_THRESHOLDS) as [FraudThresholdName, (typeof FRAUD_THRESHOLDS)[FraudThresholdName]][]) {
      const raw = await this.settings.get(t.key);
      const n = raw === null || raw === '' ? NaN : Number(raw);
      out[name] = Number.isInteger(n) && n >= t.min && n <= t.max ? n : t.default;
    }
    return out;
  }

  /**
   * After an order was placed: the cash-on-delivery cap (only while cash on delivery is offered), then every other rule.
   * Never throws: the order is already saved.
   */
  async afterOrder(customer: { id: string; name: string }, order: { id: string; paymentMethod: string; totalUsd: number }): Promise<void> {
    try {
      if (order.paymentMethod === 'cod' && (await this.settings.get('codEnabled')) === 'true') {
        const cap = Number((await this.settings.get('codCapUsd')) ?? '500');
        await this.fraud.flagCodRisk(customer.name, order.id, order.totalUsd, cap, customer.id);
      }
      await this.evaluate(customer.id, { orderId: order.id });
    } catch (e) {
      this.logger.warn(`fraud check after order failed: ${(e as Error).message}`);
    }
  }

  /** Run every rule for one customer; returns the alerts raised now (none when nothing is reached or today's alert exists). */
  async evaluate(userId: string, opts: { now?: Date; orderId?: string } = {}): Promise<FraudAlert[]> {
    const now = opts.now ?? new Date();
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || user.role !== 'customer' || !user.active) return [];
    const th = await this.thresholds();
    const rules: ((u: User, t: Thresholds, at: Date) => Promise<Finding | null>)[] = [
      (u, t, at) => this.failedPayments(u, t, at),
      (u, t, at) => this.newAccountOrders(u, t, at),
      (u, t) => this.sharedIdentity(u, t),
      (u, t, at) => this.returnRate(u, t, at),
      (u, t, at) => this.addressChanges(u, t, at),
    ];
    const raised: FraudAlert[] = [];
    for (const rule of rules) {
      try {
        const found = await rule(user, th, now);
        if (!found) continue;
        const alert = await this.raise(user, found, now, opts.orderId);
        if (alert) raised.push(alert);
      } catch (e) {
        this.logger.warn(`fraud rule failed for ${userId}: ${(e as Error).message}`);
      }
    }
    return raised;
  }

  /** Check every customer who did something in the last 24 hours that a rule counts. Returns how many were checked. */
  async sweep(now = new Date()): Promise<number> {
    const since = new Date(now.getTime() - DAY_MS);
    const ids = new Set<string>();
    const add = (rows: { id: string | null }[]) => rows.forEach((r) => r.id && ids.add(r.id));
    add(await this.payments.createQueryBuilder('p').select('DISTINCT p.userId', 'id').where('p.status = :s AND p.createdAt >= :since', { s: 'failed', since }).limit(SWEEP_LIMIT).getRawMany());
    add(await this.orders.createQueryBuilder('o').select('DISTINCT o.customerId', 'id').where('o.createdAt >= :since', { since }).limit(SWEEP_LIMIT).getRawMany());
    add(await this.disputes.createQueryBuilder('d').select('DISTINCT d.customerId', 'id').where('d.createdAt >= :since', { since }).limit(SWEEP_LIMIT).getRawMany());
    add(await this.signals.createQueryBuilder('s').select('DISTINCT s.userId', 'id').where('s.createdAt >= :since', { since }).limit(SWEEP_LIMIT).getRawMany());
    let checked = 0;
    for (const id of [...ids].slice(0, SWEEP_LIMIT)) {
      await this.evaluate(id, { now });
      checked += 1;
    }
    return checked;
  }

  // ── The rules ─────────────────────────────────────────────────────────────

  /** Many failed payment attempts in 24 hours. */
  private async failedPayments(u: User, t: Thresholds, now: Date): Promise<Finding | null> {
    const n = await this.payments.count({ where: { userId: u.id, status: 'failed', createdAt: MoreThanOrEqual(new Date(now.getTime() - DAY_MS)) } });
    if (n < t.failedPayments) return null;
    return {
      type: 'failed_payments',
      value: n,
      limit: t.failedPayments,
      reason: `${n} failed payment attempts in the last 24 hours (limit ${t.failedPayments}).`,
      reasonFr: `${n} tentatives de paiement échouées au cours des dernières 24 heures (limite ${t.failedPayments}).`,
    };
  }

  /** Many orders in 24 hours from an account created only a few days ago. */
  private async newAccountOrders(u: User, t: Thresholds, now: Date): Promise<Finding | null> {
    const ageDays = (now.getTime() - u.createdAt.getTime()) / DAY_MS;
    if (ageDays > t.newAccountDays) return null;
    const n = await this.orders.count({ where: { customerId: u.id, createdAt: MoreThanOrEqual(new Date(now.getTime() - DAY_MS)) } });
    if (n < t.newAccountOrders) return null;
    return {
      type: 'new_account_orders',
      value: n,
      limit: t.newAccountOrders,
      reason: `${n} orders in the last 24 hours from an account created ${Math.max(0, Math.floor(ageDays))} day(s) ago (limit ${t.newAccountOrders}).`,
      reasonFr: `${n} commandes au cours des dernières 24 heures depuis un compte créé il y a ${Math.max(0, Math.floor(ageDays))} jour(s) (limite ${t.newAccountOrders}).`,
    };
  }

  /** The same phone number, or the same device, on several customer accounts. */
  private async sharedIdentity(u: User, t: Thresholds): Promise<Finding | null> {
    const phoneAccounts = u.phoneHash ? await this.users.count({ where: { phoneHash: u.phoneHash, role: 'customer' } }) : 0;
    let deviceAccounts = 0;
    const mine = await this.signals.find({ where: { userId: u.id, kind: 'device' }, select: ['key'] });
    if (mine.length) {
      const rows = await this.signals
        .createQueryBuilder('s')
        .select('s.key', 'key')
        .addSelect('COUNT(DISTINCT s.userId)', 'accounts')
        .where('s.kind = :kind AND s.key IN (:...keys)', { kind: 'device', keys: mine.map((m) => m.key) })
        .groupBy('s.key')
        .getRawMany<{ accounts: string | number }>();
      deviceAccounts = Math.max(0, ...rows.map((r) => Number(r.accounts)));
    }
    const phoneHit = phoneAccounts >= t.sharedAccounts;
    const deviceHit = deviceAccounts >= t.sharedAccounts;
    if (!phoneHit && !deviceHit) return null;
    const en = [phoneHit ? `${phoneAccounts} accounts use the same phone number` : '', deviceHit ? `${deviceAccounts} accounts used the same device` : ''].filter(Boolean).join('; ');
    const fr = [phoneHit ? `${phoneAccounts} comptes utilisent le même numéro de téléphone` : '', deviceHit ? `${deviceAccounts} comptes ont utilisé le même appareil` : ''].filter(Boolean).join(' ; ');
    return { type: 'shared_identity', value: Math.max(phoneAccounts, deviceAccounts), limit: t.sharedAccounts, reason: `${en} (limit ${t.sharedAccounts}).`, reasonFr: `${fr} (limite ${t.sharedAccounts}).` };
  }

  /** A high share of the last 30 days' orders came back: returned, disputed or refunded as a return/dispute. */
  private async returnRate(u: User, t: Thresholds, now: Date): Promise<Finding | null> {
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const placed = await this.orders.count({ where: { customerId: u.id, createdAt: MoreThanOrEqual(since), status: Not('cancelled') } });
    if (placed < t.returnMinOrders) return null;
    const back = new Set<string>();
    for (const d of await this.disputes.find({ where: { customerId: u.id, createdAt: MoreThanOrEqual(since) }, select: ['orderId'] })) back.add(d.orderId);
    for (const r of await this.refunds.find({ where: { userId: u.id, createdAt: MoreThanOrEqual(since), kind: In(['return', 'dispute']) }, select: ['orderId'] })) if (r.orderId) back.add(r.orderId);
    for (const o of await this.orders.find({ where: { customerId: u.id, createdAt: MoreThanOrEqual(since), status: 'returned' }, select: ['id'] })) back.add(o.id);
    const pct = Math.min(100, Math.round((back.size / Math.max(placed, back.size)) * 100));
    if (back.size === 0 || pct < t.returnRatePct) return null;
    return {
      type: 'return_rate',
      value: pct,
      limit: t.returnRatePct,
      reason: `${back.size} of ${placed} orders in the last 30 days were returned, disputed or refunded (${pct}%, limit ${t.returnRatePct}%).`,
      reasonFr: `${back.size} commandes sur ${placed} au cours des 30 derniers jours ont été retournées, contestées ou remboursées (${pct} %, limite ${t.returnRatePct} %).`,
    };
  }

  /** Many delivery address changes in 24 hours while an order was on its way. */
  private async addressChanges(u: User, t: Thresholds, now: Date): Promise<Finding | null> {
    const n = await this.signals.count({ where: { userId: u.id, kind: 'address_change', createdAt: MoreThanOrEqual(new Date(now.getTime() - DAY_MS)) } });
    if (n < t.addressChanges) return null;
    return {
      type: 'address_changes',
      value: n,
      limit: t.addressChanges,
      reason: `${n} delivery address changes in the last 24 hours while an order was on its way (limit ${t.addressChanges}).`,
      reasonFr: `${n} changements d'adresse de livraison au cours des dernières 24 heures alors qu'une commande était en route (limite ${t.addressChanges}).`,
    };
  }

  // ── Raising ───────────────────────────────────────────────────────────────

  /** Save the alert unless this rule already raised one for this customer today. */
  private async raise(user: User, f: Finding, now: Date, orderId?: string): Promise<FraudAlert | null> {
    const dedupeKey = `${f.type}:${user.id}:${now.toISOString().slice(0, 10)}`;
    if (await this.alerts.findOne({ where: { dedupeKey }, select: ['id'] })) return null;
    const ratio = f.value / f.limit;
    try {
      const alert = await this.alerts.save(
        this.alerts.create({
          type: f.type,
          severity: ratio >= 2 ? 'high' : ratio >= 1.25 ? 'medium' : 'low',
          customer: user.name,
          customerId: user.id,
          orderId: orderId ?? null,
          score: Math.min(99, Math.max(1, Math.round(ratio * 50))),
          status: 'open',
          reason: f.reason,
          reasonFr: f.reasonFr,
          dedupeKey,
        }),
      );
      this.emitter.toRoles([...ROLE_GROUPS.fraudAlerts], 'fraud:created', alert);
      return alert;
    } catch (e) {
      // Two requests raced to raise the same alert: the unique key kept one, which is what we want.
      if (await this.alerts.findOne({ where: { dedupeKey }, select: ['id'] })) return null;
      throw e;
    }
  }
}
