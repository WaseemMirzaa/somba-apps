import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * One refresh token that was handed out (audit A-09, rotation with reuse detection). The token itself is never stored:
 * the row is keyed by the token's `jti` claim, which only a valid signature can carry.
 *
 * - A sign-in starts a new `familyId`; every refresh of that token stays in the same family.
 * - Using a token marks it `usedAt` and points `replacedById` at the token issued in its place. Inside a short grace
 *   window the same token is still accepted and answered with that same successor (a page reload, two tabs, a retry
 *   after a lost response). After the window, a second use is a reuse: every session of the account is revoked.
 * - `revokedAt` is set when the account's sessions end (sign out everywhere, password reset or change, 2FA change, a
 *   detected reuse). The account's `tokenVersion` bump revokes them too; the column keeps the record readable.
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Index('IDX_refresh_tokens_user')
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Index('IDX_refresh_tokens_family')
  @Column({ type: 'varchar', length: 36 })
  familyId: string;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @Column({ type: 'datetime', nullable: true })
  usedAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  replacedById: string | null;

  @Column({ type: 'datetime', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
