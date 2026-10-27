import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptedColumn } from '../../common/crypto/field-crypto';
import { phoneHash } from '../../common/phone/phone-hash';

export type UserRole =
  | 'customer'
  | 'seller'
  | 'admin'
  | 'admin_operations'
  | 'admin_finance'
  | 'admin_support'
  | 'admin_marketing'
  | 'admin_moderation'
  | 'warehouse_staff'
  | 'rider';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Deterministic lowercase hash of the email, used for uniqueness + login
   * lookups without needing to decrypt every row. The human-readable email is
   * stored encrypted in {@link email}.
   */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  emailHash: string;

  /** Encrypted at rest (AES-256-GCM). */
  @Column({ type: 'text', transformer: encryptedColumn })
  email: string;

  @Column({ type: 'varchar' })
  passwordHash: string;

  @Column({ type: 'varchar', length: 40, default: 'customer' })
  role: UserRole;

  @Column({ type: 'varchar' })
  name: string;

  /** Encrypted at rest. */
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  phone: string | null;

  /** Lookup key for phone-code login (see common/phone/phone-hash.ts); kept in sync with `phone` automatically. */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  phoneHash: string | null;

  @BeforeInsert()
  @BeforeUpdate()
  syncPhoneHash() {
    this.phoneHash = phoneHash(this.phone);
  }

  /** Encrypted at rest — JSON blob of the default address. */
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  address: string | null;

  @Column({ type: 'varchar', length: 4, default: 'en' })
  locale: 'en' | 'fr';

  @Column({ type: 'boolean', default: false })
  emailVerified: boolean;

  @Column({ type: 'boolean', default: false })
  phoneVerified: boolean;

  /** Public URL of the profile picture (from POST /api/v1/uploads). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  avatar: string | null;

  /** JSON: { push, email, sms, personalize, market } — see UsersService.prefs. */
  @Column({ type: 'text', nullable: true })
  prefs: string | null;

  /** Wallet store-credit balance in USD. */
  @Column({ type: 'float', default: 0 })
  walletBalance: number;

  /**
   * Account switched on by an admin. Off: no sign-in for customers, sellers, riders and warehouse staff
   * (`customers:setActive` / `staff:setActive`), and an inactive rider is never offered or counted by the routing.
   */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  /** Home warehouse of a rider or warehouse staff member (null = not tied to one; sees every warehouse). */
  @Index()
  @Column({ type: 'varchar', nullable: true })
  hubId: string | null;

  /** @deprecated Zones are gone; kept so old rows survive. Never read or written. */
  @Column({ type: 'text', nullable: true })
  preferredZones: string | null;

  /** Warehouse staff tier: operator (scan in/out), supervisor (+ assign riders), manager (+ hub settings and staff). */
  @Column({ type: 'varchar', length: 12, nullable: true })
  warehouseTier: 'operator' | 'supervisor' | 'manager' | null;

  // ── Two-factor authentication (TOTP, RFC 6238) ───────────────────────────
  /** Base32 shared secret (encrypted at rest). Set by `auth:2fa:setup`, live once `twofaEnabled`. */
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  twofaSecret: string | null;

  @Column({ type: 'boolean', default: false })
  twofaEnabled: boolean;

  /** JSON array (string) of sha256 hashes of the unused recovery codes. */
  @Column({ type: 'text', nullable: true })
  twofaRecovery: string | null;

  /** The last accepted 30-second TOTP step: a code can be used once (replay protection). */
  @Column({ type: 'int', default: 0 })
  twofaLastStep: number;

  /**
   * Bumped to invalidate all previously issued tokens ("log out everywhere").
   * Access/refresh tokens carry the version they were minted at; a mismatch is
   * rejected on refresh and on socket connect.
   */
  @Column({ type: 'int', default: 0 })
  tokenVersion: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
