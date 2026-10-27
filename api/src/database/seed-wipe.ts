import type { DataSource } from 'typeorm';
import {
  Address,
  Campaign,
  Category,
  CmsBlock,
  DeliveryTask,
  Exchange,
  Hub,
  HubCoverage,
  HubLane,
  Notification,
  Order,
  OrderItem,
  Payment,
  PaymentRefund,
  Product,
  Promo,
  Replacement,
  Review,
  Seller,
  Setting,
  TransferRun,
  Translation,
  TranslationJob,
  User,
  WalletTransaction,
  WarehouseBatch,
  WarehouseException,
} from './entities';

/**
 * What a re-seed clears, in the order it clears it (children before the rows they point at: the foreign keys are
 * `order_items -> orders` and `products -> categories`; everything else refers by plain id).
 *
 * The warehouse side clears with the hubs and tasks it refers to, or a reseeded demo shows the old rows:
 *  - `transfer_runs` (and with it the `TR-nnnn` reference counter, which counts the rows that exist) and `warehouse_batches`
 *    (both list `delivery_tasks`) go before the tasks;
 *  - `hub_lanes` (warehouse-to-warehouse links by hub id: the lanes page would list raw ids) and `hub_coverage` go before the hubs.
 * The refund ledger (`payment_refunds`) goes with the payments it records: a re-seed must not leave refunds of orders that
 * no longer exist (the finance Refunds figure counts them).
 * The DRC geography (`geo_areas`) is reference data: it stays.
 */
export const SEED_WIPE_ORDER = [
  OrderItem,
  TransferRun,
  WarehouseBatch,
  DeliveryTask,
  PaymentRefund,
  Payment,
  Order,
  Address,
  Notification,
  WalletTransaction,
  Product,
  Seller,
  User,
  Category,
  HubLane,
  HubCoverage,
  Hub,
  Promo,
  CmsBlock,
  Setting,
  Review,
  Translation,
  TranslationJob,
  Campaign,
  Replacement,
  Exchange,
  WarehouseException,
] as const;

/** Empty every table the seed fills, in {@link SEED_WIPE_ORDER}. Query-builder deletes avoid the "empty criteria" guard `repo.delete({})` trips on. */
export async function wipeSeededData(ds: DataSource): Promise<void> {
  for (const entity of SEED_WIPE_ORDER) await ds.getRepository(entity).createQueryBuilder().delete().execute();
}
