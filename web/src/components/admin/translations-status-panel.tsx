"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { errMsg } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";

/** What `translation:status` tells the panel: queue counts, today's characters against the budget, the failed jobs. */
interface Status {
  pending: number | null;
  done: number | null;
  failed: number | null;
  /** Characters sent to the translator today, and the daily budget. */
  chars: number | null;
  limit: number | null;
  provider: string | null;
  /** The server has a translator switched on. */
  enabled: boolean | null;
  failedJobs: { entityType: string; entityId: string; attempts: number | null; lastError: string | null }[];
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function readStatus(raw: unknown): Status {
  const r = obj(raw) ?? {};
  const counts = obj(r.counts) ?? r;
  return {
    pending: num(counts.pending),
    done: num(counts.done),
    failed: num(counts.failed),
    chars: num(r.charsToday) ?? num(r.charactersToday),
    limit: num(r.charLimit) ?? num(r.dailyLimit),
    provider: typeof r.provider === "string" ? r.provider : null,
    enabled: typeof r.enabled === "boolean" ? r.enabled : null,
    failedJobs: (Array.isArray(r.failedJobs) ? r.failedJobs : []).flatMap((j) => {
      const o = obj(j);
      return o && typeof o.entityType === "string" && typeof o.entityId === "string"
        ? [{ entityType: o.entityType, entityId: o.entityId, attempts: num(o.attempts), lastError: typeof o.lastError === "string" ? o.lastError : null }]
        : [];
    }),
  };
}

const fmt = (n: number | null, locale: string) => (n === null ? "—" : n.toLocaleString(locale === "fr" ? "fr-FR" : "en-US"));

/** Translation queue at a glance (pending / done / failed, today's characters) with "Retry failed". */
export function TranslationsStatusPanel() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { toast } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumping this re-reads the status (Refresh, after a retry).
  const [tick, setTick] = useState(0);
  const load = () => setTick((n) => n + 1);

  useEffect(() => {
    if (rt.status !== "connected") return;
    let alive = true;
    socketClient
      .request<unknown>("translation:status")
      .then((raw) => {
        if (!alive) return;
        setStatus(readStatus(raw));
        setError(null);
      })
      .catch((e) => alive && setError(errMsg(e)));
    return () => {
      alive = false;
    };
  }, [rt.status, tick]);

  async function retryFailed() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await socketClient.request<unknown>("translation:retry", {});
      const r = obj(res);
      const n = num(r?.queued);
      toast(
        n !== null
          ? fr ? `${n} traduction(s) relancée(s)` : `${n} translation(s) queued again`
          : fr ? "Traductions en échec relancées" : "Failed translations queued again",
        "success",
      );
      load();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  }

  const tile = (label: string, value: number | null, tone = "text-slate-900") => (
    <div className="rounded-xl border border-[var(--border)] p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{fmt(value, locale)}</p>
    </div>
  );

  return (
    <div className="card-premium space-y-4 p-6" data-testid="translations-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{fr ? "Traductions automatiques" : "Automatic translations"}</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={load} disabled={busy}>
            <RefreshCw className="h-3.5 w-3.5" />
            {fr ? "Actualiser" : "Refresh"}
          </Button>
          <Button size="sm" onClick={() => void retryFailed()} disabled={busy || !status || (status.failed ?? 0) === 0}>
            {busy ? "…" : fr ? "Relancer les échecs" : "Retry failed"}
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {status && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {tile(fr ? "En attente" : "Pending", status.pending, "text-amber-700")}
            {tile(fr ? "Terminées" : "Done", status.done, "text-emerald-700")}
            {tile(fr ? "En échec" : "Failed", status.failed, (status.failed ?? 0) > 0 ? "text-red-700" : "text-slate-900")}
          </div>
          <p className="text-xs text-slate-500">
            {fr ? "Caractères traduits aujourd'hui : " : "Characters translated today: "}
            <strong>{fmt(status.chars, locale)}</strong>
            {status.limit !== null && ` / ${fmt(status.limit, locale)}`}
            {status.provider ? ` · ${fr ? "moteur" : "engine"}: ${status.provider}` : ""}
          </p>
          {(status.enabled === false || status.provider === "off") && (
            <p className="text-xs text-amber-700">
              {fr ? "La traduction automatique est désactivée sur le serveur : les textes restent dans leur langue d'origine." : "Automatic translation is switched off on the server: texts stay in the language they were written in."}
            </p>
          )}
          {status.failedJobs.length > 0 && (
            <ul className="space-y-1 text-xs text-slate-600" aria-label={fr ? "Traductions en échec" : "Failed translations"}>
              {status.failedJobs.slice(0, 5).map((j) => (
                <li key={`${j.entityType}:${j.entityId}`} className="flex flex-wrap gap-x-2 rounded-lg bg-red-50 px-3 py-1.5">
                  <span className="font-semibold text-red-800">{j.entityType.replace(/_/g, " ")}</span>
                  <span className="font-mono">{j.entityId.slice(0, 8)}</span>
                  {j.attempts !== null && <span>{fr ? `${j.attempts} essai(s)` : `${j.attempts} attempt(s)`}</span>}
                  {j.lastError && <span className="min-w-0 break-words text-red-700">{j.lastError}</span>}
                </li>
              ))}
              {status.failedJobs.length > 5 && <li className="text-slate-500">{fr ? `… et ${status.failedJobs.length - 5} autre(s)` : `… and ${status.failedJobs.length - 5} more`}</li>}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
