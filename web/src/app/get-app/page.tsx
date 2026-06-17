"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Smartphone, Truck, ShieldCheck, RotateCcw, ArrowLeft } from "lucide-react";
import { MarketingHeader } from "@/components/landing/marketing-header";
import { MarketingFooter } from "@/components/landing/marketing-footer";
import { BrandMark } from "@/components/landing/brand-mark";
import { useLocale } from "@/context/locale-context";
import { APP_LINKS } from "@/lib/product-landing";

type Platform = "ios" | "android" | "desktop";

export default function GetAppPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || navigator.vendor || "";
    let platform: Platform = "desktop";
    if (/iPad|iPhone|iPod/i.test(ua)) platform = "ios";
    else if (/android/i.test(ua)) platform = "android";

    if (platform === "ios") {
      setRedirecting(true);
      window.location.href = APP_LINKS.ios;
    } else if (platform === "android") {
      setRedirecting(true);
      window.location.href = APP_LINKS.android;
    }
  }, []);

  const features = [
    { icon: Truck, en: "1–3 day delivery with live tracking", fr: "Livraison 1–3 jours avec suivi en direct" },
    { icon: ShieldCheck, en: "Card, wallet & mobile money", fr: "Carte, portefeuille et mobile money" },
    { icon: RotateCcw, en: "Easy 30-day returns", fr: "Retours faciles sous 30 jours" },
  ];

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <MarketingHeader overlay />

      <section className="landing-band relative -mt-[72px] min-h-[88vh] overflow-hidden pt-[72px] text-white">
        <div className="landing-hero-glow absolute -right-24 top-1/4 h-80 w-80 bg-[var(--brand-red)]/30" aria-hidden />
        <div className="relative mx-auto flex min-h-[calc(88vh-72px)] max-w-3xl flex-col items-center justify-center px-4 py-20 text-center">
          <BrandMark tone="light" full />

          <span className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest ring-1 ring-white/20 backdrop-blur-sm">
            <Smartphone className="h-3.5 w-3.5 text-[var(--brand-red)]" />
            {fr ? "Application mobile" : "Mobile app"}
          </span>

          <h1 className="mt-5 font-[family-name:var(--font-display)] text-4xl font-extrabold leading-[1.05] tracking-tight text-balance sm:text-5xl">
            {fr ? "Achetez sur l'app Somba & Teka" : "Shopping happens on the Somba app"}
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/80">
            {redirecting
              ? fr
                ? "Redirection vers la boutique d'applications…"
                : "Taking you to the app store…"
              : fr
                ? "Parcourez, achetez, suivez et retournez vos commandes — directement depuis l'application mobile Somba & Teka."
                : "Browse, buy, track and return your orders — right from the Somba & Teka mobile app."}
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <a
              href={APP_LINKS.ios}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 rounded-xl bg-white px-7 py-4 text-base font-bold text-[var(--primary)] shadow-xl shadow-blue-950/30 transition-transform hover:-translate-y-0.5"
            >
              <Smartphone className="h-5 w-5" />
              {fr ? "App Store" : "Download — App Store"}
            </a>
            <a
              href={APP_LINKS.android}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 rounded-xl bg-white/10 px-7 py-4 text-base font-bold text-white ring-1 ring-white/25 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/15"
            >
              <Smartphone className="h-5 w-5" />
              {fr ? "Google Play" : "Get it — Google Play"}
            </a>
          </div>

          <ul className="mt-10 grid w-full gap-3 text-left sm:grid-cols-3">
            {features.map((f) => (
              <li
                key={f.en}
                className="flex items-start gap-2.5 rounded-xl bg-white/5 px-4 py-3 text-sm text-white/90 ring-1 ring-white/10"
              >
                <f.icon className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                {fr ? f.fr : f.en}
              </li>
            ))}
          </ul>

          <Link href="/" className="mt-10 inline-flex items-center gap-1.5 text-sm font-semibold text-white/70 transition-colors hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            {fr ? "Retour à l'accueil" : "Back to home"}
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
