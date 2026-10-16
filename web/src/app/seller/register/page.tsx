"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import type { Seller } from "@/lib/realtime/types";
import { errMessage } from "@/lib/seller-labels";

export default function SellerRegisterPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { toast } = useToast();
  const router = useRouter();
  const isSeller = rt.user?.role === "seller";
  const ready = isSeller && rt.status === "connected";

  const [checking, setChecking] = useState(true);
  const [name, setName] = useState("");
  const [pickup, setPickup] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A seller that already has a store goes straight to the portal (the gate
  // then sends it to the right page for its approval state).
  useEffect(() => {
    if (!ready) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to check until a seller socket is up
      setChecking(false);
      return;
    }
    let alive = true;
    socketClient
      .request<Seller | null>("sellers:mine")
      .then((s) => {
        if (!alive) return;
        if (s) router.replace("/seller");
        else setChecking(false);
      })
      .catch(() => alive && setChecking(false));
    return () => {
      alive = false;
    };
  }, [ready, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill once the account is known
    if (isSeller && !name && rt.user?.name) setName(rt.user.name);
  }, [isSeller, rt.user?.name, name]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError(fr ? "Le nom de la boutique doit contenir au moins 2 caractères." : "The business name needs at least 2 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await socketClient.request<Seller>("sellers:register", { name: trimmed });
    } catch (err) {
      const msg = errMessage(err);
      setError(msg);
      toast(msg, "error");
      setBusy(false);
      return;
    }
    // The store exists now. The pickup address is a second, separate write.
    if (pickup.trim()) {
      try {
        await socketClient.request("sellers:update", { pickupAddress: pickup.trim() });
      } catch (err) {
        toast(
          (fr ? "Boutique créée, mais l'adresse n'a pas été enregistrée : " : "Store created, but the pickup address was not saved: ") + errMessage(err),
          "error",
        );
      }
    }
    toast(fr ? "Demande envoyée — en attente d'approbation" : "Application sent — waiting for approval");
    router.push("/seller/pending");
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <PageHeader
        title={fr ? "Inscription vendeur" : "Seller Registration"}
        subtitle={fr ? "Ouvrez votre boutique — la modération valide ensuite votre demande" : "Open your store — moderation then reviews your application"}
      />

      {!isSeller ? (
        <div className="card-premium space-y-4 p-6">
          <p className="text-sm text-slate-700">
            {rt.user
              ? fr
                ? "Vous êtes connecté avec un compte qui n'est pas un compte vendeur. Une boutique ne peut être ouverte que depuis un compte vendeur."
                : "You are signed in with an account that is not a seller account. A store can only be opened from a seller account."
              : fr
                ? "Créez d'abord un compte vendeur, puis revenez ici pour ouvrir votre boutique."
                : "Create a seller account first, then come back here to open your store."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/shop/register?role=seller" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
              {fr ? "Créer un compte vendeur" : "Create a seller account"}
            </Link>
            <Link href="/login" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
              {fr ? "Se connecter" : "Sign in"}
            </Link>
          </div>
          <p className="text-xs text-slate-500">
            {fr ? "Aucun document requis pour la demande." : "No documents are required to apply."}
          </p>
        </div>
      ) : checking ? (
        <p className="text-center text-sm text-slate-500">{fr ? "Chargement…" : "Loading…"}</p>
      ) : (
        <form onSubmit={submit} className="card-premium space-y-4 p-6">
          <div>
            <label className="mb-1 block text-sm font-medium">{fr ? "Nom de l'entreprise / boutique" : "Business / store name"}</label>
            <input
              required
              className="input-premium w-full px-4 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{fr ? "Adresse de collecte (optionnel)" : "Pickup address (optional)"}</label>
            <input
              className="input-premium w-full px-4 py-2 text-sm"
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
              maxLength={300}
              placeholder={fr ? "Où les livreurs récupèrent vos colis" : "Where riders collect your parcels"}
            />
            <p className="mt-1 text-xs text-slate-500">
              {fr ? "Vous pourrez la modifier dans les paramètres." : "You can change it later in Settings."}
            </p>
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? (fr ? "Envoi…" : "Sending…") : fr ? "Soumettre ma demande" : "Submit application"}
          </Button>
        </form>
      )}
    </div>
  );
}
