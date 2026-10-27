import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderItem, Payment } from '../database/entities';
import type { PaymentRefund } from '../database/entities';
import { NotificationsService } from '../notifications/notifications.service';
import { PAWAPAY_CLIENT, PawapayClient, PawapayUnavailableError } from '../payments/pawapay.provider';
import { PaymentsService } from '../payments/payments.service';
import { NOTHING_LEFT_TO_REFUND, recordRefund, refundTooMuch, refundableUsd, revertRefund } from '../payments/refund-ledger';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { WalletService } from '../wallet/wallet.service';

const FINANCE_ROLES = ['admin', 'admin_finance'];
const cents = (n: number) => Number(n.toFixed(2));

export interface PartialRefundInput {
  orderId: string;
  amountUsd: number;
  /** false: back to the paying phone (pawaPay); falls back to the wallet when the payment cannot go back to a phone. */
  toWallet: boolean;
  /** Wallet history line, English (localize.ts has the French). */
  memo: string;
  /** Which order lines the money belongs to (their `refundedUsd` grows). Omitted: spread over what is left on every line. */
  lines?: { orderItemId: string; usd: number }[];
  /** Which request this refund belongs to, for the ledger: a return's refund (`return`) or an admin's dispute decision (`dispute`). */
  source?: { kind: 'return' | 'dispute'; disputeId: string; disputeReference: string };
}

export interface PartialRefundResult {
  refundedUsd: number;
  /** Where the money really went. */
  to: 'wallet' | 'phone';
  payment: Payment;
  /** The ledger row this refund wrote. */
  refund: PaymentRefund;
}

/**
 * Pays back PART of an order: the items a customer returned, or an amount an admin decided on. The existing
 * `PaymentsService.refund` pays back everything still outstanding and closes the order; this one keeps the order and
 * the payment open, writes the amount on the order lines (`order_items.refundedUsd`) and records it in the refund
 * ledger (`payment_refunds`, with the running total `payments.refundedUsd`) like every refund, so a later full refund
 * can never pay the same money twice and the admin Refunds page and the finance figures count it.
 */
