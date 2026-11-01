/**
 * Inventory (docs/contracts/commerce.md §2): server-side overview, delta adjustments, movement log, low-stock line.
 * Labels are EN/FR; nothing here is invented — every reason is a value the API writes to the ledger.
 */
import type { BadgeVariant } from "@/lib/seller-labels";

export interface StockItem {
  productId: string;
  name: string;
  sku: string | null;
  image: string | null;
  status: string;
  stock: number;
  /** Units set aside per option label; null = stock is not split by option. */
  variantStock: Record<string, number> | null;
  /** Units not tied to an option (the shared pool). */
  pool: number;
  /** Units in open orders (pending → out for delivery). */
  reserved: number;
  low: boolean;
  outOfStock: boolean;
}

export interface StockOverview {
  lowStockThreshold: number;
  total: number;
  limit: number;
  offset: number;
  summary: { products: number; units: number; outOfStock: number; lowStock: number };
  items: StockItem[];
}

export type MovementReason = "sale" | "cancel_restock" | "return_restock" | "manual_adjust" | "replacement" | "import" | "initial";

export interface StockMovement {
  id: string;
  productId: string;
  variant: string | null;
  delta: number;
  stockAfter: number;
  reason: MovementReason | string;
  orderId: string | null;
  actorId: string | null;
  note: string | null;
  createdAt: string;
}

export interface StockMovements {
  productId: string;
  total: number;
  limit: number;
  offset: number;
  items: StockMovement[];
}

export interface StockLowPush {
  productId: string;
  variant: string | null;
  stock: number;
  threshold: number;
  outOfStock: boolean;
}

/** Reasons a seller may pick when adjusting by hand (`inventory:adjust`). */
export const ADJUST_REASONS: { value: "manual_adjust" | "replacement" | "return_restock"; en: string; fr: string }[] = [
  { value: "manual_adjust", en: "Manual correction (count, damage, new delivery)", fr: "Correction manuelle (comptage, casse, nouvel arrivage)" },
  { value: "replacement", en: "Units set aside for a replacement", fr: "Unités mises de côté pour un remplacement" },
  { value: "return_restock", en: "Returned goods put back on the shelf", fr: "Articles retournés remis en rayon" },
];

const REASONS: Record<string, { en: string; fr: string; variant: BadgeVariant }> = {
  sale: { en: "Sale", fr: "Vente", variant: "info" },
  cancel_restock: { en: "Cancelled order, restocked", fr: "Commande annulée, remise en stock", variant: "default" },
  return_restock: { en: "Return restocked", fr: "Retour remis en stock", variant: "success" },
  manual_adjust: { en: "Manual adjustment", fr: "Ajustement manuel", variant: "warning" },
  replacement: { en: "Replacement", fr: "Remplacement", variant: "purple" },
  import: { en: "Bulk import", fr: "Import en masse", variant: "default" },
  initial: { en: "Initial stock", fr: "Stock initial", variant: "default" },
};

export const movementReasonLabel = (r: string, fr: boolean): string => (REASONS[r] ? (fr ? REASONS[r].fr : REASONS[r].en) : r.replace(/_/g, " "));
export const movementReasonVariant = (r: string): BadgeVariant => REASONS[r]?.variant ?? "default";

/** Does this movement belong to an order (so the log can link to it)? */
export const movementHasOrder = (m: StockMovement): boolean => !!m.orderId;

/** The option labels a product's stock is split by, in a stable order. */
export const variantLabels = (item: Pick<StockItem, "variantStock">): string[] => Object.keys(item.variantStock ?? {}).sort((a, b) => a.localeCompare(b));

/** Units a delta of `delta` can still remove from: the option's own count, or the whole product's. */
export function removableUnits(item: Pick<StockItem, "stock" | "variantStock" | "pool">, variant: string | null): number {
  if (variant && item.variantStock && variant in item.variantStock) return item.variantStock[variant];
  if (variant) return item.pool; // an option with no entry draws on the shared pool
  return item.variantStock ? item.pool : item.stock;
}
