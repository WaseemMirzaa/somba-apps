import { existsSync, unlinkSync } from 'fs';
import { basename, join } from 'path';
import type { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';
import {
  Address,
  AgedAlert,
  AuditLog,
  Campaign,
  CartLine,
  CmsBlock,
  Conversation,
  ConversationMessage,
  DeliveryTask,
  DeviceToken,
  Dispute,
  DisputeItem,
  DisputeMessage,
  Exchange,
  FlashSale,
  FraudAlert,
  FraudSignal,
  Hub,
  HubCoverage,
  HubLane,
  HubOpsSettings,
  Notification,
  NotificationRead,
  Order,
  OrderItem,
  Parcel,
  ParcelScan,
  Payment,
  PaymentRefund,
  Payout,
  PayoutStatementLine,
  PrivateFile,
  RefreshToken,
  Product,
  ProductQuestion,
  ProductView,
  Promo,
  Replacement,
  Review,
  ReviewHelpful,
  ReviewReport,
  Seller,
  Setting,
  SellerPolicyRevision,
  CaseSellerMessage,
  SellerTeamMember,
  StockMovement,
  StoreFollow,
  SupportMessage,
  SupportTicket,
  TaxDocument,
  TransferRun,
  Translation,
  TranslationJob,
  User,
  VerificationToken,
  WalletTransaction,
  WarehouseBatch,
  WarehouseBin,
  WarehouseException,
  WarehouseLedger,
  WarehouseStock,
  WishlistItem,
} from '../entities';
import { DEMO_HUB_NAME, DEMO_KEY, isDemoEmail } from './demo-common';

/** Promo codes the demo adds besides the ones tied to a demo store. */
export const DEMO_PROMO_CODES = ['DEMO10', 'DEMOWELCOME', 'DEMOPAUSED'];
/** Warehouse bins the demo adds inside the real warehouse. */
export const DEMO_BIN_PREFIX = 'DEMO-';
/** Name given to audit lines written by the seed script itself. */
export const DEMO_AUDIT_ACTOR = 'Demo seed';

const CHUNK = 400;
const UPLOAD_URL =
  /\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|webp))/i;

export interface RemovalPlan {
  /** Rows that will go, per table (what is printed before anything is deleted). */
  counts: [string, number][];
  /** Why the removal must not run yet (real data points at demo data). Empty = safe. */
  blockers: string[];
  /** Notes about real rows the removal adjusts or cannot restore. */
  notes: string[];
  userIds: string[];
  files: { public: string[]; private: string[] };
}

export interface RemovalResult extends RemovalPlan {
  deleted: [string, number][];
  filesRemoved: { public: number; private: number };
  /** Real stores whose collection warehouse was the demo one and are now to be recomputed (their origin is cleared). */
  sellersReset: number;
}

interface Ids {
  users: string[];
  userNames: string[];
  batches: string[];
  blockedBatches: string[];
  sellers: string[];
  /** Ids a store's rows may carry: the store id and, on older data, the owner's user id. */
  owners: string[];
  products: string[];
  orders: string[];
  items: string[];
  tasks: string[];
  /** Parcel labels of demo orders and demo returns (their scans go with them). */
  parcels: string[];
  disputes: string[];
  exchanges: string[];
  replacements: string[];
  hubs: string[];
  bins: string[];
  convs: string[];
  tickets: string[];
  /** Chat and support messages: their translations are keyed by the message id. */
  messages: string[];
  reviews: string[];
  questions: string[];
  campaigns: string[];
  flash: string[];
  promos: string[];
  cms: string[];
  payouts: string[];
  payments: string[];
  notifications: string[];
}

type Term = [string, string[]];

/** `(a IN (...) OR b IN (...))` over a list of [column, ids] terms, chunked so SQLite's variable limit is never hit. */
function where(
  terms: Term[],
): { sql: string; params: Record<string, string[]> } | null {
  const parts: string[] = [];
  const params: Record<string, string[]> = {};
  let n = 0;
  for (const [col, ids] of terms) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const key = `p${n++}`;
      params[key] = ids.slice(i, i + CHUNK);
      parts.push(`${col} IN (:...${key})`);
    }
  }
  return parts.length ? { sql: `(${parts.join(' OR ')})`, params } : null;
}

