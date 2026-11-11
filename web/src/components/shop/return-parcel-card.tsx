"use client";

import { useEffect, useRef, useState } from "react";
import { DetailSection } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { ParcelQr } from "@/components/parcel/parcel-qr";
import { socketClient } from "@/lib/realtime/socket-client";
import { boxText, type ParcelLabel } from "@/lib/parcel-labels";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

/**
 * The code of the package a customer sends back: `parcels:forReturn` answers the label once the return is approved (null
 * before). The rider scans it at the collection, so the customer writes it on the package and shows it.
 */
export function ReturnParcelCard({ returnId }: { returnId: string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [label, setLabel] = useState<ParcelLabel | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const userRetry = useRef(false);
  const latest = useRef({ toast, fr });
  useEffect(() => {
    latest.current = { toast, fr };
  });

  // Reads the label when the card opens and on every Retry (a failed Retry also toasts).
  useEffect(() => {
    let live = true;
    socketClient.request<ParcelLabel | null>("parcels:forReturn", { returnId }).then(
      (res) => {
        if (!live) return;
        setLabel(res && res.code ? res : null);
        setState("ready");
      },
      (e: unknown) => {
        if (!live) return;
        const msg = (e as Error)?.message || (latest.current.fr ? "Impossible de charger l'étiquette." : "Could not load the label.");
        setError(msg);
        setState("error");
        if (userRetry.current) latest.current.toast(msg, "error");
        userRetry.current = false;
      },
    );
    return () => {
      live = false;
    };
  }, [returnId, attempt]);

  function retry() {
    userRetry.current = true;
    setError(null);
    setState("loading");
    setAttempt((n) => n + 1);
  }

  async function copy() {
    if (!label) return;
    try {
      await navigator.clipboard.writeText(label.code);
      toast(fr ? "Code copié" : "Code copied");
    } catch {
      toast(fr ? "Copie impossible : recopiez le code à la main." : "Could not copy: write the code down by hand.", "error");
    }
  }

  return (
    <DetailSection title={fr ? "Code du colis à renvoyer" : "Code of the package to send back"}>
      <div data-testid="return-parcel">
        {state === "loading" && <p className="text-sm text-slate-500" role="status">{fr ? "Chargement…" : "Loading…"}</p>}
        {state === "error" && (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-red-700">{error}</p>
            <Button variant="secondary" size="sm" onClick={retry}>{fr ? "Réessayer" : "Retry"}</Button>
          </div>
        )}
        {state === "ready" && !label && (
          <p className="text-sm text-slate-500">{fr ? "L'étiquette apparaît une fois votre retour approuvé." : "The label appears once your return is approved."}</p>
        )}
        {state === "ready" && label && (
          <div className="flex flex-wrap items-center gap-5">
            <ParcelQr code={label.code} boxNo={label.boxNo} boxCount={label.boxCount} fr={fr} className="h-40 w-40 rounded-lg border border-[var(--border)] bg-white p-1" />
            <div className="space-y-2">
              <p className="font-mono text-2xl font-bold tracking-wide text-slate-900">{label.code}</p>
              <p className="text-sm text-slate-600">
                {label.boxCount > 1 ? `${boxText(label.boxNo, label.boxCount, fr)} · ` : ""}{fr ? "Commande" : "Order"} {label.orderReference}
              </p>
              <p className="text-sm text-slate-700">
                {fr
                  ? "Écrivez ce code sur le colis et montrez-le au livreur : il le scanne à la collecte."
                  : "Write this code on the package and show it to the rider: they scan it when they collect it."}
              </p>
              <Button variant="secondary" size="sm" onClick={() => void copy()}>{fr ? "Copier le code" : "Copy code"}</Button>
            </div>
          </div>
        )}
      </div>
    </DetailSection>
  );
}
