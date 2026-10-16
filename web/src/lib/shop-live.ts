"use client";

/**
 * Small live-data helpers shared by the web shop pages.
 * Everything here talks to the backend over the single socket connection.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";

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
  deliveryZones: DeliveryZone[];
}

const EMPTY_SETTINGS: PublicSettings = {
  loaded: false,
  codEnabled: false,
  codCapUsd: 0,
  fxRate: null,
  requireDeliveryCode: false,
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
