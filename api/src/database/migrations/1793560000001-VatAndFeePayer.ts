import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * VAT and who pays the delivery fee.
 *
 * Up adds (each only when missing, so a second run changes nothing):
 *  - `categories.vatPct`        float NULL: the category's VAT %, NULL = the global default (`settings.vatPct`); 0 is a real rate;
 *  - `order_items.vatPct`       float 0:    the rate the line was placed with (frozen, a later change never rewrites it);
 *  - `order_items.vatUsd`       float 0:    the VAT charged on the line, in cents;
 *  - `order_items.sellerFeeUsd` float 0:    the line's share of the delivery fee when the SELLER pays it (0 otherwise);
 *  - `orders.vatUsd`            float 0:    the VAT of the whole order (the sum of its lines);
 *  - `orders.deliveryFeePaidBy` varchar 0:  'customer' | 'seller', the setting in force when the order was placed;
 *  - `payout_statement_lines.deliveryFeeUsd` float 0: the delivery fee a sale line deducts from the seller.
 * Every existing row gets 0 / 'customer': old orders keep exactly the totals and payouts they had.
 *
 * QueryRunner API only (no raw MySQL): runs on MySQL in production and SQLite in tests. Down drops the columns (the figures
 * cannot be restored).
 */
const COLUMNS: { table: string; column: TableColumn }[] = [
  { table: 'categories', column: new TableColumn({ name: 'vatPct', type: 'float', isNullable: true }) },
  { table: 'order_items', column: new TableColumn({ name: 'vatPct', type: 'float', isNullable: false, default: 0 }) },
  { table: 'order_items', column: new TableColumn({ name: 'vatUsd', type: 'float', isNullable: false, default: 0 }) },
  { table: 'order_items', column: new TableColumn({ name: 'sellerFeeUsd', type: 'float', isNullable: false, default: 0 }) },
  { table: 'orders', column: new TableColumn({ name: 'vatUsd', type: 'float', isNullable: false, default: 0 }) },
  { table: 'orders', column: new TableColumn({ name: 'deliveryFeePaidBy', type: 'varchar', length: '10', isNullable: false, default: "'customer'" }) },
  { table: 'payout_statement_lines', column: new TableColumn({ name: 'deliveryFeeUsd', type: 'float', isNullable: false, default: 0 }) },
];

export class VatAndFeePayer1793560000001 implements MigrationInterface {
  name = 'VatAndFeePayer1793560000001';

  public async up(q: QueryRunner): Promise<void> {
    for (const { table, column } of COLUMNS) {
      if ((await q.hasTable(table)) && !(await q.hasColumn(table, column.name))) await q.addColumn(table, column.clone());
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const { table, column } of [...COLUMNS].reverse()) {
      if ((await q.hasTable(table)) && (await q.hasColumn(table, column.name))) await q.dropColumn(table, column.name);
    }
  }
}
