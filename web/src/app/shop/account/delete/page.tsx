"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useAuth } from "@/context/auth-context";
import { socketClient } from "@/lib/realtime/socket-client";

function DeleteAccountForm() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const { logout } = useAuth();
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fr = locale === "fr";

  async function requestDeletion() {
    setError(null);
    if (!password) {
      setError(fr ? "Saisissez votre mot de passe pour confirmer." : "Enter your password to confirm.");
      return;
    }
    setBusy(true);
    try {
      await socketClient.request("me:delete", { password });
      toast(fr ? "Votre compte a été supprimé" : "Your account has been deleted");
      logout();
      router.replace("/login");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader title={fr ? "Supprimer mon compte" : "Delete My Account"} backHref="/shop/help" />
      <div className="card-premium space-y-4 p-6">
        <p className="text-sm text-slate-600">
          {fr
            ? "Cette action est irréversible. Vos données personnelles sont effacées ; vos commandes passées sont conservées sous forme anonymisée pour la comptabilité."
            : "This action is irreversible. Your personal data is erased; past orders are kept in anonymised form for accounting."}
        </p>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="del-pw">{fr ? "Mot de passe" : "Password"}</label>
          <input
            id="del-pw"
            type="password"
            autoComplete="current-password"
            className="input-premium w-full px-4 py-2.5 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" />
          {fr ? "Je comprends et souhaite supprimer mon compte" : "I understand and want to delete my account"}
        </label>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <Button onClick={requestDeletion} disabled={!confirmed || busy} className="w-full bg-red-600 hover:bg-red-700">
          {busy ? "…" : fr ? "Supprimer définitivement mon compte" : "Permanently delete my account"}
        </Button>
      </div>
    </div>
  );
}

export default function AccountDeletePage() {
  return (
    <RequireSignIn next="/shop/account/delete">
      <DeleteAccountForm />
    </RequireSignIn>
  );
}
