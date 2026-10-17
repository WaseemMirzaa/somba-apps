"use client";

/**
 * Small live-data helpers shared by the web shop pages.
 * Everything here talks to the backend over the single socket connection.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import type { Review } from "@/lib/realtime/types";

/** Subscribe to a server push on the CURRENT socket (re-binds after reconnect/login). */
export function useSocketEvent<T = unknown>(event: string, handler: (payload: T) => void) {
  const rt = useRealtime();
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const s = socketClient.current;
    if (!s) return;
    const fn = (p: T) => ref.current(p);
    s.on(event, fn);
    return () => {
      s.off(event, fn);
    };
  }, [event, rt.status, rt.user?.id]);
}

export interface DeliveryZone {
  id: string;
  name: string;
  nameFr?: string;
  city: string;
  feeUsd: number;
}

export interface PublicSettings {
  loaded: boolean;
  codEnabled: boolean;
  codCapUsd: number;
  fxRate: number | null;
  requireDeliveryCode: boolean;
  /** Orders and wallet top-ups need a verified phone or email. */
  requireVerifiedForCheckout: boolean;
  deliveryZones: DeliveryZone[];
}

const EMPTY_SETTINGS: PublicSettings = {
  loaded: false,
  codEnabled: false,
  codCapUsd: 0,
  fxRate: null,
  requireDeliveryCode: false,
  requireVerifiedForCheckout: false,
  deliveryZones: [],
};

function parseSettings(raw: Record<string, string>): PublicSettings {
  let zones: DeliveryZone[] = [];
  try {
    const parsed = JSON.parse(raw.deliveryZones ?? "[]");
    if (Array.isArray(parsed)) {
      zones = parsed
        .filter((z) => z && typeof z.id === "string")
        .map((z) => ({
          id: String(z.id),
          name: String(z.name ?? z.id),
          nameFr: z.nameFr ? String(z.nameFr) : undefined,
          city: String(z.city ?? ""),
          feeUsd: Number(z.feeUsd) || 0,
        }));
    }
  } catch {
    zones = [];
  }
  return {
    loaded: true,
    codEnabled: raw.codEnabled === "true",
    codCapUsd: Number(raw.codCapUsd) || 0,
    fxRate: raw.fxRate ? Number(raw.fxRate) : null,
    requireDeliveryCode: raw.requireDeliveryCode === "true",
    requireVerifiedForCheckout: raw.requireVerifiedForCheckout === "true",
    deliveryZones: zones,
  };
}

/** Public platform settings (COD flag, delivery zones...) — live via `settings:updated`. */
export function usePublicSettings(): PublicSettings {
  const rt = useRealtime();
  const [settings, setSettings] = useState<PublicSettings>(EMPTY_SETTINGS);

  useEffect(() => {
    if (rt.status !== "connected") return;
    let alive = true;
    socketClient
      .request<Record<string, string>>("settings:get")
      .then((raw) => {
        if (alive) setSettings(parseSettings(raw));
      })
      .catch(() => {
        /* keep defaults; checkout will surface the server error if a zone is invalid */
      });
    return () => {
      alive = false;
    };
  }, [rt.status, rt.user?.id]);

  useSocketEvent<Record<string, string>>("settings:updated", (raw) => {
    setSettings((cur) => parseSettings({
      deliveryZones: raw.deliveryZones ?? JSON.stringify(cur.deliveryZones),
      codEnabled: raw.codEnabled ?? String(cur.codEnabled),
      codCapUsd: raw.codCapUsd ?? String(cur.codCapUsd),
      fxRate: raw.fxRate ?? (cur.fxRate ? String(cur.fxRate) : ""),
      requireDeliveryCode: raw.requireDeliveryCode ?? String(cur.requireDeliveryCode),
      requireVerifiedForCheckout: raw.requireVerifiedForCheckout ?? String(cur.requireVerifiedForCheckout),
    }));
  });

  return settings;
}

export function zoneLabel(z: DeliveryZone, fr: boolean): string {
  return fr && z.nameFr ? z.nameFr : z.name;
}

