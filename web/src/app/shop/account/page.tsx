"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Package,
  MapPin,
  Heart,
  Headphones,
  ChevronRight,
  User,
  Bell,
  RotateCcw,
  HelpCircle,
  Zap,
  Wallet,
  LogOut,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { VerificationCard, VerificationNotice } from "@/components/shop/verification";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { MOBILE_MONEY_METHODS, paymentMethodName, useSocketEvent, useVerificationStatus, isVerificationError } from "@/lib/shop-live";
import type { BackendUser, Payment } from "@/lib/realtime/types";

const menuItems = [
  { href: "/shop/orders", icon: Package, title: { en: "My orders", fr: "Mes commandes" }, desc: { en: "Track & manage orders", fr: "Suivre et gérer les commandes" } },
  { href: "/shop/returns", icon: RotateCcw, title: { en: "My returns", fr: "Mes retours" }, desc: { en: "Return requests and their status", fr: "Demandes de retour et leur statut" } },
  { href: "/shop/wishlist", icon: Heart, title: { en: "Wishlist", fr: "Liste de souhaits" }, desc: { en: "Saved items", fr: "Articles enregistrés" } },
  { href: "/shop/account/addresses", icon: MapPin, title: { en: "Addresses", fr: "Adresses" }, desc: { en: "Your delivery addresses", fr: "Vos adresses de livraison" } },
  { href: "/shop/notifications", icon: Bell, title: { en: "Notifications", fr: "Notifications" }, desc: { en: "Order and account updates", fr: "Mises à jour de commandes et de compte" } },
  { href: "/shop/support", icon: Headphones, title: { en: "Support", fr: "Support" }, desc: { en: "Open or follow a ticket", fr: "Ouvrir ou suivre un ticket" } },
  { href: "/shop/help", icon: HelpCircle, title: { en: "Help", fr: "Aide" }, desc: { en: "FAQ & account deletion", fr: "FAQ et suppression de compte" } },
  { href: "/shop/deals", icon: Zap, title: { en: "Flash deals", fr: "Ventes flash" }, desc: { en: "Limited-time offers", fr: "Offres limitées" } },
  ];

