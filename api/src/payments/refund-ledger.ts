import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { Payment, PaymentRefund } from '../database/entities';
import type { RefundKind, RefundStatus } from '../database/entities';

/**
 * C-refund: the one place a refund of a payment is recorded and capped.
 *
 * Every path that gives paid money back goes through here: finance's order refund, a cancellation, the refund of
 * returned items, an admin's dispute decision, a seller cancelling lines, a payment that arrived after its order
 * was closed. Each writes the same `payment_refunds` row (amount, where it went, when, which return) and moves the
 * running total `payments.refundedUsd`, so the admin Refunds page lists it and the finance figures count it.
 *
 * The cap, enforced twice: the callers refuse up front with the amount that is really left (`refundableUsd`, in
 * their own transaction-free read), and `recordRefund` enforces it again in the database as ONE conditional UPDATE
 * (`amountUsd - refundedUsd >= amount`), so two refunds racing for the same money cannot both win.
 */

export const cents = (n: number): number => Number(n.toFixed(2));
const TOLERANCE = 0.009;

/** The sentences a refused refund carries (French: web `api-errors.ts` / `seller-errors.ts`, mobile `server_errors.dart`). */
export const refundTooMuch = (left: number): string => `That is more than what is left to refund on this order ($${left.toFixed(2)}).`;
export const NOTHING_LEFT_TO_REFUND = 'Nothing is left to refund on this order.';

/**
 * What can still be paid back on a payment: its amount less what was already refunded. `lines` (the order's items) are
 * a second witness for payments refunded before the ledger existed: the larger of the two is taken, never the sum.
 * Only a completed payment has anything to refund.
 */
export function refundableUsd(
  payment: Pick<Payment, 'amountUsd' | 'status' | 'refundedUsd'>,
  lines?: readonly { refundedUsd?: number | null }[] | null,
): number {
  if (payment.status !== 'succeeded') return 0;
  const onLines = (lines ?? []).reduce((t, l) => t + (l.refundedUsd ?? 0), 0);
  return Math.max(0, cents(payment.amountUsd - Math.max(payment.refundedUsd ?? 0, onLines)));
}

export interface RefundInput {
  payment: Pick<Payment, 'id' | 'userId' | 'orderId' | 'orderReference'>;
  amountUsd: number;
  /** Where the money goes. A phone refund starts as `sending` until pawaPay confirms it. */
  to: 'wallet' | 'phone';
  kind: RefundKind;
  /** The wallet history line, in English. */
  memo?: string | null;
  /** pawaPay refundId of a phone refund. */
  refundRef?: string | null;
  disputeId?: string | null;
  disputeReference?: string | null;
}

export interface RecordedRefund {
  entry: PaymentRefund;
  /** True when this refund took the last of the payment: it is now `refunded`. */
  closed: boolean;
}

/** Why the conditional update matched nothing, as the error to show. */
async function refusal(m: EntityManager, paymentId: string): Promise<BadRequestException | NotFoundException> {
  const p = await m.findOne(Payment, { where: { id: paymentId } });
  if (!p) return new NotFoundException('No payment for this order.');
  if (p.status === 'refunded') return new BadRequestException('Already refunded.');
  if (p.status !== 'succeeded') return new BadRequestException('Only a completed payment can be refunded.');
  const left = refundableUsd(p);
  return new BadRequestException(left < 0.01 ? NOTHING_LEFT_TO_REFUND : refundTooMuch(left));
}

/**
 * Record a refund inside the caller's transaction (`m`), so the row, the running total and the money movement
 * (wallet credit, order lines) commit together or not at all. Throws, writing nothing, when the amount is more
 * than what is left on the payment.
 */