/** The full shipping address the server stores (and the rider sees). */
export function addressToShipping(
  a: { label: string; line1: string; line2?: string | null; city: string; commune?: string | null; phone?: string | null; zoneId?: string | null },
  zoneId: string | null,
): string {
  return JSON.stringify({
    label: a.label,
    line1: a.line1,
    ...(a.line2 ? { line2: a.line2 } : {}),
    city: a.city,
    commune: a.commune ?? "",
    phone: a.phone ?? "",
    zone: zoneId ?? a.zoneId ?? "",
  });
}

/** Run an async action with a busy flag; returns the result or undefined when it threw. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, onError: (message: string) => void): Promise<T | undefined> => {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      onError((e as Error).message || "Request failed.");
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, run };
}

/** Mobile-money networks we accept at checkout / top-up. */
export const MOBILE_MONEY_METHODS = [
  { id: "airtel_money", label: "Airtel Money" },
  { id: "orange_money", label: "Orange Money" },
  { id: "vodacom_mpesa", label: "Vodacom M-Pesa" },
] as const;

export function isMobileMoneyMethod(m: string): boolean {
  return MOBILE_MONEY_METHODS.some((x) => x.id === m);
}

export function paymentMethodName(m: string, fr: boolean): string {
  const map: Record<string, string> = {
    wallet: fr ? "Portefeuille Somba" : "Somba wallet",
    cod: fr ? "Paiement à la livraison" : "Cash on delivery",
    airtel_money: "Airtel Money",
    orange_money: "Orange Money",
    vodacom_mpesa: "Vodacom M-Pesa",
    stripe_card: fr ? "Carte" : "Card",
  };
  return map[m] ?? m;
}

// ---------------------------------------------------------------------------
// Support tickets (`support:list/open/reply`, live via `support:updated`)
// ---------------------------------------------------------------------------

export interface SupportMessage {
  from: string;
  role: string;
  text: string;
  at: string;
}

export interface SupportTicketRow {
  id: string;
  reference: string;
  subject: string;
  category: string;
  orderId: string | null;
  status: "open" | "pending" | "resolved" | "closed";
  /** JSON array as stored by the server. */
  messages: string;
  createdAt: string;
  updatedAt: string;
}

