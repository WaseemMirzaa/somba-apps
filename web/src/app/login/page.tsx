"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { BRAND } from "@/lib/config";
import { PERSONAS, useAuth } from "@/context/auth-context";
import { useLocale } from "@/context/locale-context";
import { Button } from "@/components/ui/button";
import { getHomeForRole } from "@/lib/portal-access";
import type { UserRole } from "@/lib/portal-access";
import { type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const ROLE_GROUPS: { id: string; labelKey: TranslationKey; roles: UserRole[] }[] = [
  { id: "customer", labelKey: "roleCustomer", roles: ["customer", "guest"] },
  { id: "seller", labelKey: "roleSeller", roles: ["seller"] },
  { id: "admin", labelKey: "roleAdmin", roles: ["admin"] },
  { id: "warehouse", labelKey: "roleWarehouse", roles: ["warehouse"] },
  { id: "rider", labelKey: "roleRider", roles: ["rider"] },
];

export default function LoginPage() {
  const { login, isAuthenticated, authReady, persona } = useAuth();
  const { t, locale, setLocale } = useLocale();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "guest">("login");
  const [group, setGroup] = useState("admin");

  useEffect(() => {
    if (authReady && isAuthenticated) {
      router.replace(persona.portal || getHomeForRole(persona.role as UserRole));
    }
  }, [authReady, isAuthenticated, persona, router]);

  function enterAs(personaId: string) {
    const p = PERSONAS.find((x) => x.id === personaId);
    login(personaId);
    router.push(p?.portal || getHomeForRole((p?.role ?? "guest") as UserRole));
  }

  const activeRoles = ROLE_GROUPS.find((g) => g.id === group)?.roles ?? [];
  const filteredPersonas = PERSONAS.filter(
    (p) => p.id !== "guest" && activeRoles.includes(p.role as UserRole)
  );

  if (authReady && isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        {t("redirectingDashboard")}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-1 gradient-hero p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold">{BRAND.fullName}</h1>
          <p className="mt-2 text-blue-100">{t("tagline")}</p>
        </div>
        <div className="space-y-3 text-sm text-blue-200/90">
          <p>{t("prototypeDesc")}</p>
          <p className="rounded-lg bg-white/10 p-4">{t("loginRoleIsolationDesc")}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center px-6 py-12 lg:px-16">
        <div className="mx-auto w-full max-w-md space-y-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-slate-900">
                {mode === "login" ? t("signInTitle") : t("continueAsGuest")}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{t("selectRolePortal")}</p>
            </div>
            <div className="flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setLocale("en")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold",
                  locale === "en" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"
                )}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLocale("fr")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold",
                  locale === "fr" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"
                )}
              >
                FR
              </button>
            </div>
          </div>

          <div className="flex gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={cn("flex-1 rounded-lg py-2 text-sm font-semibold", mode === "login" ? "bg-white shadow-sm" : "")}
            >
              {t("loginTab")}
            </button>
            <button
              type="button"
              onClick={() => setMode("guest")}
              className={cn("flex-1 rounded-lg py-2 text-sm font-semibold", mode === "guest" ? "bg-white shadow-sm" : "")}
            >
              {t("guestTab")}
            </button>
          </div>

          {mode === "guest" ? (
            <div className="space-y-4">
              <input className="input-premium w-full px-4 py-3 text-sm" placeholder={t("emailOptional")} />
              <input className="input-premium w-full px-4 py-3 text-sm" placeholder={t("phoneOptional")} />
              <Button onClick={() => enterAs("guest")} className="w-full">{t("continueAsGuestShop")}</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {ROLE_GROUPS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGroup(g.id)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      group === g.id ? "bg-blue-600 text-white" : "border border-blue-200 text-slate-600"
                    )}
                  >
                    {t(g.labelKey)}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                {filteredPersonas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => enterAs(p.id)}
                    className="card-premium flex w-full items-center justify-between p-4 text-left transition-colors hover:border-blue-200"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-500">{p.subRole || p.role} · {p.email}</p>
                      {p.warehouseId && <p className="text-xs text-indigo-600">{p.warehouseId}</p>}
                    </div>
                    <span className="text-xs font-medium text-blue-600">{t("enterPortal")}</span>
                  </button>
                ))}
              </div>
              {group === "seller" && (
                <p className="text-xs text-slate-500">{t("sellerSubscriptionHint")}</p>
              )}
              {group === "warehouse" && (
                <p className="text-xs text-slate-500">{t("warehouseCredentialsHint")}</p>
              )}
            </div>
          )}

          <div className="space-y-2 text-center text-sm">
            <Link
              href={mode === "login" && group === "seller" ? "/seller/register" : "/shop/register"}
              className="block text-blue-600 hover:underline"
            >
              {t("signup")}
              {" — "}
              {mode === "login" && group === "seller" ? t("sellerRegistration") : t("createAccountLink")}
            </Link>
            <Link href="/" className="block text-blue-600 hover:underline">
              ← {t("backToBrand")} {BRAND.name}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
