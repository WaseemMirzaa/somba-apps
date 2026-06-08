"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function SellerResubmitPage() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const fr = locale === "fr";

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8">
      <PageHeader title={fr ? "Resoumettre inscription" : "Resubmit Registration"} subtitle={fr ? "Après un rejet" : "After rejection"} />
      <div className="card-premium space-y-4 p-6">
        <p className="text-sm text-slate-600">{fr ? "Corrigez les informations et resoumettez." : "Correct your information and resubmit."}</p>
        <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Nom de l'entreprise" : "Business name"} defaultValue="My Store" />
        <textarea className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Corrections apportées" : "Corrections made"} rows={3} />
        <Button onClick={() => { toast(fr ? "Resoumis" : "Resubmitted"); router.push("/seller/pending"); }} className="w-full">
          {fr ? "Resoumettre" : "Resubmit"}
        </Button>
      </div>
    </div>
  );
}
