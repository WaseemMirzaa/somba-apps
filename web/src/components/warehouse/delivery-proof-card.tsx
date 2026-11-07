"use client";

import { useEffect } from "react";
import { DetailGridSection } from "@/components/ui/detail-grid";
import { useLocale } from "@/context/locale-context";
import { PROOF_DENIED, takesProof } from "@/lib/delivery-proof";
import { fmtDateTime, type TaskView } from "@/lib/logistics";
import { useOpsQuery } from "@/lib/warehouse-live";

/** What `deliveryProof:get` answers: 5-minute signed links to the private files (a part that was not captured is null). */
export interface DeliveryProofView {
  photoUrl: string | null;
  signatureUrl: string | null;
  capturedAt: string;
  expiresAt: string;
}

/**
 * The photo and the customer's signature the rider captured at the door. Read through the authorized private route (a
 * short-lived signed link per file, never a public URL). Shown only for a delivered customer leg; a role without
 * permission sees nothing at all.
 */
export function DeliveryProofCard({ task }: { task: Pick<TaskView, "id" | "kind" | "status"> }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const enabled = takesProof(task);
  const q = useOpsQuery<DeliveryProofView | null>("deliveryProof:get", { body: { taskId: task.id }, initial: null, enabled });
  const proof = q.data;

  // The links last five minutes: fetch fresh ones just before they expire, so a page left open keeps showing the images.
  const expiresAt = proof?.expiresAt;
  const reload = q.reload;
  useEffect(() => {
    if (!expiresAt) return;
    const ms = Math.max(5_000, new Date(expiresAt).getTime() - Date.now() - 30_000);
    const timer = setTimeout(() => void reload(), ms);
    return () => clearTimeout(timer);
  }, [expiresAt, reload]);

  if (!enabled) return null;
  if (q.error === PROOF_DENIED) return null; // not for this role: no card, no hint
  const title = fr ? "Preuve de livraison" : "Proof of delivery";

  if (q.loading) {
    return (
      <DetailGridSection title={title} span={2}>
        <p className="text-sm text-slate-500">{fr ? "Chargement…" : "Loading…"}</p>
      </DetailGridSection>
    );
  }
  if (q.error) {
    return (
      <DetailGridSection title={title} span={2}>
        <p role="alert" className="text-sm text-red-700">{q.error}</p>
      </DetailGridSection>
    );
  }
  if (!proof || (!proof.photoUrl && !proof.signatureUrl)) {
    return (
      <DetailGridSection title={title} span={2}>
        <p className="text-sm text-slate-500">
          {fr ? "Aucune photo ni signature n'a été enregistrée pour cette livraison." : "No photo or signature was captured for this delivery."}
        </p>
      </DetailGridSection>
    );
  }
  return (
    <DetailGridSection title={title} span={2}>
      <div className="grid gap-4 sm:grid-cols-2">
        {proof.photoUrl && (
          <figure data-testid="proof-photo" className="space-y-2">
            <a href={proof.photoUrl} target="_blank" rel="noopener noreferrer" className="block">
              {/* Signed private link that expires: next/image's optimizer cannot (and must not) fetch it. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={proof.photoUrl}
                alt={fr ? "Photo du colis remis" : "Photo of the delivered parcel"}
                className="max-h-72 w-full rounded-lg border border-[var(--border)] object-cover"
              />
            </a>
            <figcaption className="text-xs text-slate-500">{fr ? "Photo du colis" : "Parcel photo"}</figcaption>
          </figure>
        )}
        {proof.signatureUrl && (
          <figure data-testid="proof-signature" className="space-y-2">
            <a href={proof.signatureUrl} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={proof.signatureUrl}
                alt={fr ? "Signature du client" : "Customer signature"}
                className="max-h-72 w-full rounded-lg border border-[var(--border)] bg-white object-contain"
              />
            </a>
            <figcaption className="text-xs text-slate-500">{fr ? "Signature du client" : "Customer signature"}</figcaption>
          </figure>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-400">
        {fr ? "Enregistré le " : "Captured "}
        {fmtDateTime(proof.capturedAt, fr)}
        {" · "}
        {fr ? "Fichiers privés : lien valable quelques minutes." : "Private files: the link is valid for a few minutes."}
      </p>
    </DetailGridSection>
  );
}