const uniq = (a: (string | null | undefined)[]) => [
  ...new Set(a.filter((x): x is string => !!x)),
];

/**
 * Every id the demo owns, found by following the demo users (and the demo warehouse). Nothing is matched by date. The
 * only match by name is on `audit_logs.actor` and `warehouse_exceptions.raisedBy`, which store a display name and no id;
 * a name that a real (non-demo) user also holds is left out, so a real "Grace Mbuyi" keeps her audit lines.
 */
async function collect(ds: DataSource): Promise<Ids> {
  const ids = {} as Ids;
  const allUsers = await ds
    .getRepository(User)
    .find({ select: { id: true, email: true, name: true } });
  const users = allUsers.filter((u) => isDemoEmail(u.email));
  ids.users = users.map((u) => u.id);
  const realNames = new Set(
    allUsers.filter((u) => !isDemoEmail(u.email)).map((u) => u.name),
  );
  ids.userNames = uniq(users.map((u) => u.name)).filter(
    (n) => !realNames.has(n),
  );
  const col = async <T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    field: string,
    terms: Term[],
  ): Promise<string[]> => {
    const w = where(terms);
    if (!w) return [];
    const rows = await ds
      .getRepository(entity)
      .createQueryBuilder('x')
      .select(`x.${field}`, 'v')
      .where(w.sql.replace(/\b([a-zA-Z]+) IN/g, 'x.$1 IN'), w.params)
      .getRawMany<{ v: string }>();
    return uniq(rows.map((r) => r.v));
  };
  ids.sellers = await col(Seller, 'id', [['userId', ids.users]]);
  ids.owners = uniq([...ids.sellers, ...ids.users]);
  ids.products = await col(Product, 'id', [['sellerId', ids.owners]]);
  ids.orders = await col(Order, 'id', [['customerId', ids.users]]);
  ids.items = await col(OrderItem, 'id', [['orderId', ids.orders]]);
  ids.disputes = await col(Dispute, 'id', [
    ['orderId', ids.orders],
    ['customerId', ids.users],
    ['sellerId', ids.owners],
  ]);
  ids.exchanges = await col(Exchange, 'id', [
    ['orderId', ids.orders],
    ['customerId', ids.users],
    ['sellerId', ids.owners],
  ]);
  ids.replacements = await col(Replacement, 'id', [
    ['orderId', ids.orders],
    ['customerId', ids.users],
    ['sellerId', ids.owners],
  ]);
  const demoHubs = await ds
    .getRepository(Hub)
    .find({ where: { name: DEMO_HUB_NAME }, select: { id: true } });
  ids.hubs = demoHubs.map((h) => h.id);
  ids.tasks = await col(DeliveryTask, 'id', [
    ['orderId', ids.orders],
    ['disputeId', ids.disputes],
    ['exchangeId', ids.exchanges],
    ['replacementId', ids.replacements],
  ]);
  ids.parcels = await col(Parcel, 'id', [
    ['orderId', ids.orders],
    ['returnId', ids.disputes],
  ]);
  // Batches of the demo warehouse or of a demo rider: the demo's only when every parcel in them is a demo parcel.
  const batchTerms = where([
    ['hubId', ids.hubs],
    ['riderId', ids.users],
  ]);
  ids.batches = [];
  ids.blockedBatches = [];
  if (batchTerms) {
    const demoTasks = new Set(ids.tasks);
    const rows = await ds
      .getRepository(WarehouseBatch)
      .createQueryBuilder('x')
      .where(
        batchTerms.sql.replace(/\b([a-zA-Z]+) IN/g, 'x.$1 IN'),
        batchTerms.params,
      )
      .getMany();
    for (const b of rows) {
      let list: unknown = [];
      try {
        list = JSON.parse(b.taskIds || '[]');
      } catch {
        /* unreadable: treated as empty */
      }
      const foreign =
        Array.isArray(list) &&
        list.some((t) => typeof t === 'string' && !demoTasks.has(t));
      (foreign ? ids.blockedBatches : ids.batches).push(b.id);
    }
  }
  // A bin is the demo's when it is in the demo warehouse or carries the demo prefix (the real warehouse holds demo bins too).
  ids.bins = uniq([
    ...(await col(WarehouseBin, 'id', [['hubId', ids.hubs]])),
    ...(
      await ds
        .getRepository(WarehouseBin)
        .createQueryBuilder('b')
        .select('b.id', 'v')
        .where('b.code LIKE :p', { p: `${DEMO_BIN_PREFIX}%` })
        .getRawMany<{ v: string }>()
    ).map((r) => r.v),
  ]);
  ids.convs = await col(Conversation, 'id', [
    ['buyerId', ids.users],
    ['sellerId', ids.sellers],
  ]);
  ids.tickets = await col(SupportTicket, 'id', [['userId', ids.users]]);
  ids.messages = uniq([
    ...(await col(ConversationMessage, 'id', [['conversationId', ids.convs]])),
    ...(await col(SupportMessage, 'id', [['ticketId', ids.tickets]])),
    // The customer <-> support messages of the demo's returns and disputes (their translations are keyed by the message id too).
    ...(await col(DisputeMessage, 'id', [['disputeId', ids.disputes]])),
    // The private seller <-> support threads of the demo's cases (their translations are keyed by the message id).
    ...(await col(CaseSellerMessage, 'id', [
      ['caseId', uniq([...ids.disputes, ...ids.exchanges, ...ids.replacements])],
      ['sellerId', ids.owners],
    ])),
  ]);
  ids.reviews = await col(Review, 'id', [
    ['productId', ids.products],
    ['userId', ids.users],
  ]);
  ids.questions = await col(ProductQuestion, 'id', [
    ['productId', ids.products],
    ['askerId', ids.users],
    ['sellerId', ids.owners],
  ]);
  ids.campaigns = await col(Campaign, 'id', [['sellerId', ids.owners]]);
  ids.flash = await col(FlashSale, 'id', [
    ['sellerId', ids.owners],
    ['productId', ids.products],
  ]);
  const promoRows = await ds
    .getRepository(Promo)
    .createQueryBuilder('p')
    .select('p.id', 'v')
    .where('p.code IN (:...codes)', { codes: DEMO_PROMO_CODES })
    .getRawMany<{ v: string }>();
  ids.promos = uniq([
    ...promoRows.map((r) => r.v),
    ...(await col(Promo, 'id', [['sellerId', ids.owners]])),
  ]);
  ids.cms = (
    await ds
      .getRepository(CmsBlock)
      .createQueryBuilder('c')
      .select('c.id', 'v')
      .where('c.key LIKE :p', { p: `${DEMO_KEY}%` })
      .getRawMany<{ v: string }>()
  ).map((r) => r.v);
  ids.payouts = await col(Payout, 'id', [['sellerId', ids.owners]]);
  ids.payments = await col(Payment, 'id', [
    ['orderId', ids.orders],
    ['userId', ids.users],
  ]);
  // The notices about all of the above (their translations are keyed by the notice id).
  ids.notifications = [];
  const noticeIds = entityIds(ids);
  ids.notifications = await col(Notification, 'id', [
    ['userId', ids.users],
    ['entityId', noticeIds],
  ]);
  return ids;
}

