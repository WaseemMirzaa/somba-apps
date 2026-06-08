"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function AccountDeletePage() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const fr = locale === "fr";

  function requestDeletion() {
    toast(fr ? "Demande de suppression enregistrée (mock)" : "Deletion request submitted (mock)");
    router.push("/shop/help");
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader title={fr ? "Supprimer mon compte" : "Delete My Account"} backHref="/shop/help" />
      <div className="card-premium space-y-4 p-6">
        <p className="text-sm text-slate-600">
          {fr
            ? "Cette action est irréversible. Vos commandes passées seront anonymisées conformément à notre politique de confidentialité."
            : "This action is irreversible. Past orders will be anonymized per our privacy policy."}
        </p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" />
          {fr ? "Je comprends et souhaite supprimer mon compte" : "I understand and want to delete my account"}
        </label>
        <Button onClick={requestDeletion} disabled={!confirmed} className="w-full bg-red-600 hover:bg-red-700">
          {fr ? "Demander la suppression" : "Request Deletion"}
        </Button>
      </div>
    </div>
  );
}
