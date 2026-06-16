"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

export default function RiderFirstPasswordPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");

  function submit() {
    if (pw !== confirm || pw.length < 8) {
      toast(fr ? "Les mots de passe doivent correspondre (8+ caractères)" : "Passwords must match (8+ chars)");
      return;
    }
    toast(fr ? "Mot de passe défini" : "Password set");
    router.push("/rider/profile");
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-8">
      <PageHeader title={fr ? "Définir votre mot de passe" : "Set Your Password"} subtitle={fr ? "Première connexion" : "First login"} />
      <div className="card-premium space-y-4 p-6">
        <input type="password" className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Nouveau mot de passe" : "New password"} value={pw} onChange={(e) => setPw(e.target.value)} />
        <input type="password" className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Confirmer le mot de passe" : "Confirm password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button onClick={submit} className="w-full">{fr ? "Définir le mot de passe" : "Set Password"}</Button>
      </div>
    </div>
  );
}
