import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';

/**
 * Cash on delivery is gone from the product: payment is always taken up front (wallet, mobile money or card).
 *
 * Up:
 *  - drops the table `cod_handovers` (the ledger of rider cash handed in at a warehouse);
 *  - drops the cash columns of `delivery_tasks`: `codAmountUsd`, `codCollectedUsd`, `codCollectedAt`, `codCollectedById`,
 *    `codHandedOverUsd`;
 *  - changes the default of `orders.paymentMethod` from `'cod'` to `'wallet'` (the column stays: it holds the other methods, and
 *    old orders keep the value they were placed with; the API always sets the method, so the default is only a safety net);
 *  - deletes the settings `codEnabled` and `codCapUsd` and the fraud alerts of the removed rule (`type = 'cod_risk'`).
 *
 * Written with the QueryRunner API, so it runs on MySQL in production and on SQLite in tests. Each step checks what exists first,
 * so a second run changes nothing.
 *
 * Down puts the columns, the table, the default and the two settings (at the values the bootstrap used) back, with the definitions
 * the earlier migrations created. The cash data and the fraud alerts deleted by `up` cannot be restored.
 */
export class RemoveCashOnDelivery1793460000001 implements MigrationInterface {
  name = 'RemoveCashOnDelivery1793460000001';

  public async up(q: QueryRunner): Promise<void> {
    if (await q.hasTable('cod_handovers')) await q.dropTable('cod_handovers', true, true, true);

    for (const name of ['codHandedOverUsd', 'codCollectedById', 'codCollectedAt', 'codCollectedUsd', 'codAmountUsd']) {
      if (await q.hasColumn('delivery_tasks', name)) await q.dropColumn('delivery_tasks', name);
    }

    const orders = await q.getTable('orders');
    const method = orders?.findColumnByName('paymentMethod');
    if (method && method.default !== "'wallet'") {
      const next = method.clone();
      next.default = "'wallet'";
      await q.changeColumn('orders', method, next);
    }

    const e = (n: string) => q.connection.driver.escape(n);
    await q.query(`DELETE FROM ${e('settings')} WHERE ${e('key')} IN ('codEnabled', 'codCapUsd')`);
    await q.query(`DELETE FROM ${e('fraud_alerts')} WHERE ${e('type')} = 'cod_risk'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    const sqlite = q.connection.options.type === 'better-sqlite3' || q.connection.options.type === 'sqlite';

    const add = async (name: string, spec: Partial<TableColumn>) => {
      if (!(await q.hasColumn('delivery_tasks', name))) await q.addColumn('delivery_tasks', new TableColumn({ name, ...spec } as TableColumn));
    };
    await add('codAmountUsd', { type: 'float', isNullable: false, default: 0 });
    await add('codCollectedUsd', { type: 'double', isNullable: true });
    await add('codCollectedAt', { type: 'datetime', isNullable: true });
    await add('codCollectedById', { type: 'varchar', length: '36', isNullable: true });
    await add('codHandedOverUsd', { type: 'double', isNullable: false, default: 0 });

    if (!(await q.hasTable('cod_handovers'))) {
      await q.createTable(
        new Table({
          name: 'cod_handovers',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'riderId', type: 'varchar', length: '36', isNullable: false },
            { name: 'riderName', type: 'varchar', length: '255', isNullable: false },
            { name: 'hubId', type: 'varchar', length: '36', isNullable: true },
            { name: 'amountUsd', type: 'double', isNullable: false },
            { name: 'heldBeforeUsd', type: 'double', isNullable: false },
            { name: 'receivedById', type: 'varchar', length: '36', isNullable: false },
            { name: 'receivedByName', type: 'varchar', length: '255', isNullable: false },
            { name: 'receivedByRole', type: 'varchar', length: '40', isNullable: false },
            { name: 'note', type: 'varchar', length: '200', isNullable: true },
            { name: 'clientRef', type: 'varchar', length: '64', isNullable: true },
            sqlite
              ? { name: 'createdAt', type: 'datetime', isNullable: false, default: "datetime('now')" }
              : { name: 'createdAt', type: 'datetime', precision: 6, isNullable: false, default: 'CURRENT_TIMESTAMP(6)' },
          ],
        }),
        true,
      );
      await q.createIndex('cod_handovers', new TableIndex({ name: 'IDX_cod_handovers_riderId', columnNames: ['riderId'] }));
      await q.createIndex('cod_handovers', new TableIndex({ name: 'IDX_cod_handovers_hubId', columnNames: ['hubId'] }));
      await q.createIndex('cod_handovers', new TableIndex({ name: 'IDX_cod_handovers_clientRef', columnNames: ['clientRef'], isUnique: true }));
    }

    const orders = await q.getTable('orders');
    const method = orders?.findColumnByName('paymentMethod');
    if (method && method.default !== "'cod'") {
      const next = method.clone();
      next.default = "'cod'";
      await q.changeColumn('orders', method, next);
    }

    const e = (n: string) => q.connection.driver.escape(n);
    for (const [key, value] of [['codCapUsd', '500'], ['codEnabled', 'false']]) {
      const have = await q.query(`SELECT 1 AS x FROM ${e('settings')} WHERE ${e('key')} = ?`, [key]);
      if (!have.length) await q.query(`INSERT INTO ${e('settings')} (${e('key')}, ${e('value')}) VALUES (?, ?)`, [key, value]);
    }
  }
}
