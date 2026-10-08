import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type VerificationKind = 'email' | 'phone' | 'reset';

/**
 * A single-use secret proving control of an email/phone or authorising a
 * password reset. Only the SHA-256 hash is stored — a database leak never
 * reveals a usable token or code.
 */
@Entity('verification_tokens')
export class VerificationToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  userId: string;

  @Column({ type: 'varchar', length: 10 })
  kind: VerificationKind;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @Column({ type: 'datetime', nullable: true })
  usedAt: Date | null;

  /** Wrong-code attempts so far (OTP brute-force limit). */
  @Column({ type: 'int', default: 0 })
  attempts: number;

  @CreateDateColumn()
  createdAt: Date;
}
