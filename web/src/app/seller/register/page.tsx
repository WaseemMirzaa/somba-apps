"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { KycForm, EMPTY_KYC, kycPayload, type KycValues } from "@/components/seller/kyc-form";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import type { Seller } from "@/lib/realtime/types";
import { errMessage } from "@/lib/seller-labels";
import { authErrorText } from "@/lib/auth-errors";

export default function SellerRegisterPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { signInReal } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const isSeller = rt.user?.role === "seller";
  const ready = isSeller && rt.status === "connected";

  const [checking, setChecking] = useState(true);
  const [pickup, setPickup] = useState("");
  // Only for a visitor without an account: the seller account is created together with the store.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept in both languages so it follows the language toggle if that is switched after the error.
  const [accountError, setAccountError] = useState<{ en: string; fr: string } | null>(null);

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

  /** The account fields only exist for a visitor without an account. */
  function precheck(): boolean {
    if (rt.user) return true;
    if (!email.trim() || password.length < 8 || fullName.trim().length < 2) {
      setAccountError({
        en: "Enter your name, an email and a password of at least 8 characters.",
        fr: "Renseignez votre nom, un e-mail et un mot de passe d'au moins 8 caractères.",
      });
      return false;
    }
    setAccountError(null);
    return true;
  }

  async function submit(values: KycValues) {
    setBusy(true);
    setError(null);
    if (!rt.user) {
      try {
        const user = await rt.register({ email: email.trim(), password, name: fullName.trim(), role: "seller", locale });
        signInReal(user.role, { name: user.name, email: user.email });
      } catch (err) {
        setAccountError({ en: authErrorText(err, false), fr: authErrorText(err, true) });
        toast(authErrorText(err, fr), "error");
        setBusy(false);
        return;
      }
    }
    try {
      // Documents are uploaded now: uploads need the signed-in account created just above.
      await socketClient.request<Seller>("sellers:register", await kycPayload(values));
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

  const accountFields = !rt.user && (
    <>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="sr-name">{fr ? "Votre nom complet" : "Your full name"}</label>
        <input id="sr-name" className="input-premium w-full px-4 py-2 text-sm" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="sr-email">{fr ? "E-mail" : "Email"}</label>
          <input id="sr-email" type="email" className="input-premium w-full px-4 py-2 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="sr-pw">{fr ? "Mot de passe" : "Password"}</label>
          <input id="sr-pw" type="password" className="input-premium w-full px-4 py-2 text-sm" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </div>
      </div>
      {accountError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{fr ? accountError.fr : accountError.en}</p>}
    </>
  );

  const pickupField = (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor="sr-pickup">{fr ? "Adresse de collecte (optionnel)" : "Pickup address (optional)"}</label>
      <input
        id="sr-pickup"
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
  );

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <div className="flex justify-end">
        <LanguageToggle />
      </div>
      <PageHeader
        title={fr ? "Inscription vendeur" : "Seller Registration"}
        subtitle={fr ? "Ouvrez votre boutique — la modération vérifie vos informations avant l'approbation" : "Open your store — moderation checks your details before approving"}
      />

      {rt.user && !isSeller ? (
        <div className="card-premium space-y-4 p-6">
          <p className="text-sm text-slate-700">
            {fr
              ? "Vous êtes connecté avec un compte qui n'est pas un compte vendeur. Une boutique ne peut être ouverte que depuis un compte vendeur."
              : "You are signed in with an account that is not a seller account. A store can only be opened from a seller account."}
          </p>
          <Link href="/login" className="inline-flex rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
            {fr ? "Se connecter avec un autre compte" : "Sign in with another account"}
          </Link>
        </div>
      ) : checking ? (
        <p className="text-center text-sm text-slate-500">{fr ? "Chargement…" : "Loading…"}</p>
      ) : (
        <KycForm
          initial={{ ...EMPTY_KYC, name: isSeller ? (rt.user?.name ?? "") : "" }}
          submitLabel={rt.user ? (fr ? "Soumettre ma demande" : "Submit application") : fr ? "Créer mon compte et ma boutique" : "Create my account and store"}
          busy={busy}
          error={error}
          top={accountFields}
          bottom={pickupField}
          precheck={precheck}
          onSubmit={submit}
        />
      )}
    </div>
  );
}
