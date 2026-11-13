"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { errMessage } from "@/lib/seller-labels";
import { canManageSellerPortal } from "@/lib/admin-controls";
import { useRole } from "@/lib/admin-live";
import { NO_ACCESS, type AfterSaleAccess, type AccessKey } from "@/lib/seller-aftersale";

/**
 * Admin side of the seller portal's read-only after-sale sections (docs/contracts/admin-controls.md §13): the default per section
 * and, per store, Follow default / On / Off. Roles `admin`, `admin_operations`, `admin_support`; the server refuses everyone else.
 */
export const SECTION_ORDER: AccessKey[] = ["returns", "exchanges", "replacements", "express", "customerThread", "reasons"];

export const SECTION_LABEL: Record<AccessKey, { en: string; fr: string; hintEn: string; hintFr: string }> = {
  returns: {
    en: "Returns",
    fr: "Retours",
    hintEn: "The store sees the returns on its goods, read-only, and can message support.",
    hintFr: "La boutique voit les retours sur ses articles, en lecture seule, et peut écrire au support.",
  },
  exchanges: {
    en: "Exchanges",
    fr: "Échanges",
    hintEn: "The store sees the exchanges requested on its items, read-only, and can message support.",
    hintFr: "La boutique voit les échanges demandés sur ses articles, en lecture seule, et peut écrire au support.",
  },
  replacements: {
    en: "Replacements",
    fr: "Remplacements",
    hintEn: "The store sees the replacements requested on its items, read-only, and can message support.",
    hintFr: "La boutique voit les remplacements demandés sur ses articles, en lecture seule, et peut écrire au support.",
  },
  customerThread: {
    en: "Customer & support messages",
    fr: "Messages client et support",
    hintEn: "Show the customer's messages with support to this store (read-only).",
    hintFr: "Montrer à cette boutique les messages du client avec le support (lecture seule).",
  },
  reasons: {
    en: "Customer's reason and photos",
    fr: "Motif et photos du client",
    hintEn: "Show the customer's reason and photos to this store.",
    hintFr: "Montrer à cette boutique le motif et les photos du client.",
  },
  express: {
    en: "Express delivery card",
    fr: "Carte Livraison express",
    hintEn: "Store settings show whether express is on, read-only. Only KOMORIKO switches express itself.",
    hintFr: "Les paramètres de la boutique montrent si l'express est actif, en lecture seule. Seul KOMORIKO active l'express.",
  },
};

