"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Shield,
  Store,
  Warehouse,
  Bike,
  ShoppingBag,
  Check,
  Lock,
  type LucideIcon,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { PORTALS, PLATFORM_MODULES, PORTAL_SECTION } from "@/lib/product-landing";
import { getPortalCTA } from "@/lib/portal-access";
import type { UserRole } from "@/lib/portal-access";
import { cn } from "@/lib/utils";

const PORTAL_ICONS = { Shield, Store, Warehouse, Bike, ShoppingBag } as const;

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const icons = LucideIcons as unknown as Record<string, LucideIcon>;
  const Icon = icons[name] ?? LucideIcons.Circle;
  return <Icon className={className} />;
}

type PortalPremiumProps = {
  fr: boolean;
  role: UserRole;
  isAuthenticated: boolean;
  authReady: boolean;
  personaPortal?: string;
  onExplorePortal?: (portalId: string) => void;
};

function PublicPortalCard({
  portal,
  fr,
  cta,
  large,
}: {
  portal: (typeof PORTALS)[number];
  fr: boolean;
  cta: { href: string; labelEn: string; labelFr: string };
  large?: boolean;
}) {
  const Icon = PORTAL_ICONS[portal.icon as keyof typeof PORTAL_ICONS];

  return (
    <Link
      href={cta.href}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[var(--primary)]/30 hover:shadow-xl",
        large && "md:min-h-[420px]"
      )}
    >
      <div className={cn("relative overflow-hidden", large ? "h-52" : "h-44")}>
        <Image
          src={portal.image}
          alt={fr ? portal.nameFr : portal.name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, 50vw"
        />
        <div className="absolute inset-0 bg-[var(--primary)]/55 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/85 via-slate-900/25 to-transparent" />
        <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--primary)] shadow">
          {fr ? portal.audienceLabelFr : portal.audienceLabel}
        </span>
        <div className="absolute left-4 top-14 flex h-12 w-12 items-center justify-center rounded-xl bg-white/95 text-[var(--primary)] shadow-lg backdrop-blur">
          <Icon className="h-6 w-6" />
        </div>
        {"subscription" in portal && portal.subscription && (
          <span className="absolute right-4 top-4 rounded-full bg-amber-400 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-950 shadow">
            {fr ? "Plans dès 49 $/mois" : "Plans from $49/mo"}
          </span>
        )}
        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/75">
            {fr ? portal.taglineFr : portal.tagline}
          </p>
          <h3 className="mt-1 font-[family-name:var(--font-display)] text-xl font-bold text-white">
            {fr ? portal.nameFr : portal.name}
          </h3>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <p className="text-sm leading-relaxed text-slate-600">{fr ? portal.descFr : portal.desc}</p>
        <ul className="mt-4 space-y-2">
          {portal.features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
              <Check className="h-4 w-4 shrink-0 text-[var(--primary)]" />
              {f}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-2">
          {portal.trust.map((t) => (
            <span
              key={t.label}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-[var(--primary)]"
            >
              <DynamicIcon name={t.icon} className="h-3 w-3" />
              {fr ? t.labelFr : t.label}
            </span>
          ))}
        </div>
        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--primary)] transition-all group-hover:gap-2.5">
          {fr ? cta.labelFr : cta.labelEn}
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

function OpsPortalCard({
  portal,
  fr,
  onExplore,
}: {
  portal: (typeof PORTALS)[number];
  fr: boolean;
  onExplore?: (id: string) => void;
}) {
  const Icon = PORTAL_ICONS[portal.icon as keyof typeof PORTAL_ICONS];

  return (
    <button
      type="button"
      onClick={() => onExplore?.(portal.id)}
      className="group flex w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 text-left transition-all hover:border-[var(--primary)]/25 hover:bg-white hover:shadow-md"
    >
      <div className="relative h-28 overflow-hidden">
        <Image src={portal.image} alt={portal.name} fill className="object-cover opacity-80 transition-transform group-hover:scale-105" sizes="200px" />
        <div className="absolute inset-0 bg-slate-900/50" />
        <div className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg bg-white/90 text-[var(--primary)]">
          <Icon className="h-4 w-4" />
        </div>
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-slate-900/60 px-2 py-0.5 text-[9px] font-bold uppercase text-white backdrop-blur">
          <Lock className="h-2.5 w-2.5" />
          {fr ? portal.audienceLabelFr : portal.audienceLabel}
        </span>
      </div>
      <div className="p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {fr ? portal.taglineFr : portal.tagline}
        </p>
        <h4 className="mt-1 font-semibold text-slate-900">{fr ? portal.nameFr : portal.name}</h4>
        <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">{fr ? portal.descFr : portal.desc}</p>
      </div>
    </button>
  );
}