export async function recordRefund(m: EntityManager, input: RefundInput): Promise<RecordedRefund> {
  const amount = cents(Number(input.amountUsd));
  if (!(amount > 0)) throw new BadRequestException('The refund amount must be more than zero.');
  const toPhone = input.to === 'phone';

  // C-refund (data layer): the refund lands only while amount paid - already refunded still covers it.
  const grew = await m
    .createQueryBuilder()
    .update(Payment)
    .set({ refundedUsd: () => `ROUND(COALESCE(refundedUsd, 0) + ${amount}, 2)`, updatedAt: new Date() })
    .where("id = :id AND status = 'succeeded' AND amountUsd - COALESCE(refundedUsd, 0) >= :need", { id: input.payment.id, need: amount - TOLERANCE })
    .execute();
  if (!grew.affected) throw await refusal(m, input.payment.id);

  const now = await m.findOneOrFail(Payment, { where: { id: input.payment.id } });
  const closed = cents(now.amountUsd - (now.refundedUsd ?? 0)) < 0.01;
  if (closed) await m.update(Payment, { id: input.payment.id, status: 'succeeded' }, { status: 'refunded' });
  if (toPhone) {
    await m.update(Payment, { id: input.payment.id }, { refundTo: 'phone', refundRef: input.refundRef ?? null, refundStatus: 'sending' });
  } else {
    // A wallet refund notes where the latest money went, but never overwrites a phone refund still in flight.
    await m
      .createQueryBuilder()
      .update(Payment)
      .set({ refundTo: 'wallet', refundStatus: 'completed' })
      .where("id = :id AND (refundStatus IS NULL OR refundStatus <> 'sending')", { id: input.payment.id })
      .execute();
  }

  const entry = await m.save(
    m.create(PaymentRefund, {
      paymentId: input.payment.id,
      orderId: input.payment.orderId,
      orderReference: input.payment.orderReference,
      userId: input.payment.userId,
      amountUsd: amount,
      refundTo: input.to,
      status: (toPhone ? 'sending' : 'completed') satisfies RefundStatus,
      refundRef: toPhone ? (input.refundRef ?? null) : null,
      kind: input.kind,
      disputeId: input.disputeId ?? null,
      disputeReference: input.disputeReference ?? null,
      memo: input.memo ?? null,
    }),
  );
  return { entry, closed };
}

/**
 * A mobile-money approval that arrived after its order was closed: the payment was already moved `failed` ->
 * `refunded` by a conditional claim (it can happen once), and the customer's money went to the wallet. Record it like
 * any other refund so the totals and the Refunds page include it.
 * C-refund: the claim of the caller is the cap here: a payment can be parked once.
 */
export async function recordParkedPayment(
  m: EntityManager,
  payment: Pick<Payment, 'id' | 'userId' | 'orderId' | 'orderReference' | 'amountUsd'>,
  memo: string,
): Promise<PaymentRefund> {
  await m.update(Payment, { id: payment.id }, { refundedUsd: payment.amountUsd, refundTo: 'wallet', refundStatus: 'completed' });
  return m.save(
    m.create(PaymentRefund, {
      paymentId: payment.id,
      orderId: payment.orderId,
      orderReference: payment.orderReference,
      userId: payment.userId,
      amountUsd: cents(payment.amountUsd),
      refundTo: 'wallet',
      status: 'completed',
      refundRef: null,
      kind: 'late_payment',
      disputeId: null,
      disputeReference: null,
      memo,
    }),
  );
}

/** Undo a refund that was recorded but never happened (pawaPay refused a phone refund): the money goes back on the payment. */
export async function revertRefund(m: EntityManager, entry: Pick<PaymentRefund, 'id' | 'paymentId' | 'amountUsd'>): Promise<void> {
  await m.delete(PaymentRefund, { id: entry.id });
  await m
    .createQueryBuilder()
    .update(Payment)
    .set({
      status: 'succeeded',
      refundedUsd: () => `CASE WHEN COALESCE(refundedUsd, 0) - ${entry.amountUsd} < 0.005 THEN NULL ELSE ROUND(refundedUsd - ${entry.amountUsd}, 2) END`,
      refundTo: null,
      refundRef: null,
      refundStatus: null,
    })
    .where('id = :id', { id: entry.paymentId })
    .execute();
}