/** Every id a notice or an audit line may name (the entity it is about). */
const entityIds = (i: Ids) =>
  uniq([
    ...i.users,
    ...i.sellers,
    ...i.products,
    ...i.orders,
    ...i.items,
    ...i.tasks,
    ...i.disputes,
    ...i.exchanges,
    ...i.replacements,
    ...i.hubs,
    ...i.convs,
    ...i.tickets,
    ...i.messages,
    ...i.reviews,
    ...i.questions,
    ...i.campaigns,
    ...i.flash,
    ...i.promos,
    ...i.cms,
    ...i.payouts,
    ...i.payments,
    ...i.notifications,
  ]);

interface Step {
  label: string;
  entity: EntityTarget<ObjectLiteral>;
  terms: Term[];
}

/** The tables, children first. Each is matched ONLY through ids found by {@link collect}. */
function steps(i: Ids): Step[] {
  const all = entityIds(i);
  return [
    {
      label: 'notification_reads',
      entity: NotificationRead,
      terms: [['userId', i.users]],
    },
    {
      label: 'notifications',
      entity: Notification,
      terms: [
        ['userId', i.users],
        ['entityId', all],
      ],
    },
    {
      label: 'audit_logs',
      entity: AuditLog,
      terms: [
        ['entityId', all],
        ['actor', uniq([...i.userNames, DEMO_AUDIT_ACTOR])],
      ],
    },
    { label: 'translations', entity: Translation, terms: [['entityId', all]] },
    {
      label: 'translation_jobs',
      entity: TranslationJob,
      terms: [['entityId', all]],
    },
    {
      label: 'conversation_messages',
      entity: ConversationMessage,
      terms: [['conversationId', i.convs]],
    },
    { label: 'conversations', entity: Conversation, terms: [['id', i.convs]] },
    {
      label: 'support_messages',
      entity: SupportMessage,
      terms: [['ticketId', i.tickets]],
    },
    {
      label: 'support_tickets',
      entity: SupportTicket,
      terms: [['id', i.tickets]],
    },
    {
      label: 'review_helpful',
      entity: ReviewHelpful,
      terms: [
        ['reviewId', i.reviews],
        ['userId', i.users],
      ],
    },
    {
      label: 'review_reports',
      entity: ReviewReport,
      terms: [
        ['reviewId', i.reviews],
        ['reporterId', i.users],
      ],
    },
    { label: 'reviews', entity: Review, terms: [['id', i.reviews]] },
    {
      label: 'product_questions',
      entity: ProductQuestion,
      terms: [['id', i.questions]],
    },
    {
      label: 'product_views',
      entity: ProductView,
      terms: [['productId', i.products]],
    },
    {
      label: 'wishlist_items',
      entity: WishlistItem,
      terms: [
        ['userId', i.users],
        ['productId', i.products],
      ],
    },
    {
      label: 'cart_lines',
      entity: CartLine,
      terms: [
        ['userId', i.users],
        ['productId', i.products],
      ],
    },
    {
      label: 'store_follows',
      entity: StoreFollow,
      terms: [
        ['userId', i.users],
        ['sellerId', i.sellers],
      ],
    },
    { label: 'flash_sales', entity: FlashSale, terms: [['id', i.flash]] },
    { label: 'campaigns', entity: Campaign, terms: [['id', i.campaigns]] },
    { label: 'promos', entity: Promo, terms: [['id', i.promos]] },
    { label: 'cms_blocks', entity: CmsBlock, terms: [['id', i.cms]] },
    {
      label: 'case_seller_messages',
      entity: CaseSellerMessage,
      terms: [
        ['caseId', uniq([...i.disputes, ...i.exchanges, ...i.replacements])],
        ['sellerId', i.owners],
      ],
    },
    {
      label: 'dispute_messages',
      entity: DisputeMessage,
      terms: [['disputeId', i.disputes]],
    },
    {
      label: 'dispute_items',
      entity: DisputeItem,
      terms: [['disputeId', i.disputes]],
    },
    { label: 'exchanges', entity: Exchange, terms: [['id', i.exchanges]] },
    {
      label: 'replacements',
      entity: Replacement,
      terms: [['id', i.replacements]],
    },
    {
      label: 'payout_statement_lines',
      entity: PayoutStatementLine,
      terms: [
        ['payoutId', i.payouts],
        ['sellerId', i.owners],
      ],
    },
    { label: 'payouts', entity: Payout, terms: [['id', i.payouts]] },
    {
      label: 'tax_documents',
      entity: TaxDocument,
      terms: [['sellerId', i.owners]],
    },
    {
      label: 'payment_refunds',
      entity: PaymentRefund,
      terms: [
        ['paymentId', i.payments],
        ['orderId', i.orders],
        ['userId', i.users],
        ['disputeId', i.disputes],
      ],
    },
    { label: 'payments', entity: Payment, terms: [['id', i.payments]] },
    {
      label: 'wallet_transactions',
      entity: WalletTransaction,
      terms: [['userId', i.users]],
    },
    { label: 'disputes', entity: Dispute, terms: [['id', i.disputes]] },
    {
      label: 'aged_alerts',
      entity: AgedAlert,
      terms: [
        ['taskId', i.tasks],
        ['hubId', i.hubs],
      ],
    },
    {
      label: 'warehouse_exceptions',
      entity: WarehouseException,
      terms: [
        ['taskId', i.tasks],
        ['hubId', i.hubs],
        ['raisedBy', i.userNames],
      ],
    },
    {
      label: 'warehouse_batches',
      entity: WarehouseBatch,
      terms: [['id', i.batches]],
    },
    {
      label: 'parcel_scans',
      entity: ParcelScan,
      terms: [
        ['taskId', i.tasks],
        ['parcelId', i.parcels],
      ],
    },
    { label: 'parcels', entity: Parcel, terms: [['id', i.parcels]] },
    { label: 'delivery_tasks', entity: DeliveryTask, terms: [['id', i.tasks]] },
    {
      label: 'transfer_runs',
      entity: TransferRun,
      terms: [
        ['fromHubId', i.hubs],
        ['toHubId', i.hubs],
      ],
    },
    { label: 'order_items', entity: OrderItem, terms: [['orderId', i.orders]] },
    { label: 'orders', entity: Order, terms: [['id', i.orders]] },
    {
      label: 'fraud_alerts',
      entity: FraudAlert,
      terms: [
        ['customerId', i.users],
        ['orderId', i.orders],
      ],
    },
    {
      label: 'fraud_signals',
      entity: FraudSignal,
      terms: [['userId', i.users]],
    },
    {
      label: 'warehouse_ledger',
      entity: WarehouseLedger,
      terms: [
        ['hubId', i.hubs],
        ['productId', i.products],
        ['fromBinId', i.bins],
        ['toBinId', i.bins],
      ],
    },
    {
      label: 'warehouse_stock',
      entity: WarehouseStock,
      terms: [
        ['binId', i.bins],
        ['productId', i.products],
      ],
    },
    { label: 'warehouse_bins', entity: WarehouseBin, terms: [['id', i.bins]] },
    {
      label: 'stock_movements',
      entity: StockMovement,
      terms: [
        ['productId', i.products],
        ['sellerId', i.owners],
      ],
    },
    { label: 'products', entity: Product, terms: [['id', i.products]] },
    {
      label: 'seller_team',
      entity: SellerTeamMember,
      terms: [
        ['sellerId', i.sellers],
        ['userId', i.users],
      ],
    },
    {
      label: 'seller_policy_revisions',
      entity: SellerPolicyRevision,
      terms: [['sellerId', i.sellers]],
    },
    { label: 'sellers', entity: Seller, terms: [['id', i.sellers]] },
    {
      label: 'hub_lanes',
      entity: HubLane,
      terms: [
        ['fromHubId', i.hubs],
        ['toHubId', i.hubs],
      ],
    },
    { label: 'hub_coverage', entity: HubCoverage, terms: [['hubId', i.hubs]] },
    {
      label: 'hub_ops_settings',
      entity: HubOpsSettings,
      terms: [['hubId', i.hubs]],
    },
    { label: 'hubs', entity: Hub, terms: [['id', i.hubs]] },
    { label: 'addresses', entity: Address, terms: [['userId', i.users]] },
    {
      label: 'refresh_tokens',
      entity: RefreshToken,
      terms: [['userId', i.users]],
    },
    {
      label: 'device_tokens',
      entity: DeviceToken,
      terms: [['userId', i.users]],
    },
    {
      label: 'verification_tokens',
      entity: VerificationToken,
      terms: [['userId', i.users]],
    },
    {
      label: 'private_files',
      entity: PrivateFile,
      terms: [['ownerUserId', i.users]],
    },
    { label: 'users', entity: User, terms: [['id', i.users]] },
  ];
}

