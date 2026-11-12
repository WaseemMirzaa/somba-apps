import { createHash, createHmac } from 'crypto';
import { localDay } from '../common/delivery/estimate';

/** Pin rounding: 0.0005 degrees is about 55 m, so two pins that differ by a doorstep still match. */
const PIN_GRID = 0.0005;

/** Words that mean the same in an address ("Av." / "avenue", "n°"): the key ignores case, accents, punctuation and these. */
const NOISE = /\b(n|no|numero|num|av|ave|avenue|bd|blvd|boulevard|rue|street)\b/g;

const clean = (v: unknown): string =>
  typeof v === 'string'
    ? v
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(NOISE, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';

/** The delivery address JSON of an order, or null when it is free text / missing. */
export function addressObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The normalised delivery address two orders must share to go in one box set: street (`line1`), commune, city and the map pin
 * rounded to about 55 m. Free text (not JSON) is normalised as a whole. Never shown to anybody: it only decides membership.
 */
export function addressKeyOf(raw: string | null | undefined): string {
  const a = addressObject(raw);
  if (!a) return `t:${clean(raw ?? '')}`.slice(0, 250);
  const geo = (a.geo && typeof a.geo === 'object' ? a.geo : a) as Record<string, unknown>;
  const lat = Number(geo.lat);
  const lng = Number(geo.lng);
  const pin = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? `${Math.round(lat / PIN_GRID)},${Math.round(lng / PIN_GRID)}` : '';
  return [clean(a.line1 ?? a.street ?? a.address), clean(a.commune), clean(a.city), pin].join('|').slice(0, 250);
}

/** The destination AREA printed on a label (commune and city; never the street or the phone). */
export function areaOf(raw: string | null | undefined): string | null {
  const a = addressObject(raw);
  if (!a) return null;
  return [a.commune, a.city].filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()).join(', ') || null;
}

/** What decides that two orders can share a label set. */
export interface GroupPlan {
  /** Null for a multi-seller order (never merged in phase 1). */
  sellerKey: string | null;
  customerId: string;
  dayKey: string;
  addressKey: string;
  deliveryMode: 'standard' | 'express';
  originHubId: string | null;
  destinationHubId: string | null;
  groupKey: string;
}

export interface PlanOrder {
  id: string;
  customerId: string;
  createdAt: Date;
  shippingAddress: string | null;
  deliveryMode?: string | null;
  destinationHubId?: string | null;
  originBySeller?: Record<string, string> | null;
  originHubIds?: string[] | null;
}

/**
 * The group an order belongs to. `sellerKey` is the single seller of the order (null when several sellers ship it: such an order
 * only ever groups with itself, so its key carries the order id). The Kinshasa day is the day the order was placed.
 */
export function planFor(order: PlanOrder, sellerKey: string | null): GroupPlan {
  const mode: 'standard' | 'express' = order.deliveryMode === 'express' ? 'express' : 'standard';
  const origin = (sellerKey ? order.originBySeller?.[sellerKey] : null) ?? order.originHubIds?.[0] ?? null;
  const base = {
    sellerKey,
    customerId: order.customerId,
    dayKey: localDay(new Date(order.createdAt)),
    addressKey: addressKeyOf(order.shippingAddress),
    deliveryMode: mode,
    originHubId: origin,
    destinationHubId: order.destinationHubId ?? null,
  };
  const key = sellerKey ? [base.sellerKey, base.customerId, base.dayKey, base.addressKey, base.deliveryMode, base.originHubId ?? '', base.destinationHubId ?? ''].join('\u0001') : `solo:${order.id}`;
  return { ...base, groupKey: createHash('sha256').update(key).digest('hex') };
}

/** An opaque, stable name for a cluster of candidate orders: the seller's page never sees the address key behind it. */
export function groupHint(groupKey: string, secret: string): string {
  return createHmac('sha256', secret).update(groupKey).digest('hex').slice(0, 16);
}

/** One product line as a label, a checklist or a scan result shows it. */
export interface ContentLine {
  name: string;
  nameFr?: string | null;
  /** The size / option label ("L / Blue"); null for a product without options. */
  variant: string | null;
  variantFr?: string | null;
  qty: number;
  /** The order the line belongs to (a box set of several orders lists every order's lines). */
  orderReference: string;
}

/** The option label worth printing: "Default" (the canonical no-option value) is nothing. */
export function variantLabel(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  return !s || s.toLowerCase() === 'default' ? null : s;
}