/** The platform defaults, loaded once and kept live (`sellerAccess:defaults` is pushed to the managing roles when any of them changes). */
export function useAfterSaleDefaults() {
  const rt = useRealtime();
  const role = useRole();
  const allowed = canManageSellerPortal(role);
  const [defaults, setDefaults] = useState<AfterSaleAccess>(NO_ACCESS);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = rt.status === "connected";

  const load = useCallback(async () => {
    try {
      setDefaults({ ...NO_ACCESS, ...(await socketClient.request<AfterSaleAccess>("sellerAccess:defaults:get")) });
      setError(null);
      setLoaded(true);
    } catch (e) {
      setError(errMessage(e));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading from the socket is the point of this effect
    if (connected && allowed) void load();
  }, [connected, allowed, load]);

  useEffect(() => {
    if (!connected) return;
    const sock = socketClient.current;
    if (!sock) return;
    const on = (d: AfterSaleAccess) => setDefaults({ ...NO_ACCESS, ...d });
    sock.on("sellerAccess:defaults", on);
    return () => {
      sock.off("sellerAccess:defaults", on);
    };
  }, [connected]);

  return { defaults, setDefaults, loaded, error, allowed, reload: load };
}

/** The four platform defaults as switches. Each saves on its own (`sellerAccess:defaults:set`) and follows other admins live. */
export function SellerPortalDefaults() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { defaults, setDefaults, loaded, error, allowed } = useAfterSaleDefaults();
  const [busy, setBusy] = useState<AccessKey | null>(null);

  async function flip(key: AccessKey) {
    setBusy(key);
    try {
      const next = await socketClient.request<AfterSaleAccess>("sellerAccess:defaults:set", { [key]: !defaults[key] });
      setDefaults({ ...NO_ACCESS, ...next });
      toast(
        fr
          ? `${SECTION_LABEL[key].fr} : ${next[key] ? "activé" : "désactivé"} par défaut`
          : `${SECTION_LABEL[key].en}: default turned ${next[key] ? "on" : "off"}`,
        "success",
      );
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4" data-testid="seller-portal-defaults">
      <p className="text-sm text-slate-500">
        {fr
          ? "Par défaut, toutes les sections sont désactivées. Une section activée apparaît dans le portail de chaque boutique qui suit le défaut, sans reconnexion. Chaque boutique peut avoir son propre réglage sur sa page."
          : "All sections are off by default. A section turned on appears in the portal of every store that follows the default, without signing in again. Each store can have its own setting on its page."}
      </p>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!allowed && (
        <p role="note" className="text-xs text-slate-500">
          {fr ? "Seuls le Super admin, les Opérations et le Support peuvent modifier ces réglages." : "Only the Super Admin, Operations and Support can change these."}
        </p>
      )}
      {!loaded && !error && allowed && <p className="text-sm text-slate-400">{fr ? "Chargement…" : "Loading…"}</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        {SECTION_ORDER.map((key) => {
          const label = SECTION_LABEL[key];
          const on = defaults[key];
          return (
            <div key={key} className="space-y-1.5">
              <span className="text-sm font-medium text-slate-800">{fr ? label.fr : label.en}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={fr ? label.fr : label.en}
                  data-testid={`default-${key}`}
                  disabled={!allowed || !loaded || busy !== null}
                  onClick={() => void flip(key)}
                  className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-emerald-500" : "bg-slate-300"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
                </button>
                <span className="text-sm text-slate-600">{on ? (fr ? "Activé" : "On") : fr ? "Désactivé" : "Off"}</span>
                {busy === key && <span className="text-xs text-slate-400">…</span>}
              </div>
              <p className="text-xs text-slate-400">{fr ? label.hintFr : label.hintEn}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Choice = "follow" | "on" | "off";
const choiceOf = (v: boolean | null | undefined): Choice => (v === true ? "on" : v === false ? "off" : "follow");

/**
 * One store's four overrides: Follow default (On|Off) / On / Off. Saves on change (`sellers:setAfterSaleAccess`); the store's portal
 * follows live. `defaults` is what the store follows right now.
 */
export function SellerPortalAccessSelects({
  sellerId,
  override,
  defaults,
  onChanged,
}: {
  sellerId: string;
  override: Partial<Record<AccessKey, boolean | null>> | null | undefined;
  defaults: AfterSaleAccess | null | undefined;
  onChanged?: (store: Record<string, unknown>) => void;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const role = useRole();
  const allowed = canManageSellerPortal(role);
  const [busy, setBusy] = useState<AccessKey | null>(null);
  const d = defaults ?? NO_ACCESS;

  async function change(key: AccessKey, choice: Choice) {
    setBusy(key);
    try {
      const store = await socketClient.request<Record<string, unknown>>("sellers:setAfterSaleAccess", { sellerId, [key]: choice === "follow" ? null : choice === "on" });
      toast(fr ? `${SECTION_LABEL[key].fr} : réglage de la boutique enregistré` : `${SECTION_LABEL[key].en}: store setting saved`, "success");
      onChanged?.(store);
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2" data-testid="seller-portal-access">
      {SECTION_ORDER.map((key) => {
        const label = SECTION_LABEL[key];
        const value = choiceOf(override?.[key]);
        return (
          <label key={key} className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-800">{fr ? label.fr : label.en}</span>
            <select
              className="input-premium w-full px-3 py-2 text-sm"
              data-testid={`access-${key}`}
              value={value}
              disabled={!allowed || busy !== null}
              onChange={(e) => void change(key, e.target.value as Choice)}
            >
              <option value="follow">
                {fr ? `Suivre le défaut (${d[key] ? "Activé" : "Désactivé"})` : `Follow default (${d[key] ? "On" : "Off"})`}
              </option>
              <option value="on">{fr ? "Activé" : "On"}</option>
              <option value="off">{fr ? "Désactivé" : "Off"}</option>
            </select>
          </label>
        );
      })}
    </div>
  );
}