async function count(ds: DataSource, s: Step): Promise<number> {
  const w = where(s.terms);
  if (!w) return 0;
  return ds
    .getRepository(s.entity)
    .createQueryBuilder('x')
    .where(w.sql.replace(/\b([a-zA-Z]+) IN/g, 'x.$1 IN'), w.params)
    .getCount();
}

/** Anything real that points at demo data: removal must not run until it is dealt with. */
async function blockersOf(ds: DataSource, i: Ids): Promise<string[]> {
  const out: string[] = [];
  const demoOrders = new Set(i.orders);
  const itemTerms = where([
    ['productId', i.products],
    ['sellerId', i.owners],
  ]);
  if (itemTerms) {
    const rows = await ds
      .getRepository(OrderItem)
      .createQueryBuilder('x')
      .select('DISTINCT x.orderId', 'orderId')
      .where(
        itemTerms.sql.replace(/\b([a-zA-Z]+) IN/g, 'x.$1 IN'),
        itemTerms.params,
      )
      .getRawMany<{ orderId: string }>();
    const real = rows.map((r) => r.orderId).filter((o) => !demoOrders.has(o));
    if (real.length) {
      const refs = (
        await ds.getRepository(Order).find({
          where: real.slice(0, 20).map((id) => ({ id })),
          select: { reference: true },
        })
      ).map((o) => o.reference);
      out.push(
        `${real.length} real order(s) contain demo products (${refs.join(', ')}${real.length > 20 ? ', ...' : ''}). Finish or cancel them first, then run this again.`,
      );
    }
  }
  const taskTerms = where([
    ['hubId', i.hubs],
    ['fromHubId', i.hubs],
    ['toHubId', i.hubs],
    ['riderId', i.users],
  ]);
  if (taskTerms) {
    const rows = await ds
      .getRepository(DeliveryTask)
      .createQueryBuilder('x')
      .select('x.id', 'id')
      .addSelect('x.orderReference', 'ref')
      .where(
        taskTerms.sql.replace(/\b([a-zA-Z]+) IN/g, 'x.$1 IN'),
        taskTerms.params,
      )
      .getRawMany<{ id: string; ref: string }>();
    const demoTasks = new Set(i.tasks);
    const real = rows.filter((r) => !demoTasks.has(r.id));
    if (real.length)
      out.push(
        `${real.length} delivery task(s) of real orders use the demo warehouse or a demo rider (${uniq(
          real.map((r) => r.ref),
        )
          .slice(0, 10)
          .join(', ')}). Reassign or finish them first.`,
      );
  }
  if (i.blockedBatches.length)
    out.push(
      `${i.blockedBatches.length} warehouse batch(es) of the demo warehouse or a demo rider hold parcels of real orders. Finish or reassign them first.`,
    );
  const staffTerms = where([['hubId', i.hubs]]);
  if (staffTerms) {
    const staff = (
      await ds
        .getRepository(User)
        .createQueryBuilder('x')
        .where(
          staffTerms.sql.replace(/\b([a-zA-Z]+) IN/g, 'x.$1 IN'),
          staffTerms.params,
        )
        .getMany()
    ).filter((u) => !isDemoEmail(u.email));
    if (staff.length)
      out.push(
        `${staff.length} real staff member(s) or rider(s) belong to the demo warehouse (${staff
          .slice(0, 5)
          .map((u) => u.name)
          .join(', ')}). Move them to a real warehouse first (Admin > Staff).`,
      );
    const routed = await ds
      .getRepository(Order)
      .createQueryBuilder('x')
      .where(
        staffTerms.sql.replace(/\bhubId IN/g, 'x.destinationHubId IN'),
        staffTerms.params,
      )
      .getMany();
    const real = routed.filter((o) => !demoOrders.has(o.id));
    if (real.length)
      out.push(
        `${real.length} real order(s) are routed to the demo warehouse (${real
          .slice(0, 10)
          .map((o) => o.reference)
          .join(', ')}). Finish them first.`,
      );
  }
  return out;
}

