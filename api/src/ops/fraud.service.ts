import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FraudAlert, Order, User } from '../database/entities';
import type { FraudStatus } from '../database/entities/fraud-alert.entity';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES, NotificationsService } from '../notifications/notifications.service';
import { CustomersService } from './customers.service';
import { AuditService } from './audit.service';

/** Who is acting: the signed-in admin, and whether their role may suspend accounts (the `customers:setActive` rule). */
export interface FraudActor {
  id: string;
  name: string;
  role: string;
  canSuspend: boolean;
  /** The admin confirmed that this suspends (or reactivates) the account. */
  confirmed: boolean;
}

/** An alert after a status change, and the account whose live sockets the caller must now drop (a block). */
export interface FraudChange {
  alert: FraudAlert;
  kickUserId?: string;
}

@Injectable()
export class FraudService {
  constructor(
    @InjectRepository(FraudAlert) private readonly repo: Repository<FraudAlert>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly emitter: RealtimeEmitter,
    private readonly customers: CustomersService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The rules engine registers itself here when the app starts (it needs this service, so it cannot be injected back). */
  private rules: { afterOrder(customer: { id: string; name: string }, order: { id: string; paymentMethod: string; totalUsd: number }): Promise<void> } | null = null;

  useRules(rules: NonNullable<FraudService['rules']>): void {
    this.rules = rules;
  }

  /** An order was just placed: run the fraud rules for its customer (the cash-on-delivery cap only while COD is offered). Never throws. */
  async afterOrder(customer: { id: string; name: string }, order: { id: string; paymentMethod: string; totalUsd: number }): Promise<void> {
    await this.rules?.afterOrder(customer, order);
  }

  list(): Promise<FraudAlert[]> {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: 200 });
  }

  /** Raise a COD-risk alert when a large COD order is placed. */
  async flagCodRisk(
    customer: string,
    orderId: string,
    amountUsd: number,
    capUsd: number,
    customerId?: string,
  ): Promise<FraudAlert | null> {
    if (amountUsd <= capUsd) return null;
    const alert = await this.repo.save(
      this.repo.create({
        type: 'cod_risk',
        severity: amountUsd > capUsd * 2 ? 'high' : 'medium',
        customer,
        customerId: customerId ?? null,
        orderId,
        reason: `Cash-on-delivery order of $${amountUsd.toFixed(2)} is above the $${capUsd.toFixed(2)} cap.`,
        reasonFr: `Commande à payer à la livraison de ${amountUsd.toFixed(2)} $ au-dessus du plafond de ${capUsd.toFixed(2)} $.`,
        score: Math.min(99, Math.round((amountUsd / capUsd) * 40)),
        status: 'open',
      }),
    );
    this.emitter.toRoles(ADMIN_ROLES, 'fraud:created', alert);
    return alert;
  }

  /** The account an alert is about: the customer it names, or else the customer of the order that raised it. */
  private async accountOf(alert: FraudAlert): Promise<User | null> {
    if (alert.customerId) return this.users.findOne({ where: { id: alert.customerId } });
    if (!alert.orderId) return null;
    const order = await this.orders.findOne({ where: { id: alert.orderId }, select: ['id', 'customerId'] });
    return order ? this.users.findOne({ where: { id: order.customerId } }) : null;
  }

  /** Other alerts still blocking this account (through their orders). */
  private async otherBlocks(alertId: string, accountId: string): Promise<number> {
    const orderIds = (await this.orders.find({ where: { customerId: accountId }, select: ['id'] })).map((o) => o.id);
    const where = [{ status: 'blocked' as const, customerId: accountId }, ...(orderIds.length ? [{ status: 'blocked' as const, orderId: In(orderIds) }] : [])];
    return (await this.repo.find({ where, select: ['id'] })).filter((a) => a.id !== alertId).length;
  }

  /**
   * Move an alert between open / reviewed / blocked. "Blocked" is real: it suspends the customer's account
   * (the same path as `customers:setActive`: tokens revoked, sockets dropped by the caller), and moving a
   * blocked alert back to open or reviewed reactivates it, unless another alert still blocks the same account.
   * Both need the right to suspend accounts and are audited and noticed. A caller that may not suspend can
   * still mark alerts reviewed or reopen alerts that are not blocked.
   */
  async setStatus(id: string, status: FraudStatus, actor: FraudActor): Promise<FraudChange> {
    const alert = await this.repo.findOne({ where: { id } });
    if (!alert) throw new Error('Alert not found.');
    const wasBlocked = alert.status === 'blocked';
    const blocking = status === 'blocked' && !wasBlocked;
    const unblocking = wasBlocked && status !== 'blocked';
    let kickUserId: string | undefined;
    let account: User | null = null;

    if (blocking || unblocking) {
      if (!actor.canSuspend) {
        throw new Error(
          blocking
            ? 'Blocking suspends the customer\'s account, which only a super admin or support admin can do. You can mark the alert reviewed.'
            : 'This alert blocked the customer\'s account. Only a super admin or support admin can lift that.',
        );
      }
      if (!actor.confirmed) {
        throw new Error(blocking ? 'Confirm that blocking suspends this customer\'s account.' : 'Confirm that this reactivates the customer\'s account.');
      }
      account = await this.accountOf(alert);
      if (!account) throw new Error('This alert is not linked to an account, so there is nothing to block.');
      if (blocking) {
        await this.customers.setActive(account.id, false, actor.id);
        kickUserId = account.id;
      } else if ((await this.otherBlocks(id, account.id)) === 0) {
        await this.customers.setActive(account.id, true, actor.id);
      } else {
        account = null; // another blocked alert keeps the account suspended; only this alert's status moves
      }
    }

    await this.repo.update({ id }, { status });
    const updated = (await this.repo.findOne({ where: { id } }))!;
    this.emitter.toRoles(ADMIN_ROLES, 'fraud:updated', updated);

    const entry = { actor: actor.name, role: actor.role };
    if (status !== alert.status) {
      await this.audit.record({ ...entry, action: `fraud.${status}`, entity: 'fraud', entityId: id, detail: `${alert.customer}${alert.orderId ? ` · order ${alert.orderId}` : ''}` });
    }
    if (account) {
      const reason = `Fraud alert ${id}`;
      await this.audit.record({ ...entry, action: blocking ? 'user.suspend' : 'user.reactivate', entity: 'user', entityId: account.id, detail: reason });
      await this.tell(account, blocking);
    }
    return { alert: updated, kickUserId };
  }

  /** Tell the admins what happened and leave the customer a note (it is waiting when the account is back). */
  private async tell(account: User, blocked: boolean): Promise<void> {
    try {
      await this.notifications.toAdmins({
        title: blocked ? 'Account blocked' : 'Account unblocked',
        body: blocked
          ? `${account.name} was suspended after a fraud alert.`
          : `${account.name} was reactivated after a fraud alert.`,
        type: 'fraud',
        entityId: account.id,
      }, 'fraudAlerts');
      await this.notifications.toUser(account.id, {
        title: blocked ? 'Account suspended' : 'Account reinstated',
        body: blocked ? 'Your account is suspended. Contact support for help.' : 'Your account is active again.',
        type: 'system',
      });
    } catch {
      /* the account change and its audit entry already happened; a failed notice must not undo them */
    }
  }
}
