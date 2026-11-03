import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';

/**
 * Fraud rules beyond cash on delivery (R2-B).
 *
 * `fraud_alerts` gets the account the alert is about (`customerId`), why it was raised in English and French
 * (`reason`, `reasonFr`) and `dedupeKey` (one alert per rule per customer per day, enforced by a unique index).
 * `fraud_signals` holds the facts the rules count (address changes while an order was on its way, devices an account used).
 * The default thresholds and `requireStaffTwoFactor` (off) are written as platform settings when they are missing.
 * Written with the QueryRunner API, so it runs on MySQL (production) and SQLite (tests). Reversible.
 *
 * Data: alerts raised before this keep null `customerId`, `reason` and `dedupeKey`; nothing is invented for them.
 */
const DEFAULT_SETTINGS: Record<string, string> = {
  requireStaffTwoFactor: 'false',
  fraudFailedPayments24h: '5',
  fraudNewAccountOrders24h: '3',
  fraudNewAccountDays: '7',
  fraudSharedAccounts: '3',
  fraudReturnRatePct: '50',
  fraudReturnMinOrders: '3',
  fraudAddressChanges24h: '3',
};

export class FraudRulesStaff2fa1793210000001 implements MigrationInterface {
  name = 'FraudRulesStaff2fa1793210000001';

  public async up(q: QueryRunner): Promise<void> {
    const sqlite = q.connection.options.type === 'better-sqlite3' || q.connection.options.type === 'sqlite';
    const add = async (name: string, spec: Partial<TableColumn>) => {
      if (!(await q.hasColumn('fraud_alerts', name))) await q.addColumn('fraud_alerts', new TableColumn({ name, ...spec } as TableColumn));
    };
    await add('customerId', { type: 'varchar', length: '36', isNullable: true });
    await add('reason', { type: 'text', isNullable: true });
    await add('reasonFr', { type: 'text', isNullable: true });
    await add('dedupeKey', { type: 'varchar', length: '96', isNullable: true });
    await q.createIndex('fraud_alerts', new TableIndex({ name: 'IDX_fraud_alerts_customerId', columnNames: ['customerId'] }));
    await q.createIndex('fraud_alerts', new TableIndex({ name: 'IDX_fraud_alerts_dedupeKey', columnNames: ['dedupeKey'], isUnique: true }));

    await q.createTable(
      new Table({
        name: 'fraud_signals',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'userId', type: 'varchar', length: '36', isNullable: false },
          { name: 'kind', type: 'varchar', length: '16', isNullable: false },
          { name: 'key', type: 'varchar', length: '64', isNullable: false },
          sqlite
            ? { name: 'createdAt', type: 'datetime', isNullable: false, default: "datetime('now')" }
            : { name: 'createdAt', type: 'datetime', precision: 6, isNullable: false, default: 'CURRENT_TIMESTAMP(6)' },
        ],
      }),
      true,
    );
    await q.createIndex('fraud_signals', new TableIndex({ name: 'IDX_fraud_signals_user_kind_created', columnNames: ['userId', 'kind', 'createdAt'] }));
    await q.createIndex('fraud_signals', new TableIndex({ name: 'IDX_fraud_signals_kind_key', columnNames: ['kind', 'key'] }));

    if (await q.hasTable('settings')) {
      await q.manager
        .createQueryBuilder()
        .insert()
        .into('settings', ['key', 'value'])
        .values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })))
        .orIgnore()
        .execute();
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if (await q.hasTable('settings')) {
      for (const key of Object.keys(DEFAULT_SETTINGS)) await q.manager.createQueryBuilder().delete().from('settings').where('key = :key', { key }).execute();
    }
    await q.dropTable('fraud_signals', true, true, true);
    await q.dropIndex('fraud_alerts', 'IDX_fraud_alerts_dedupeKey');
    await q.dropIndex('fraud_alerts', 'IDX_fraud_alerts_customerId');
    for (const name of ['dedupeKey', 'reasonFr', 'reason', 'customerId']) {
      if (await q.hasColumn('fraud_alerts', name)) await q.dropColumn('fraud_alerts', name);
    }
  }
}