/** Upload addresses (`/uploads/<uuid>.jpg`) the demo rows point at, beyond the fixed manifest pictures. */
async function referencedUploads(ds: DataSource, i: Ids): Promise<string[]> {
  const names: string[] = [];
  const add = (v: unknown) => {
    const list = Array.isArray(v) ? v : [v];
    for (const x of list) {
      const m = typeof x === 'string' ? UPLOAD_URL.exec(x) : null;
      if (m) names.push(m[1].toLowerCase());
    }
  };
  const take = async <T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    terms: Term[],
    pick: (row: T) => unknown[],
  ) => {
    const w = where(terms);
    if (!w) return;
    const rows = await ds
      .getRepository(entity)
      .createQueryBuilder('x')
      .where(w.sql.replace(/\b([a-zA-Z]+) IN/g, 'x.$1 IN'), w.params)
      .getMany();
    for (const r of rows) add(pick(r));
  };
  await take(Product, [['id', i.products]], (p) => [p.image, p.images]);
  await take(Seller, [['id', i.sellers]], (s) => [s.logoUrl, s.bannerUrl]);
  await take(User, [['id', i.users]], (u) => [u.avatar]);
  await take(Review, [['id', i.reviews]], (r) => [r.photos]);
  return uniq(names);
}

export async function planRemoval(
  ds: DataSource,
  manifestNames: string[] = [],
): Promise<RemovalPlan> {
  const ids = await collect(ds);
  const counts: [string, number][] = [];
  for (const s of steps(ids)) {
    const n = await count(ds, s);
    if (n) counts.push([s.label, n]);
  }
  const notes: string[] = [];
  // Real products that the demo's reviews sit on get their rating recomputed afterwards.
  const reviewed = await ratedElsewhere(ds, ids);
  if (reviewed.length)
    notes.push(
      `${reviewed.length} real product(s) had demo reviews: their rating and review count are recomputed.`,
    );
  const realOrdersOfDemoUsers = ids.orders.length
    ? (
        await ds
          .getRepository(OrderItem)
          .createQueryBuilder('x')
          .where('x.orderId IN (:...o)', { o: ids.orders.slice(0, CHUNK) })
          .getMany()
      ).filter(
        (it) =>
          !ids.products.includes(it.productId) &&
          !it.productId.startsWith('ext:'),
      )
    : [];
  if (realOrdersOfDemoUsers.length)
    notes.push(
      `${realOrdersOfDemoUsers.length} order line(s) of demo customers are for real products: their stock is not given back.`,
    );
  // Express delivery: the same, for the platform setting `--with-express` may have switched on.
  if (ids.orders.length) {
    const express = await ds
      .getRepository(Order)
      .createQueryBuilder('x')
      .where('x.id IN (:...o)', { o: ids.orders.slice(0, CHUNK) })
      .andWhere("x.deliveryMode = 'express'")
      .getCount();
    const on = await ds
      .getRepository(Setting)
      .findOne({ where: { key: 'expressDeliveryEnabled' } });
    if (express && on?.value === 'true')
      notes.push(
        'Express delivery is ON (setting expressDeliveryEnabled). The removal does not change settings, so it stays on: real orders from stores that offer express, in their own commune, get an express rider. Switch it off in Admin > Settings > Checkout and delivery > Express delivery (or: UPDATE settings SET value=\'false\' WHERE key=\'expressDeliveryEnabled\') unless the current rider app is installed.',
      );
  }
  const pub = uniq([
    ...manifestNames,
    ...(await referencedUploads(ds, ids)).map((n) => n),
  ]);
  const priv = ids.users.length
    ? (
        await ds
          .getRepository(PrivateFile)
          .createQueryBuilder('x')
          .where('x.ownerUserId IN (:...u)', { u: ids.users.slice(0, CHUNK) })
          .getMany()
      ).map((f) => f.storedName)
    : [];
  return {
    counts,
    blockers: await blockersOf(ds, ids),
    notes,
    userIds: ids.users,
    files: { public: pub, private: priv },
  };
}

