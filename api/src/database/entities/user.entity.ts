import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptedColumn } from '../../common/crypto/field-crypto';

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

  /** Encrypted at rest — JSON blob of the default address. */
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  address: string | null;

  @Column({ type: 'varchar', length: 4, default: 'en' })
  locale: 'en' | 'fr';

  /** Wallet store-credit balance in USD. */
  @Column({ type: 'float', default: 0 })
  walletBalance: number;

  /** Rider/warehouse availability toggle. */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