export function PortalOverviewCards({
  fr,
  role,
  isAuthenticated,
  authReady,
  personaPortal,
  onExplorePortal,
}: PortalPremiumProps) {
  const publicPortals = PORTALS.filter((p) => p.audience === "shopper" || p.audience === "seller");
  const opsPortals = PORTALS.filter((p) => p.audience === "operations");

  return (
    <div className="space-y-10">
      <div>
        <h3 className="mb-5 text-sm font-bold uppercase tracking-wider text-slate-500">
          {fr ? PORTAL_SECTION.publicLabelFr : PORTAL_SECTION.publicLabel}
        </h3>
        <div className="grid gap-6 lg:grid-cols-2">
          {publicPortals.map((portal) => {
            const cta = authReady
              ? getPortalCTA(portal.id, role, isAuthenticated, personaPortal)
              : {
                  href: portal.id === "seller" ? "/sell-online" : portal.loginHref,
                  labelEn: portal.id === "seller" ? "Sell online" : "Start shopping",
                  labelFr: portal.id === "seller" ? "Vendre en ligne" : "Acheter maintenant",
                };
            return <PublicPortalCard key={portal.id} portal={portal} fr={fr} cta={cta} large />;
          })}
        </div>
      </div>

      <div>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            {fr ? PORTAL_SECTION.opsLabelFr : PORTAL_SECTION.opsLabel}
          </h3>
          <Link href="/login" className="text-xs font-semibold text-[var(--primary)] hover:underline">
            {fr ? "Connexion équipe →" : "Staff sign in →"}
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {opsPortals.map((portal) => (
            <OpsPortalCard key={portal.id} portal={portal} fr={fr} onExplore={onExplorePortal} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function PlatformModulesPremium({ fr }: { fr: boolean }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {PLATFORM_MODULES.map((mod) => (
        <Link
          key={mod.id}
          href={mod.href}
          className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--primary)]/20 hover:shadow-xl"
        >
          <div className="grid sm:grid-cols-5">
            <div className="relative h-48 sm:col-span-2 sm:h-auto sm:min-h-[240px]">
              <Image
                src={mod.image}
                alt={fr ? mod.nameFr : mod.name}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, 240px"
              />
              <div className="absolute inset-0 bg-[var(--primary)]/45" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent sm:bg-gradient-to-r" />
              <div className="absolute left-4 top-4 flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[var(--primary)] shadow-md">
                <DynamicIcon name={mod.icon} className="h-5 w-5" />
              </div>
              <div className="absolute bottom-4 left-4 sm:hidden">
                <p className="font-[family-name:var(--font-display)] text-lg font-bold text-white">
                  {fr ? mod.highlightFr : mod.highlight}
                </p>
              </div>
            </div>

            <div className="flex flex-col p-6 sm:col-span-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full bg-[var(--primary-light)] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">
                  {fr ? mod.tagFr : mod.tag}
                </span>
                <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600 sm:inline-flex">
                  {fr ? mod.highlightFr : mod.highlight}
                </span>
              </div>
              <h3 className="mt-3 font-[family-name:var(--font-display)] text-xl font-bold text-slate-900 transition-colors group-hover:text-[var(--primary)]">
                {fr ? mod.nameFr : mod.name}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{fr ? mod.descFr : mod.desc}</p>

              <div className="mt-4 flex flex-wrap gap-2">
                {mod.trust.map((t) => (
                  <span
                    key={t.label}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700"
                  >
                    <DynamicIcon name={t.icon} className="h-3.5 w-3.5 text-[var(--primary)]" />
                    {fr ? t.labelFr : t.label}
                  </span>
                ))}
              </div>

              <span className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-[var(--primary)]">
                {fr ? mod.ctaFr : mod.cta}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