@Injectable()
export class PartialRefundService {
  private readonly logger = new Logger(PartialRefundService.name);

  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem) private readonly lines: Repository<OrderItem>,
    private readonly wallet: WalletService,
    private readonly paymentsSvc: PaymentsService,
    private readonly emitter: RealtimeEmitter,
    private readonly notifications: NotificationsService,
    @Optional() @Inject(PAWAPAY_CLIENT) private readonly pawapay: PawapayClient | null = null,
  ) {}

  /** What is still refundable on the order's payment. */
  async outstanding(orderId: string): Promise<number> {
    const [payment, order] = await Promise.all([this.paymentsSvc.forOrder(orderId), this.orders.findOne({ where: { id: orderId } })]);
    if (!payment || !order) return 0;
    return refundableUsd(payment, order.items);
  }

  /** The money a set of units is worth: price x qty, less the promo discount's share (the promo is spread over lines pro rata). */
  static worth(order: Pick<Order, 'subtotalUsd' | 'discountUsd'>, units: { unitPriceUsd: number; qty: number }[]): number {
    const value = units.reduce((t, u) => t + u.unitPriceUsd * u.qty, 0);
    const share = order.subtotalUsd > 0 ? value / order.subtotalUsd : 0;
    return cents(Math.max(0, value - (order.discountUsd ?? 0) * share));
  }

  async refund(input: PartialRefundInput): Promise<PartialRefundResult> {
    const amount = cents(Number(input.amountUsd));
    if (!(amount > 0)) throw new BadRequestException('The refund amount must be more than zero.');
    const payment = await this.paymentsSvc.forOrder(input.orderId);
    if (!payment) throw new NotFoundException('No payment for this order.');
    if (payment.status === 'refunded') throw new BadRequestException('Already refunded.');
    if (payment.status !== 'succeeded') throw new BadRequestException('Only a completed payment can be refunded.');
    const order = await this.orders.findOne({ where: { id: input.orderId } });
    if (!order) throw new NotFoundException('Order not found.');
    // C-refund (service): never pay back more than is left on the payment (what a seller cancelled and earlier returns
    // already took is out); the clear sentence says how much is left. recordRefund checks it again in the transaction.
    const left = refundableUsd(payment, order.items);
    if (left < 0.01) throw new BadRequestException(NOTHING_LEFT_TO_REFUND);
    if (amount > left + 0.009) throw new BadRequestException(refundTooMuch(left));
    const toPhone = input.toWallet === false && this.paymentsSvc.canRefundToPhone(payment) && !payment.refundRef;
    const refundRef = toPhone ? this.pawapay!.newId() : null;
    const spread = this.attribute(order, amount, input.lines);

    // Of two refunds racing for the same money, the payment row serialises them: the second is refused with what is left.
    const entry = await this.payments.manager.transaction(async (m) => {
      const { entry: recorded } = await recordRefund(m, {
        payment,
        amountUsd: amount,
        to: toPhone ? 'phone' : 'wallet',
        kind: input.source?.kind ?? 'dispute',
        memo: input.memo,
        refundRef,
        disputeId: input.source?.disputeId,
        disputeReference: input.source?.disputeReference,
      });
      for (const [id, usd] of spread) {
        await m.createQueryBuilder().update(OrderItem).set({ refundedUsd: () => `ROUND(refundedUsd + ${usd}, 2)` }).where('id = :id', { id }).execute();
      }
      if (!toPhone) await this.wallet.apply(payment.userId, 'refund', amount, input.memo, m);
      return recorded;
    });

    if (toPhone) {
      try {
        await this.pawapay!.refund({ refundId: refundRef!, depositId: payment.providerRef!, amountUsd: amount, reference: payment.reference });
      } catch (e) {
        if (!(e instanceof PawapayUnavailableError)) {
          // pawaPay said no: undo, so the money can go to the wallet instead.
          await this.payments.manager.transaction(async (m) => {
            await revertRefund(m, entry);
            for (const [id, usd] of spread) {
              await m.createQueryBuilder().update(OrderItem).set({ refundedUsd: () => `ROUND(refundedUsd - ${usd}, 2)` }).where('id = :id', { id }).execute();
            }
          });
          this.logger.warn(`pawaPay refused ${refundRef}: ${(e as Error).message}; refunding to the wallet`);
          return this.refund({ ...input, toWallet: true });
        }
        // No answer: the refund may exist; the status check settles it.
        this.logger.warn(`Refund ${refundRef} for ${payment.reference} unconfirmed: ${e.message}`);
      }
    }

    const saved = (await this.payments.findOne({ where: { id: payment.id } }))!;
    const view = { ...saved, phone: saved.phone ? `${saved.phone.slice(0, 4)}…${saved.phone.slice(-2)}` : null, refundableUsd: refundableUsd(saved) };
    this.emitter.toUser(saved.userId, 'payment:updated', view);
    this.emitter.toRoles(FINANCE_ROLES, 'payment:updated', view);
    const fresh = await this.orders.findOne({ where: { id: order.id } });
    if (fresh) {
      this.emitter.toUser(fresh.customerId, 'order:updated', fresh);
      this.emitter.toRoles(FINANCE_ROLES, 'order:updated', fresh);
    }
    await this.notifications.toUser(saved.userId, {
      title: 'Refund issued',
      body: toPhone
        ? `$${amount.toFixed(2)} for ${saved.orderReference} is on its way back to your mobile-money number.`
        : `$${amount.toFixed(2)} for ${saved.orderReference} → wallet.`,
      type: 'payment',
      entityId: input.orderId,
    });
    return { refundedUsd: amount, to: toPhone ? 'phone' : 'wallet', payment: saved, refund: entry };
  }

  /** The line each part of the money belongs to: as given, else spread over what is still refundable on each line. */
  private attribute(order: Order, amount: number, given?: { orderItemId: string; usd: number }[]): Map<string, number> {
    const out = new Map<string, number>();
    if (given?.length) {
      for (const g of given) out.set(g.orderItemId, cents((out.get(g.orderItemId) ?? 0) + g.usd));
      return out;
    }
    const room = (order.items ?? [])
      .map((i) => ({ id: i.id, room: Math.max(0, i.priceUsd * i.qty - (i.refundedUsd ?? 0)) }))
      .filter((r) => r.room > 0.004);
    const total = room.reduce((t, r) => t + r.room, 0);
    let rest = amount;
    room.forEach((r, idx) => {
      const part = idx === room.length - 1 ? rest : cents((amount * r.room) / total);
      const usd = Math.min(cents(part), cents(r.room));
      out.set(r.id, usd);
      rest = cents(rest - usd);
    });
    return out;
  }
}
