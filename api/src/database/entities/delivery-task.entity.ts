import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptedColumn } from '../../common/crypto/field-crypto';

export type DeliveryStatus =
  | 'unassigned'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'failed';

/**
 * Which leg of the journey a task is. Order legs: seller -> origin warehouse (`pickup`), origin -> destination
 * warehouse (`transfer`, only when they differ), destination warehouse -> customer (`delivery`). Return legs run the
 * other way (`return_pickup` customer -> destination warehouse, `return_transfer`, `return_to_seller`).
 * `replacement_delivery` brings a replacement / exchange unit to the customer.
 */
export type DeliveryKind =
  | 'pickup'
  | 'transfer'
  | 'delivery'
  | 'return_pickup'
  | 'return_transfer'
  | 'return_to_seller'
  | 'replacement_delivery';

export const DELIVERY_KINDS: readonly DeliveryKind[] = [
  'pickup',
  'transfer',
  'delivery',
  'return_pickup',
  'return_transfer',
  'return_to_seller',
  'replacement_delivery',
];

@Index('IDX_delivery_tasks_status', ['status'])
@Index('IDX_delivery_tasks_toHubId', ['toHubId'])
@Index('IDX_delivery_tasks_fromHubId', ['fromHubId'])
@Index('IDX_delivery_tasks_parentTaskId', ['parentTaskId'])
@Entity('delivery_tasks')
export class DeliveryTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar' })
  orderId: string;

  @Column({ type: 'varchar' })
  orderReference: string;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  riderId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'unassigned' })
  status: DeliveryStatus;

  /** Encrypted at rest — delivery address text. */
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  address: string | null;

  /** @deprecated Zones are gone; history only. */
  @Column({ type: 'varchar', nullable: true })
  zoneId: string | null;

  /** What leg this is. Tasks created before routing existed are `delivery`. */
  @Column({ type: 'varchar', length: 24, default: 'delivery' })
  kind: DeliveryKind;

  /** Where the parcel is taken from when that is a warehouse (null when it is collected from a seller or the customer). */
  @Column({ type: 'varchar', nullable: true })
  fromHubId: string | null;

  /** Where the parcel is taken to when that is a warehouse (null when it goes to the customer or a seller). */
  @Column({ type: 'varchar', nullable: true })
  toHubId: string | null;

  /**
   * Where the chain of transfer hops ends (a `transfer` goes to the next warehouse, `toHubId`; `finalHubId` is the last).
   * Null = `toHubId` (a single hop, and every task from before multi-warehouse routes).
   */
  @Column({ type: 'varchar', length: 36, nullable: true })
  finalHubId: string | null;

  /** Which hop of the chain this transfer is (1-based) and how many there are in total, as planned when it was created. */
  @Column({ type: 'int', nullable: true })
  hop: number | null;

  @Column({ type: 'int', nullable: true })
  hops: number | null;

  /** The transfer run (manifest) this parcel travels in, if any. */
  @Index('IDX_delivery_tasks_runId')
  @Column({ type: 'varchar', length: 36, nullable: true })
  runId: string | null;

  /** The seller whose parcel this is (pickup, transfer and return legs). */
  @Column({ type: 'varchar', nullable: true })
  sellerId: string | null;

  /** The task this one follows (pickup -> transfer, return_pickup -> return_transfer, ...). */
  @Column({ type: 'varchar', nullable: true })
  parentTaskId: string | null;

  /** After-sale case the task belongs to (return / dispute / replacement / exchange legs). */
  @Column({ type: 'varchar', nullable: true })
  disputeId: string | null;

  @Column({ type: 'varchar', nullable: true })
  replacementId: string | null;

  @Column({ type: 'varchar', nullable: true })
  exchangeId: string | null;

  /** JSON list of the items the task carries (return and replacement legs): [{ productId, name, qty, sellerId }]. */
  @Column({ type: 'text', nullable: true })
  itemsJson: string | null;

  /** The warehouse that manages the task: its staff assign the rider and its riders run it (null = legacy / any). */
  @Index()
  @Column({ type: 'varchar', nullable: true })
  hubId: string | null;

  /** COD amount to collect (USD); 0 for prepaid. */
  @Column({ type: 'float', default: 0 })
  codAmountUsd: number;

  /** Live rider position, updated over the socket. */
  @Column({ type: 'float', nullable: true })
  lat: number | null;

  @Column({ type: 'float', nullable: true })
  lng: number | null;

  /** Which attempt this is (1 = first); a failed task is followed by a new one until the limit. */
  @Column({ type: 'int', default: 1 })
  attempts: number;

  /** Why the rider could not deliver (set when status = failed). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  failureReason: string | null;

  /** Where the rider collects the parcel (seller / hub), encrypted at rest. */
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  pickupAddress: string | null;

  /** 4-digit code the customer gives the rider on handover (never sent to staff or riders). */
  @Column({ type: 'text', nullable: true, select: false, transformer: encryptedColumn })
  proofCode: string | null;

  /** The seller marked the parcel ready for pickup. */
  @Column({ type: 'datetime', nullable: true })
  readyAt: Date | null;

  /** The hub scanned the parcel in. */
  @Column({ type: 'datetime', nullable: true })
  receivedAt: Date | null;

  /** The rider collected the parcel (status picked_up). */
  @Column({ type: 'datetime', nullable: true })
  pickedUpAt: Date | null;

  /** The parcel was handed over to the customer (status delivered). */
  @Column({ type: 'datetime', nullable: true })
  deliveredAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
