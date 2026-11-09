import { Column, Entity, PrimaryColumn } from 'typeorm';

/** How a checkout attempt ended: an order exists (whatever happened to it later), or its payment failed. */
export type OrderRequestOutcome = 'placed' | 'failed';

/**
 * One checkout attempt of one customer (C-01). The composite primary key is what makes `orders:create` idempotent
 * under concurrency: the FIRST request inserts the row and does the work, every other request with the same key hits
 * the key, waits for the first to finish and gets its order back. Nothing is charged twice.
 *
 * `requestKey` is `k:<clientRequestId>` for a key the app sent, or `fp:<sha256 of the cart>` for an older app that sends
 * none (a short de-duplication window; see `OrdersService.place`). `orderId` is chosen BEFORE the order exists, so a
 * waiting request knows which order to look for. `outcome` is null while the first request is still running.
 */
@Entity('order_requests')
export class OrderRequest {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  customerId: string;

  @PrimaryColumn({ type: 'varchar', length: 80 })
  requestKey: string;

  @Column({ type: 'varchar', length: 36 })
  orderId: string;

  @Column({ type: 'datetime' })
  startedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  outcome: OrderRequestOutcome | null;
}
