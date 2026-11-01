import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
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

  /** Where riders collect this seller's parcels (encrypted at rest). */
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  pickupAddress: string | null;

  /** Map pin of the pickup location (WGS84). Routing derives the origin warehouse from it. */
  @Column({ type: 'double', nullable: true })
  pickupLat: number | null;

  @Column({ type: 'double', nullable: true })
  pickupLng: number | null;

  /** The warehouse nearest to the pickup pin that has riders (computed whenever the pin changes). */
  @Column({ type: 'varchar', nullable: true })
  originHubId: string | null;

  /** The delivery area of the pickup address (most specific). Decides `originHubId`; the store sells only while it is served. */
  @Index('IDX_sellers_pickupAreaId')
  @Column({ type: 'varchar', length: 36, nullable: true })
  pickupAreaId: string | null;

  /** Public storefront branding: logo + banner (URLs under /uploads) and a short description. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  logoUrl: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  bannerUrl: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Language the store description was written in. */
  @Column({ type: 'varchar', length: 5, default: 'en' })
  sourceLang: string;

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

  /** A product at or below this many units triggers a low-stock notice (once per crossing). */
  @Column({ type: 'int', default: 10 })
  lowStockThreshold: number;

  // ── Seller platform (storefront, goals, reputation, payout account) ─────────
  /** Vacation mode: while in the future the store takes no NEW orders (null = open). */
  @Column({ type: 'datetime', nullable: true })
  vacationUntil: Date | null;

  /** Days the seller needs to pack and hand over a parcel; added to every product's delivery estimate. */
  @Column({ type: 'int', default: 0 })
  handlingDays: number;

  /** Returns / shipping policy text as the seller wrote it, in `sourceLang` (the other language is a translation row). */
  @Column({ type: 'text', nullable: true })
  returnsPolicy: string | null;

  @Column({ type: 'text', nullable: true })
  shippingPolicy: string | null;

  /** JSON: the seller's targets { revenueUsd, orders, rating } (replaces the browser-storage copy). */
  @Column({ type: 'text', nullable: true })
  goals: string | null;

  /** Reviews counted in `rating` (recomputed on a schedule from visible reviews of the store's products). */
  @Column({ type: 'int', default: 0 })
  ratingCount: number;

  /** Share (0..1) of settled order lines the seller fulfilled rather than cancelled; null = not enough data. */
  @Column({ type: 'float', nullable: true })
  fulfilmentRate: number | null;

  @Column({ type: 'datetime', nullable: true })
  scoreUpdatedAt: Date | null;

  /** Where the seller wants money sent ('bank' | 'mobile_money'); only the owner changes it. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  payoutMethod: string | null;

  /** The payout destination (IBAN / mobile-money number), encrypted at rest. */
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  payoutAccount: string | null;

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
export type SellerView = Omit<Seller, 'documentUrls' | 'suspendedListingIds' | 'payoutAccount'> & {
  documentUrls: string[];
  /** The payout destination, masked ("FR •••• 1234"): the full account is only ever shown to the owner on the payout-account screen. */
  payoutAccountMasked: string | null;
};

export function sellerView(seller: Seller): SellerView {
  const { suspendedListingIds: _s, documentUrls, payoutAccount, ...rest } = seller;
  void _s;
  const a = String(payoutAccount ?? '').trim();
  return { ...rest, documentUrls: parseJsonList(documentUrls), payoutAccountMasked: a ? (a.length <= 6 ? '••••' : `${a.slice(0, 2)} •••• ${a.slice(-4)}`) : null };
}
