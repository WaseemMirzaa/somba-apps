"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { useLocale } from "@/context/locale-context";

export default function SellerPendingPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <Clock className="mx-auto h-16 w-16 text-amber-500" />
      <h1 className="mt-4 text-2xl font-bold">{fr ? "En attente d'approbation" : "Pending Approval"}</h1>
      <p className="mt-2 text-slate-600">
        {fr ? "Votre inscription est en file d'attente. Un administrateur l'examinera sous 24-48h." : "Your registration is in the queue. An admin will review within 24-48h."}
      </p>
      <Link href="/seller/resubmit" className="mt-6 inline-block text-sm text-[var(--primary)] hover:underline">
        {fr ? "Mettre à jour les informations" : "Update information"}
      </Link>
    </div>
  );
}