/** Real products carrying a review written by a demo user. */
async function ratedElsewhere(ds: DataSource, i: Ids): Promise<string[]> {
  const w = where([['userId', i.users]]);
  if (!w) return [];
  const rows = await ds
    .getRepository(Review)
    .createQueryBuilder('x')
    .select('DISTINCT x.productId', 'p')
    .where(w.sql.replace(/\b([a-zA-Z]+) IN/g, 'x.$1 IN'), w.params)
    .getRawMany<{ p: string }>();
  return rows.map((r) => r.p).filter((p) => !i.products.includes(p));
}

function unlinkIn(dir: string, names: string[]): number {
  let n = 0;
  for (const name of names) {
    const safe = basename(name);
    if (safe !== name || safe.startsWith('.')) continue;
    const p = join(dir, safe);
    if (existsSync(p)) {
      unlinkSync(p);
      n++;
    }
  }
  return n;
}

/**
 * Remove everything the demo owns. Refuses when real data points at demo data (see `blockers`). With `yes` false it
 * only reports. The deletes run in one transaction: all or nothing. The files go after the rows.
 */
export async function removeDemo(
  ds: DataSource,
  opts: {
    yes: boolean;
    uploadDir: string;
    privateDir: string;
    manifestNames?: string[];
  },
): Promise<RemovalResult> {
  const plan = await planRemoval(ds, opts.manifestNames ?? []);
  const result: RemovalResult = {
    ...plan,
    deleted: [],
    filesRemoved: { public: 0, private: 0 },
    sellersReset: 0,
  };
  if (
    !opts.yes ||
    plan.blockers.length ||
    (!plan.userIds.length && !plan.counts.length)
  )
    return result;
  const ids = await collect(ds);
  const toRate = await ratedElsewhere(ds, ids);
  await ds.transaction(async (m) => {
    // Real stores whose origin warehouse was the demo one (adding the demo warehouse re-derives every store's origin):
    // cleared here, recomputed by the caller (CoverageService.recomputeSellerOrigins).
    if (ids.hubs.length) {
      const r = await m
        .getRepository(Seller)
        .createQueryBuilder()
        .update()
        .set({ originHubId: null })
        .where('originHubId IN (:...h)', { h: ids.hubs })
        .andWhere('id NOT IN (:...s)', {
          s: ids.sellers.length ? ids.sellers : ['-'],
        })
        .execute();
      result.sellersReset = r.affected ?? 0;
    }
    for (const s of steps(ids)) {
      const w = where(s.terms);
      if (!w) continue;
      const r = await m
        .getRepository(s.entity)
        .createQueryBuilder()
        .delete()
        .where(w.sql, w.params)
        .execute();
      if (r.affected) result.deleted.push([s.label, r.affected]);
    }
    // A real product's rating followed the demo reviews: recompute it from the reviews that are left.
    for (const productId of toRate) {
      const rows = await m.getRepository(Review).find({
        where: { productId, status: 'visible' },
        select: { rating: true },
      });
      const rating = rows.length
        ? Math.round(
            (rows.reduce((t, r) => t + r.rating, 0) / rows.length) * 10,
          ) / 10
        : 0;
      await m
        .getRepository(Product)
        .update({ id: productId }, { rating, reviewsCount: rows.length });
    }
  });
  result.filesRemoved.public = unlinkIn(
    opts.uploadDir,
    plan.files.public.map((n) => (n.includes('.') ? n : `${n}.jpg`)),
  );
  result.filesRemoved.private = unlinkIn(opts.privateDir, plan.files.private);
  return result;
}
