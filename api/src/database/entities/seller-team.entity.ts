import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { encryptedColumn } from '../../common/crypto/field-crypto';

/**
 * What a team member may do for the store. The owner is the store's `userId` (always allowed; listed in
 * `team:list` but never stored here). See `sellers/seller-context.ts` for the permission matrix.
 */
export type TeamRole = 'owner' | 'manager' | 'catalog' | 'orders' | 'finance' | 'support';
export const TEAM_STAFF_ROLES = ['manager', 'catalog', 'orders', 'finance', 'support'] as const;
export type TeamStatus = 'invited' | 'active' | 'removed';

/** A staff seat of a store: invited by e-mail, active once the invitee accepts, removed by the owner (or when they leave). */
@Index('IDX_seller_team_unique', ['sellerId', 'emailHash'], { unique: true })
@Entity('seller_team')
export class SellerTeamMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_seller_team_seller')
  @Column({ type: 'varchar', length: 36 })
  sellerId: string;

  /** The invitee's account once they accepted (null while the invitation is open). */
  @Index('IDX_seller_team_user')
  @Column({ type: 'varchar', length: 36, nullable: true })
  userId: string | null;

  /** Lookup key of the invited address (same hash as `users.emailHash`). */
  @Column({ type: 'varchar', length: 64 })
  emailHash: string;

  /** The invited address, encrypted at rest. */
  @Column({ type: 'text', transformer: encryptedColumn })
  email: string;

  /** Display name (the one given at invite time, replaced by the account name on accept). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 16, default: 'orders' })
  role: TeamRole;

  @Column({ type: 'varchar', length: 10, default: 'invited' })
  status: TeamStatus;

  /** sha256 of the single-use invitation token (the token itself only travels by e-mail). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  inviteTokenHash: string | null;

  @Column({ type: 'datetime', nullable: true })
  inviteExpiresAt: Date | null;

  @Column({ type: 'varchar', length: 36 })
  invitedBy: string;

  @Column({ type: 'datetime', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  removedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
