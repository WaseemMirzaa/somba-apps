"use client";

import { useState } from "react";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { errorMessage, pick } from "@/lib/warehouse-live";

type L = { en: string; fr: string };

/**
 * Move a server record to its next status (`<kind>:setStatus {id, status}`).
 * The row is replaced by the server's answer; failures are shown inline.
 */
export function StatusButtons<T extends { id: string }>({
  event,
  id,
  next,
  labels,
  onSaved,
}: {
  event: "exchanges:setStatus" | "replacements:setStatus";
  id: string;
  next: { to: string; danger?: boolean }[];
  labels: Record<string, L>;
  onSaved: (row: T) => void;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (next.length === 0) return null;

  async function go(to: string) {
    if (busy) return;
    setBusy(to);
    setError(null);
    try {
      const saved = await socketClient.request<T>(event, { id, status: to });
      onSaved(saved);
      toast(fr ? "Statut mis à jour" : "Status updated");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {next.map((n) => (
          <button
            key={n.to}
            disabled={busy !== null}
            onClick={() => void go(n.to)}
            className={
              n.danger
                ? "rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                : "btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
            }
          >
            {busy === n.to ? "…" : `${fr ? "Passer à" : "Move to"}: ${pick(labels[n.to], fr, n.to)}`}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