export function ticketMessages(t: Pick<SupportTicketRow, "messages">): SupportMessage[] {
  try {
    const list = JSON.parse(t.messages || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function ticketStatusLabel(status: string, fr: boolean): string {
  const map: Record<string, { en: string; fr: string }> = {
    open: { en: "Open", fr: "Ouvert" },
    pending: { en: "Answered", fr: "Répondu" },
    resolved: { en: "Resolved", fr: "Résolu" },
    closed: { en: "Closed", fr: "Fermé" },
  };
  const m = map[status];
  return m ? (fr ? m.fr : m.en) : status;
}

function upsertTicket(list: SupportTicketRow[], t: SupportTicketRow): SupportTicketRow[] {
  const next = list.filter((x) => x.id !== t.id);
  next.unshift(t);
  return next.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

/** The signed-in customer's tickets, kept live by `support:updated`. */
export function useSupportTickets() {
  const rt = useRealtime();
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rt.status !== "connected" || !rt.user) return;
    let alive = true;
    socketClient
      .request<SupportTicketRow[]>("support:list")
      .then((list) => {
        if (!alive) return;
        setTickets(list);
        setError(null);
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [rt.status, rt.user]);

  useSocketEvent<SupportTicketRow>("support:updated", (t) => {
    setTickets((cur) => upsertTicket(cur, t));
  });

  const put = useCallback((t: SupportTicketRow) => setTickets((cur) => upsertTicket(cur, t)), []);
  return { tickets, loaded, error, put };
}


// ---------------------------------------------------------------------------
// Product reviews (`reviews:list`; hidden reviews are never sent by the server)
// ---------------------------------------------------------------------------

export type LiveReview = Review & { helpful?: number };

/**
 * Visible reviews of one product, with the seller's reply. Kept live by
 * `review:updated` (a new reply shows up, a review a moderator hides disappears).
 */
export function useProductReviews(productId: string | undefined) {
  const rt = useRealtime();
  const [reviews, setReviews] = useState<LiveReview[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!productId) return;
    try {
      const list = await socketClient.request<LiveReview[]>("reviews:list", { productId });
      setReviews(list);
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Could not load the reviews.");
    } finally {
      setLoaded(true);
    }
  }, [productId]);

  useEffect(() => {
    if (!productId || rt.status !== "connected") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [productId, rt.status, load]);

  useSocketEvent<Partial<LiveReview> & { id: string; productId: string }>("review:updated", (r) => {
    if (r.productId !== productId) return;
    setReviews((cur) =>
      r.status === "hidden" ? cur.filter((x) => x.id !== r.id) : cur.map((x) => (x.id === r.id ? { ...x, ...r } : x)),
    );
  });

  const put = useCallback((r: LiveReview) => setReviews((cur) => [r, ...cur.filter((x) => x.id !== r.id)]), []);
  const patch = useCallback((id: string, fn: (r: LiveReview) => LiveReview) => setReviews((cur) => cur.map((x) => (x.id === id ? fn(x) : x))), []);
  return { reviews, loaded, error, reload: load, put, patch };
}


// ---------------------------------------------------------------------------
// Verification policy (`requireVerifiedForCheckout`)
// ---------------------------------------------------------------------------

export interface VerificationStatus {
  /** Both the setting and the account flags are known. */
  loaded: boolean;
  /** The platform requires a verified phone or email before paying. */
  required: boolean;
  phoneVerified: boolean;
  emailVerified: boolean;
  /** Required and the account has neither: checkout and top-ups would be refused. */
  blocked: boolean;
  reload: () => void;
}

/** The server's refusal text for an unverified account (so it can be shown as a prompt, not a raw error). */
export function isVerificationError(message: string | null | undefined): boolean {
  return !!message && /verify your phone number or email/i.test(message);
}

/** Whether the signed-in account may pay: reads the public setting and `me:get` (live via `me:updated`). */
export function useVerificationStatus(): VerificationStatus {
  const rt = useRealtime();
  const settings = usePublicSettings();
  const [flags, setFlags] = useState<{ phone: boolean; email: boolean } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (rt.status !== "connected" || !rt.user) return;
    let alive = true;
    socketClient
      .request<{ phoneVerified?: boolean; emailVerified?: boolean }>("me:get")
      .then((u) => alive && setFlags({ phone: !!u.phoneVerified, email: !!u.emailVerified }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [rt.status, rt.user, tick]);

  useSocketEvent<{ phoneVerified?: boolean; emailVerified?: boolean }>("me:updated", (u) => {
    setFlags((cur) => ({
      phone: u.phoneVerified ?? cur?.phone ?? false,
      email: u.emailVerified ?? cur?.email ?? false,
    }));
  });

  const loaded = settings.loaded && flags !== null;
  const phoneVerified = flags?.phone ?? false;
  const emailVerified = flags?.email ?? false;
  return {
    loaded,
    required: settings.requireVerifiedForCheckout,
    phoneVerified,
    emailVerified,
    blocked: loaded && settings.requireVerifiedForCheckout && !phoneVerified && !emailVerified,
    reload: () => setTick((n) => n + 1),
  };
}

// ---------------------------------------------------------------------------
// Public seller plans (`sellers:plans`, admin-editable `sellerPlans` setting)
// ---------------------------------------------------------------------------

export interface PublicSellerPlan {
  id: string;
  name: string;
  nameFr?: string;
  /** null = contact sales */
  priceUsd: number | null;
  months: number;
  maxProducts?: number;
  features: string[];
  featuresFr?: string[];
  popular?: boolean;
}

export function useSellerPlans() {
  const rt = useRealtime();
  const [plans, setPlans] = useState<PublicSellerPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    socketClient
      .request<PublicSellerPlan[]>("sellers:plans")
      .then(setPlans)
      .catch((e: Error) => setError(e.message || "Could not load the plans."));
  }, []);
  useEffect(() => {
    if (rt.status !== "connected") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [rt.status, load]);
  return { plans, error, reload: load };
}
