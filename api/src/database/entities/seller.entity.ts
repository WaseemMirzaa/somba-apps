import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { encryptedColumn } from '../../common/crypto/field-crypto';

export type SellerStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

@Entity('sellers')
export class Seller {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  /** Owning user account (nullable for seed-only demo stores). */
  @Column({ type: 'varchar', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: SellerStatus;

  @Column({ type: 'varchar', length: 20, default: 'bronze' })
  badge: 'gold' | 'silver' | 'bronze' | 'somba_assured';

  @Column({ type: 'float', default: 0 })
  rating: number;

  @Column({ type: 'int', default: 0 })
  productCount: number;

  /** Where riders collect this seller's parcels (encrypted at rest). */
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  pickupAddress: string | null;

  /** Public storefront branding: logo + banner (URLs under /uploads) and a short description. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  logoUrl: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  bannerUrl: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Subscription plan id (see the `sellerPlans` setting). 'free' = no paid plan. */
  @Column({ type: 'varchar', length: 30, default: 'free' })
  plan: string;

  /** When the paid plan lapses (null for free / never subscribed). */
  @Column({ type: 'datetime', nullable: true })
  planExpiresAt: Date | null;

  // ── KYC (all nullable: stores opened before KYC existed stay valid) ──────
  /** Legal / registered name of the business or person behind the store. */
  @Column({ type: 'varchar', length: 150, nullable: true })
  legalName: string | null;

  /** Contact phone for the application (encrypted at rest). */
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  phone: string | null;

  /** National ID / passport number (encrypted at rest). */
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  idNumber: string | null;

  /** Trade-register number (RCCM). */
  @Column({ type: 'varchar', length: 60, nullable: true })
  rccm: string | null;

  /** Tax identification number. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  taxNumber: string | null;

  /** JSON array (string) of platform upload URLs, max 5. Use `sellerView()` to read it as string[]. */
  @Column({ type: 'text', nullable: true })
  documentUrls: string | null;

  @Column({ type: 'datetime', nullable: true })
  termsAcceptedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  kycSubmittedAt: Date | null;

  /** Why the last moderation decision (reject / suspend / approve note) was taken; shown to the seller. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  statusReason: string | null;

  @Column({ type: 'datetime', nullable: true })
  statusChangedAt: Date | null;

  /** JSON array (string) of product ids a suspension / rejection moved from live to draft, restored on reinstatement. */
  @Column({ type: 'text', nullable: true })
  suspendedListingIds: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

/** Parse a JSON string-array column; anything malformed reads as []. */
export function parseJsonList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * The seller as owner / admins see it: `documentUrls` parsed to string[] and the internal
 * `suspendedListingIds` bookkeeping dropped. Never use for public (storefront) output.
 */
export type SellerView = Omit<Seller, 'documentUrls' | 'suspendedListingIds'> & { documentUrls: string[] };

export function sellerView(seller: Seller): SellerView {
  const { suspendedListingIds: _s, documentUrls, ...rest } = seller;
  void _s;
  return { ...rest, documentUrls: parseJsonList(documentUrls) };
}
