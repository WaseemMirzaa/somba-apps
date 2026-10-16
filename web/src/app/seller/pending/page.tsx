"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { useStoreGate } from "@/lib/seller";

export default function SellerPendingPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { state, seller } = useStoreGate();

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <Clock className="mx-auto h-16 w-16 text-amber-500" />
      <h1 className="mt-4 text-2xl font-bold">{fr ? "En attente d'approbation" : "Pending Approval"}</h1>
      {seller && (
        <p className="mt-1 text-sm font-medium text-slate-700">
          {seller.name} · {fr ? "statut" : "status"}: <span className="uppercase">{state}</span>
        </p>
      )}
      <p className="mt-2 text-slate-600">
        {fr
          ? "Votre demande est dans la file de la modération. Cette page se met à jour dès qu'une décision est prise ; vous serez aussi notifié."
          : "Your application is in the moderation queue. This page updates as soon as a decision is made, and you will be notified."}
      </p>
      <p className="mt-2 text-xs text-slate-500">
        {fr
          ? "En attendant, vous pouvez renseigner l'adresse de collecte dans les paramètres."
          : "Meanwhile you can fill in your pickup address in Settings."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm">
        <Link href="/seller/settings" className="text-[var(--primary)] hover:underline">
          {fr ? "Paramètres" : "Settings"}
        </Link>
        <Link href="/seller/support" className="text-[var(--primary)] hover:underline">
          {fr ? "Contacter le support" : "Contact support"}
        </Link>
      </div>
    </div>
  );
}
