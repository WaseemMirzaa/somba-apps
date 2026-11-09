import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

/**
 * One tap = one wallet top-up.
 *
 * - `payments.requestKey`: the idempotency key of the request that created the payment (the app's own key, or a fingerprint
 *   of the top-up plus the minute). NULL for every existing payment and for card/order/plan payments.
 * - UNIQUE with `userId` (MySQL and SQLite both allow many NULLs under a unique index), so a double tap or a retry cannot
 *   make two payments: the second request finds the first and returns it.
 *
 * Nothing existing is changed. Written with the QueryRunner API (no raw MySQL), so it runs on MySQL and on SQLite. Reversible.
 */
export class TopUpIdempotency1793440000001 implements MigrationInterface {
  name = 'TopUpIdempotency1793440000001';

  public async up(q: QueryRunner): Promise<void> {
    if (!(await q.hasColumn('payments', 'requestKey'))) {
      await q.addColumn('payments', new TableColumn({ name: 'requestKey', type: 'varchar', length: '80', isNullable: true }));
    }
    const payments = await q.getTable('payments');
    if (!payments?.indices.some((i) => i.name === 'UQ_payments_user_request')) {
      await q.createIndex('payments', new TableIndex({ name: 'UQ_payments_user_request', columnNames: ['userId', 'requestKey'], isUnique: true }));
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    const payments = await q.getTable('payments');
    if (payments?.indices.some((i) => i.name === 'UQ_payments_user_request')) await q.dropIndex('payments', 'UQ_payments_user_request');
    if (await q.hasColumn('payments', 'requestKey')) await q.dropColumn('payments', 'requestKey');
  }
}
