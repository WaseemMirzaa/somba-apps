"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import {
  ArrowRight,
  ExternalLink,
  Shield,
  Store,
  Warehouse,
  Bike,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { PORTALS, PORTAL_GROUPS, PORTAL_SECTION } from "@/lib/product-landing";
import { getPortalCTA } from "@/lib/portal-access";
import type { UserRole } from "@/lib/portal-access";
import { cn } from "@/lib/utils";

const ICONS = { Shield, Store, Warehouse, Bike, ShoppingBag } as const;

const ITEM_ICONS = ["CircleCheck", "CheckCircle2", "BadgeCheck", "Sparkles"] as const;

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const icons = LucideIcons as unknown as Record<string, LucideIcon>;
  const Icon = icons[name] ?? LucideIcons.Circle;
  return <Icon className={className} />;
}

type Props = {
  fr: boolean;
  role: UserRole;
  isAuthenticated: boolean;
  authReady: boolean;
  personaPortal?: string;
  initialPortalId?: string;
};

export function PortalExplorer({
  fr,
  role,
  isAuthenticated,
  authReady,
  personaPortal,
  initialPortalId,
}: Props) {
  const [groupId, setGroupId] = useState<(typeof PORTAL_GROUPS)[number]["id"]>("shopper");
  const [active, setActive] = useState("shop");

  const group = PORTAL_GROUPS.find((g) => g.id === groupId) ?? PORTAL_GROUPS[0];
  const groupPortalIds = group.portalIds as readonly string[];

  useEffect(() => {
    if (initialPortalId) {
      const targetGroup = PORTAL_GROUPS.find((g) =>
        (g.portalIds as readonly string[]).includes(initialPortalId)
      );
      if (targetGroup) {
        setGroupId(targetGroup.id);
        setActive(initialPortalId);
      }
    }
  }, [initialPortalId]);

  useEffect(() => {
    if (!groupPortalIds.includes(active)) {
      setActive(groupPortalIds[0]);
    }
  }, [groupId, active, groupPortalIds]);

  const portal = PORTALS.find((p) => p.id === active) ?? PORTALS[0];
  const Icon = ICONS[portal.icon as keyof typeof ICONS];
  const cta = authReady
    ? getPortalCTA(portal.id, role, isAuthenticated, personaPortal)
    : {
        href: portal.id === "seller" ? "/sell-online" : portal.id === "shop" ? "/shop/products" : "/login",
        labelEn: portal.id === "shop" ? "Start shopping" : portal.id === "seller" ? "Sell online" : "Staff sign in",
        labelFr: portal.id === "shop" ? "Acheter maintenant" : portal.id === "seller" ? "Vendre en ligne" : "Connexion équipe",
      };

  return (
    <div id="portal-explorer" className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-xl">
      <div className="border-b border-[var(--border)] bg-slate-50/80 px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {fr ? PORTAL_SECTION.explorerLabelFr : PORTAL_SECTION.explorerLabel}
        </p>
      </div>

      {/* Audience groups */}
      <div className="flex gap-2 overflow-x-auto border-b border-[var(--border)] p-3">
        {PORTAL_GROUPS.map((g) => {
          const GroupIcon = ICONS[g.icon as keyof typeof ICONS] ?? Shield;
          const isActive = g.id === groupId;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroupId(g.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all",
                isActive
                  ? "bg-[var(--primary)] text-white shadow-md"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-[var(--primary)]/30"
              )}
            >
              <GroupIcon className="h-4 w-4" />
              {fr ? g.labelFr : g.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tabs for operations group */}
      {groupPortalIds.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)] bg-white px-3 py-2">
          {groupPortalIds.map((pid) => {
            const p = PORTALS.find((x) => x.id === pid)!;
            const TabIcon = ICONS[p.icon as keyof typeof ICONS];
            return (
              <button
                key={pid}
                type="button"
                onClick={() => setActive(pid)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                  active === pid
                    ? "bg-blue-50 text-[var(--primary)]"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                )}
              >
                <TabIcon className="h-3.5 w-3.5" />
                {fr ? p.nameFr : p.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid lg:grid-cols-5">
        <div className="relative border-b border-[var(--border)] lg:col-span-2 lg:border-b-0 lg:border-r">
          <div className="relative h-56 lg:h-full lg:min-h-[320px]">
            <Image src={portal.image} alt={portal.name} fill className="object-cover" sizes="(max-width: 1024px) 100vw, 40vw" />
            <div className="absolute inset-0 bg-[var(--primary)]/45" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/95 via-slate-900/40 to-slate-900/10 lg:bg-gradient-to-r" />
            <div className="absolute inset-0 flex flex-col justify-end p-8 text-white">
              <span className="inline-flex w-fit rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-white/25">
                {fr ? portal.audienceLabelFr : portal.audienceLabel}
              </span>
              <div className="mt-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[var(--primary)] shadow-xl">
                <Icon className="h-7 w-7" />
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-white/70">
                {fr ? portal.taglineFr : portal.tagline}
              </p>
              <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold">
                {fr ? portal.nameFr : portal.name}
              </h3>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/85">{fr ? portal.descFr : portal.desc}</p>

              {"subscription" in portal && portal.subscription && (
                <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-400/90 px-3 py-1 text-xs font-bold text-amber-950">
                  <DynamicIcon name="CreditCard" className="h-3.5 w-3.5" />
                  {fr ? "Abonnement vendeur requis" : "Seller subscription required"}
                </span>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                {portal.trust.map((t) => (
                  <span
                    key={t.label}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-white ring-1 ring-white/20 backdrop-blur"
                  >
                    <DynamicIcon name={t.icon} className="h-3.5 w-3.5" />
                    {fr ? t.labelFr : t.label}
                  </span>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <Link href={cta.href} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[var(--primary)] shadow-lg hover:bg-white/95">
                  {fr ? cta.labelFr : cta.labelEn}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                {"appHref" in portal && portal.appHref && (
                  <a
                    href={portal.appHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/25 hover:bg-white/25"
                  >
                    {fr ? "Télécharger l'app" : "Get the app"}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-50 to-blue-50/40 p-6 lg:col-span-3 lg:p-8">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {fr ? "Fonctionnalités incluses" : "What's included"}
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {portal.modules.map((mod) => (
              <div
                key={mod.name}
                className="group rounded-xl border border-white bg-white p-5 shadow-sm transition-all hover:border-[var(--primary)]/20 hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary-light)] text-[var(--primary)] transition-colors group-hover:bg-[var(--primary)] group-hover:text-white">
                    <DynamicIcon name={mod.icon} className="h-5 w-5" />
                  </div>
                  <h4 className="font-semibold text-slate-900">{fr ? mod.nameFr : mod.name}</h4>
                </div>
                <ul className="mt-4 space-y-2">
                  {mod.items.map((item, i) => (
                    <li key={item} className="flex items-start gap-2.5 text-xs text-slate-600">
                      <DynamicIcon
                        name={ITEM_ICONS[i % ITEM_ICONS.length]}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--primary)]"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
