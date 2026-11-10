/**
 * Delivery fee: base + perKm x distance(destination warehouse -> customer pin), capped, plus a transfer fee when any
 * parcel has to travel between two warehouses. All four numbers are admin settings.
 */
export interface FeeConfig {
  baseUsd: number;
  perKmUsd: number;
  maxUsd: number;
  transferUsd: number;
}

export const FEE_DEFAULTS: FeeConfig = { baseUsd: 2, perKmUsd: 0.5, maxUsd: 15, transferUsd: 1.5 };

export const FEE_SETTING_KEYS = ['deliveryBaseUsd', 'deliveryPerKmUsd', 'deliveryMaxUsd', 'deliveryTransferUsd'] as const;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function read(raw: string | null | undefined, fallback: number): number {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** The fee numbers from the settings table (missing or broken values fall back to the defaults). */
export function feeConfigFrom(settings: Record<string, string | null | undefined>): FeeConfig {
  return {
    baseUsd: read(settings.deliveryBaseUsd, FEE_DEFAULTS.baseUsd),
    perKmUsd: read(settings.deliveryPerKmUsd, FEE_DEFAULTS.perKmUsd),
    maxUsd: read(settings.deliveryMaxUsd, FEE_DEFAULTS.maxUsd),
    transferUsd: read(settings.deliveryTransferUsd, FEE_DEFAULTS.transferUsd),
  };
}

export interface FeeBreakdown {
  feeUsd: number;
  /** base + distance part, after the cap */
  deliveryUsd: number;
  transferUsd: number;
  distanceKm: number;
}

/**
 * The fee for a distance (km, destination warehouse -> customer) and whether a transfer leg is needed.
 * `overrideUsd` (a flat fee set on the area's coverage row) replaces base + per km (and the cap); the transfer fee is
 * still added when parcels travel between warehouses. `transfer` is a flag (one transfer fee) or the charge of each
 * hop the parcels travel (a lane may set its own price), summed.
 */
export function deliveryFee(cfg: FeeConfig, distanceKm: number, transfer: boolean | readonly number[], overrideUsd?: number | null): FeeBreakdown {
  const km = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0;
  const flat = typeof overrideUsd === 'number' && Number.isFinite(overrideUsd) && overrideUsd >= 0;
  const deliveryUsd = flat ? round2(overrideUsd as number) : round2(Math.min(cfg.maxUsd, cfg.baseUsd + cfg.perKmUsd * km));
  const transferUsd = Array.isArray(transfer) ? round2((transfer as readonly number[]).reduce((t, c) => t + (Number.isFinite(c) && c > 0 ? c : 0), 0)) : transfer ? round2(cfg.transferUsd) : 0;
  return { feeUsd: round2(deliveryUsd + transferUsd), deliveryUsd, transferUsd, distanceKm: round2(km) };
}

// ── express ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The express fee numbers: its own settings, never the standard ones (and never an area's flat fee). */
export interface ExpressFeeConfig {
  baseUsd: number;
  perKmUsd: number;
  maxUsd: number;
}

export const EXPRESS_FEE_DEFAULTS: ExpressFeeConfig = { baseUsd: 2, perKmUsd: 0.5, maxUsd: 15 };
export const EXPRESS_SETTING_KEYS = ['expressBaseUsd', 'expressPerKmUsd', 'expressMaxUsd'] as const;

/** The express fee numbers from the settings table (missing or broken values fall back to the defaults). */
export function expressFeeConfigFrom(settings: Record<string, string | null | undefined>): ExpressFeeConfig {
  return {
    baseUsd: read(settings.expressBaseUsd, EXPRESS_FEE_DEFAULTS.baseUsd),
    perKmUsd: read(settings.expressPerKmUsd, EXPRESS_FEE_DEFAULTS.perKmUsd),
    maxUsd: read(settings.expressMaxUsd, EXPRESS_FEE_DEFAULTS.maxUsd),
  };
}

/**
 * The fee of an express delivery: `min(max, base + perKm x km)`, km = the seller's pin to the customer's pin. No transfer fee (the
 * parcel never touches a warehouse) and no flat area fee. Same breakdown shape as {@link deliveryFee} so callers treat both alike.
 */
export function expressFee(cfg: ExpressFeeConfig, distanceKm: number): FeeBreakdown {
  const km = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0;
  const deliveryUsd = round2(Math.min(cfg.maxUsd, cfg.baseUsd + cfg.perKmUsd * km));
  return { feeUsd: deliveryUsd, deliveryUsd, transferUsd: 0, distanceKm: round2(km) };
}