function ProfileCard() {
  const { locale, setLocale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { toast } = useToast();
  // The realtime context keeps the sign-in snapshot; track later edits locally (+ `me:updated` pushes).
  const [shown, setShown] = useState<BackendUser>(rt.user as BackendUser);
  useSocketEvent<BackendUser>("me:updated", (u) => setShown((cur) => ({ ...cur, ...u })));
  const user = shown;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [lang, setLang] = useState<"en" | "fr">(user.locale ?? "en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError(fr ? "Le nom est obligatoire." : "Name is required.");
      return;
    }
    setBusy(true);
    try {
      const saved = await socketClient.request<BackendUser>("me:update", { name: name.trim(), phone: phone.trim() || null, locale: lang });
      setShown((cur) => ({ ...cur, ...saved }));
      setLocale(lang);
      setEditing(false);
      toast(fr ? "Profil mis à jour" : "Profile updated");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-premium p-6">
      <div className="flex items-center gap-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
          <User className="h-8 w-8" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-slate-900">{user.name}</h2>
          <p className="truncate text-sm text-slate-500">{user.email}{user.phone ? ` · ${user.phone}` : ""}</p>
        </div>
        {!editing && (
          <Button variant="secondary" size="sm" onClick={() => { setName(user.name); setPhone(user.phone ?? ""); setLang(user.locale ?? "en"); setEditing(true); }}>
            {fr ? "Modifier" : "Edit"}
          </Button>
        )}
      </div>

      {editing && (
        <div className="mt-5 space-y-3 border-t border-[var(--border)] pt-5">
          <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Nom complet" : "Full name"} value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input-premium w-full px-4 py-2 text-sm" type="tel" placeholder={fr ? "Téléphone" : "Phone"} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <select className="input-premium w-full px-4 py-2 text-sm" value={lang} onChange={(e) => setLang(e.target.value as "en" | "fr")}>
            <option value="en">English</option>
            <option value="fr">Français</option>
          </select>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy}>{busy ? "…" : fr ? "Enregistrer" : "Save"}</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>{fr ? "Annuler" : "Cancel"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function WalletCard() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>(MOBILE_MONEY_METHODS[0].id);
  const [phone, setPhone] = useState(rt.user?.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const verification = useVerificationStatus();

  // Live status of the top-up we just started (payment:updated push).
  const payment = reference ? rt.payments.find((p) => p.reference === reference) : undefined;
  const failureReason = (payment as (Payment & { failureReason?: string | null }) | undefined)?.failureReason;

  async function topUp() {
    setError(null);
    const value = Number(amount);
    if (!(value > 0)) {
      setError(fr ? "Saisissez un montant valide." : "Enter a valid amount.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 9) {
      setError(fr ? "Saisissez le numéro Mobile Money." : "Enter the mobile-money number.");
      return;
    }
    setBusy(true);
    try {
      const p = await socketClient.request<Payment>("wallet:topup", { amountUsd: value, method, phone: phone.trim() });
      setReference(p.reference);
      setAmount("");
      toast(fr ? "Demande envoyée sur votre téléphone" : "Request sent to your phone", "info");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const recent = rt.walletTransactions.slice(0, 4);

  return (
    <div className="card-premium space-y-4 p-6">
      <div className="flex items-center gap-4">
        <div className="rounded-xl bg-emerald-50 p-3"><Wallet className="h-5 w-5 text-emerald-600" /></div>
        <div className="flex-1">
          <p className="text-sm text-slate-500">{fr ? "Portefeuille Somba" : "Somba wallet"}</p>
          <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-slate-900">${rt.walletBalance.toFixed(2)}</p>
        </div>
        <Button size="sm" onClick={() => setOpen((v) => !v)}>{fr ? "Recharger" : "Top up"}</Button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-[var(--border)] pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="input-premium w-full px-4 py-2 text-sm" type="number" min="1" step="0.01" placeholder={fr ? "Montant (USD)" : "Amount (USD)"} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <select className="input-premium w-full px-4 py-2 text-sm" value={method} onChange={(e) => setMethod(e.target.value)}>
              {MOBILE_MONEY_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <input className="input-premium w-full px-4 py-2 text-sm" type="tel" placeholder="+243 8X XXX XXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
          {(verification.blocked || isVerificationError(error)) ? (
            <VerificationNotice status={verification} serverMessage={isVerificationError(error) ? error : null} />
          ) : (
            error && <p role="alert" className="text-sm text-red-600">{error}</p>
          )}
          <Button onClick={topUp} disabled={busy || verification.blocked}>{busy ? "…" : fr ? "Envoyer la demande" : "Send request"}</Button>
        </div>
      )}

      {reference && (
        <div role="status" className={`rounded-xl p-3 text-sm ${payment?.status === "succeeded" ? "bg-emerald-50 text-emerald-800" : payment?.status === "failed" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-800"}`}>
          {payment?.status === "succeeded"
            ? (fr ? "Rechargement confirmé : votre solde est à jour." : "Top-up confirmed: your balance is updated.")
            : payment?.status === "failed"
              ? (failureReason || (fr ? "Le rechargement n'a pas été approuvé." : "The top-up was not approved."))
              : (fr
                ? `Approuvez la demande ${paymentMethodName(method, true)} sur votre téléphone. Cette page se met à jour automatiquement.`
                : `Approve the ${paymentMethodName(method, false)} request on your phone. This updates automatically.`)}
        </div>
      )}

      {recent.length > 0 && (
        <ul className="divide-y divide-[var(--border)] text-sm">
          {recent.map((t) => (
            <li key={t.id} className="flex justify-between py-2">
              <span className="truncate text-slate-600">{t.description}</span>
              <span className={t.type === "debit" ? "text-red-600" : "text-emerald-600"}>{t.type === "debit" ? "-" : "+"}${Math.abs(t.amount).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AccountContent() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { logout } = useAuth();
  const router = useRouter();

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("myAccount")}
        breadcrumbs={[
          { label: fr ? "Boutique" : "Shop", href: "/" },
          { label: t("myAccount") },
        ]}
      />

      <ProfileCard />
      <VerificationCard />
      <WalletCard />

      <div className="grid gap-3">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="card-premium flex items-center gap-4 p-5 transition-colors hover:border-blue-200"
          >
            <div className="rounded-xl bg-blue-50 p-3">
              <item.icon className="h-5 w-5 text-[var(--primary)]" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900">{fr ? item.title.fr : item.title.en}</p>
              <p className="text-sm text-slate-500">{fr ? item.desc.fr : item.desc.en}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-400" />
          </Link>
        ))}
      </div>

      <Button
        variant="secondary"
        className="w-full"
        onClick={() => {
          logout();
          router.push("/");
        }}
      >
        <LogOut className="h-4 w-4" />
        {fr ? "Se déconnecter" : "Sign out"}
      </Button>
    </div>
  );
}

export default function ShopAccountPage() {
  return (
    <RequireSignIn next="/shop/account">
      <AccountContent />
    </RequireSignIn>
  );
}
