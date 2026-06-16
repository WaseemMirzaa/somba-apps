"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { BRAND } from "@/lib/config";
import { LOGIN_HERO_IMAGE } from "@/lib/product-landing";
import { BrandMark } from "@/components/landing/brand-mark";
import { useAuth, getPersonaDisplayName, getPersonaDisplaySubRole } from "@/context/auth-context";
import { useLocale } from "@/context/locale-context";
import { Button } from "@/components/ui/button";
import { FullPageLoader } from "@/components/ui/loader";
import { getHomeForRole } from "@/lib/portal-access";
import type { UserRole } from "@/lib/portal-access";

const ROLE_GROUPS = [
  { label: "Seller", labelFr: "Vendeur", roles: ["seller"] as UserRole[] },
  { label: "Admin", labelFr: "Admin", roles: ["admin"] as UserRole[] },
  { label: "Warehouse", labelFr: "Entrepôt", roles: ["warehouse"] as UserRole[] },
];

export default function LoginPage() {
  const { login, isAuthenticated, authReady, persona, personas } = useAuth();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "guest">("login");
  const [group, setGroup] = useState("Admin");

  useEffect(() => {
    if (authReady && isAuthenticated) {
      router.replace(persona.portal || getHomeForRole(persona.role as UserRole));
    }
  }, [authReady, isAuthenticated, persona, router]);

  function enterAs(personaId: string) {
    const persona = personas.find((p) => p.id === personaId);
    login(personaId);
    router.push(persona?.portal || getHomeForRole((persona?.role ?? "guest") as UserRole));
  }

  const activeRoles = ROLE_GROUPS.find((g) => g.label === group)?.roles ?? [];
  const filteredPersonas = personas.filter(
    (p) => p.id !== "guest" && activeRoles.includes(p.role as UserRole)
  );

  if (authReady && isAuthenticated) {
    return (
      <FullPageLoader
        locale={locale}
        label="Redirecting to your dashboard…"
        labelFr="Redirection vers votre tableau de bord…"
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Mobile — compact hero banner */}
      <div className="relative h-44 shrink-0 overflow-hidden lg:hidden">
        <Image
          src={LOGIN_HERO_IMAGE.src}
          alt={LOGIN_HERO_IMAGE.alt}
          fill
          priority
          className="object-cover object-center"
          sizes="100vw"
        />
        <div className="login-hero-overlay absolute inset-0" aria-hidden />
        <div className="relative z-10 flex h-full flex-col justify-end p-6 text-white">
          <BrandMark tone="light" full className="mb-2" />
          <p className="text-sm text-white/85">{BRAND.tagline}</p>
        </div>
      </div>

      {/* Desktop — full-height branded panel */}
      <div className="relative hidden flex-1 overflow-hidden lg:flex">
        <Image
          src={LOGIN_HERO_IMAGE.src}
          alt={LOGIN_HERO_IMAGE.alt}
          fill
          priority
          className="object-cover object-center"
          sizes="50vw"
        />
        <div className="login-hero-overlay absolute inset-0" aria-hidden />
        <div className="relative z-10 flex flex-1 flex-col justify-between p-12 text-white">
          <div>
            <BrandMark tone="light" full className="mb-6" />
            <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold">{BRAND.fullName}</h1>
            <p className="mt-2 text-white/85">{BRAND.tagline}</p>
          </div>
          <div className="space-y-3 text-sm text-white/80">
            <p>{t("prototypeDesc")}</p>
            <p className="rounded-lg bg-white/10 p-4 backdrop-blur-sm">
              {fr
                ? "Chaque rôle est isolé : l'Admin gère les entrepôts et voit la logistique uniquement dans Admin. Les vendeurs ont besoin d'un abonnement actif. Le personnel d'entrepôt ne peut pas accéder aux autres portails."
                : "Each role is isolated: Admin manages warehouses and sees fulfillment inside Admin only. Sellers need an active subscription. Warehouse staff cannot cross into other portals."}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center px-6 py-12 lg:px-16">
        <div className="mx-auto w-full max-w-md space-y-8">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-slate-900">
              {mode === "login" ? (fr ? "Se connecter" : "Sign in") : (fr ? "Continuer en tant qu'invité" : "Continue as Guest")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{fr ? "Sélectionnez votre rôle — vous n'accéderez qu'à votre portail" : "Select your role — you will only access your portal"}</p>
          </div>

          <div className="flex gap-2 rounded-xl bg-slate-100 p-1">
            <button onClick={() => setMode("login")} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${mode === "login" ? "bg-white shadow-sm" : ""}`}>{fr ? "Connexion" : "Login"}</button>
            <button onClick={() => setMode("guest")} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${mode === "guest" ? "bg-white shadow-sm" : ""}`}>{fr ? "Invité" : "Guest"}</button>
          </div>

          {mode === "guest" ? (
            <div className="space-y-4">
              <input className="input-premium w-full px-4 py-3 text-sm" placeholder={fr ? "E-mail (facultatif)" : "Email (optional)"} />
              <input className="input-premium w-full px-4 py-3 text-sm" placeholder={fr ? "Téléphone (facultatif)" : "Phone (optional)"} />
              <Button onClick={() => enterAs("guest")} className="w-full">{fr ? "Continuer en tant qu'invité → Boutique" : "Continue as Guest → Shop"}</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {ROLE_GROUPS.map((g) => (
                  <button
                    key={g.label}
                    onClick={() => setGroup(g.label)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${group === g.label ? "bg-[var(--primary)] text-white" : "border border-red-200 text-slate-600"}`}
                  >
                    {fr ? g.labelFr : g.label}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                {filteredPersonas.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => enterAs(p.id)}
                    className="card-premium flex w-full items-center justify-between p-4 text-left transition-colors hover:border-blue-200"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{getPersonaDisplayName(p, fr)}</p>
                      <p className="text-xs text-slate-500">
                        {getPersonaDisplaySubRole(p, fr)} · {p.email}
                      </p>
                      {p.warehouseId && <p className="text-xs text-[var(--primary)]">{p.warehouseId}</p>}
                    </div>
                    <span className="text-xs font-medium text-[var(--primary)]">{fr ? "Entrer →" : "Enter →"}</span>
                  </button>
                ))}
              </div>
              {group === "Seller" && (
                <p className="text-xs text-slate-500">
                  {fr
                    ? "Les vendeurs doivent souscrire un abonnement. Essayez « Fashion Hub » (sans abonnement) ou « TechZone Store » (abonné)."
                    : "Sellers must purchase a subscription. Try “Fashion Hub” (no subscription) or “TechZone Store” (subscribed)."}
                </p>
              )}
              {group === "Warehouse" && (
                <p className="text-xs text-slate-500">{fr ? "Les identifiants d'entrepôt sont émis par l'Admin lors de la création d'un entrepôt." : "Warehouse credentials are issued by Admin when creating a warehouse."}</p>
              )}
            </div>
          )}

          <Link href="/" className="block text-center text-sm text-[var(--primary)] hover:underline">
            ← {fr ? `Retour à ${BRAND.name}` : `Back to ${BRAND.name}`}
          </Link>
        </div>
      </div>
    </div>
  );
}
