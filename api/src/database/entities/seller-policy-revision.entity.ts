import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type PolicyRevisionStatus = 'pending' | 'approved' | 'rejected';

/**
 * A store's returns / shipping policy as the seller proposed it. A seller's change never touches the live text on the
 * store (`sellers.returnsPolicy` / `shippingPolicy`): it lands here as `pending`, and KOMORIKO admin approves it (the text
 * is copied into the live fields and translated like any live write) or rejects it with a note. One pending revision per
 * store at a time: a newer proposal replaces the older pending one.
 *
 * Each of the four text columns is `null` when that field is NOT part of the change (the live text stays), '' when the
 * seller cleared it, and the text otherwise. `*Fr` is the text the seller wrote in French for that field (policies are
 * authored in either language; the other language is a translation row on the store, as before).
 * Stores whose policy existed before this table was added are grandfathered: one `approved` revision per such store
 * (decidedBy 'system'), so the live text always has an approved revision behind it.
 */
@Entity('seller_policy_revisions')
@Index('IDX_policy_revisions_seller', ['sellerId', 'createdAt'])
@Index('IDX_policy_revisions_status', ['status', 'createdAt'])
export class SellerPolicyRevision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  sellerId: string;

  @Column({ type: 'text', nullable: true })
  returnsPolicy: string | null;

  @Column({ type: 'text', nullable: true })
  shippingPolicy: string | null;

  @Column({ type: 'text', nullable: true })
  returnsPolicyFr: string | null;

  @Column({ type: 'text', nullable: true })
  shippingPolicyFr: string | null;

  @Column({ type: 'varchar', length: 12, default: 'pending' })
  status: PolicyRevisionStatus;

  /** The admin's note: the reason of a rejection (required), an optional word with an approval. */
  @Column({ type: 'text', nullable: true })
  note: string | null;

  /** Who proposed it: the seller account, or the admin who edited and published it. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  proposedBy: string | null;

  /** The admin who approved / rejected it (their account id), or `system` for a grandfathered row. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  decidedBy: string | null;

  @Column({ type: 'datetime', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
