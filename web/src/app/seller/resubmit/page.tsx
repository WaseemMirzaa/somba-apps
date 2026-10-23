"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoader } from "@/components/ui/loader";
import { KycForm, kycFromSeller, kycPayload, type KycValues } from "@/components/seller/kyc-form";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { localDateTime } from "@/lib/dates";
import { socketClient } from "@/lib/realtime/socket-client";
import { errMessage } from "@/lib/seller-labels";
import { useStoreGate } from "@/lib/seller";

/**
 * Re-file the store application: a rejected store fixes what moderation flagged, a store opened before
 * KYC existed completes it. Prefilled from `sellers:mine`; sends `sellers:resubmit`.
 */
export default function SellerResubmitPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const router = useRouter();
  const { state, seller } = useStoreGate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state === "loading") return <PageLoader locale={locale} />;

  // Only a rejected store, or a pending one that never filed KYC, can use the form.
  const rejected = state === "rejected";
  const legacy = state === "pending" && !!seller && !seller.kycSubmittedAt;
  if (!seller || (!rejected && !legacy)) {
    return (
      <div className="mx-auto max-w-lg space-y-6 px-4 py-8">
        <PageHeader title={fr ? "Resoumettre ma demande" : "Resubmit my application"} />
        <div className="card-premium space-y-4 p-6">
          <p className="text-sm text-slate-600">
            {state === "approved"
              ? fr ? "Votre boutique est déjà approuvée." : "Your store is already approved."
              : state === "pending"
                ? fr ? "Votre demande est déjà en cours d'examen par la modération." : "Your application is already under review by moderation."
                : fr ? "Cette page n'est disponible que pour une demande refusée." : "This page is only available for a rejected application."}
          </p>
          <Link href={state === "pending" ? "/seller/pending" : "/seller"} className="btn-primary inline-flex rounded-lg px-4 py-2 text-sm font-medium">
            {fr ? "Retour" : "Back"}
          </Link>
        </div>
      </div>
    );
  }

  async function submit(values: KycValues) {
    setBusy(true);
    setError(null);
    try {
      await socketClient.request("sellers:resubmit", await kycPayload(values));
    } catch (err) {
      const msg = errMessage(err);
      setError(msg);
      toast(msg, "error");
      setBusy(false);
      return;
    }
    toast(fr ? "Demande renvoyée — en attente d'approbation" : "Application resubmitted — waiting for approval");
    router.push("/seller/pending");
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <PageHeader
        title={rejected ? (fr ? "Corriger et renvoyer ma demande" : "Fix and resubmit my application") : fr ? "Compléter mon dossier vendeur" : "Complete your seller details"}
        subtitle={
          rejected
            ? fr ? "Corrigez les points signalés, puis renvoyez le dossier à la modération" : "Fix what moderation flagged, then send the file back"
            : fr ? "Votre boutique existe mais n'a pas encore de dossier d'identité" : "Your store exists but has no identity file yet"
        }
      />

      {rejected && (
        <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="font-semibold">{fr ? "Motif du refus" : "Why it was rejected"}</p>
            <p className="whitespace-pre-line break-words">{seller.statusReason || (fr ? "Aucun motif n'a été indiqué." : "No reason was given.")}</p>
            {seller.statusChangedAt && <p className="text-xs text-red-700">{localDateTime(seller.statusChangedAt)}</p>}
          </div>
        </div>
      )}

      <KycForm
        key={seller.id}
        initial={kycFromSeller(seller)}
        submitLabel={fr ? "Renvoyer ma demande" : "Resubmit application"}
        busy={busy}
        error={error}
        onSubmit={submit}
      />
    </div>
  );
}
