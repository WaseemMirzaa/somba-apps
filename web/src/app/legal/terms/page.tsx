"use client";

import { BRAND, LEGAL_LINKS } from "@/lib/config";
import Link from "next/link";
import { useLocale } from "@/context/locale-context";

export default function TermsPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose prose-slate">
      <h1>{fr ? "Conditions d'utilisation" : "Terms of Use"}</h1>
      <p className="text-sm text-slate-500">{BRAND.legalEntity} · {BRAND.legalAddress}</p>
      <p>{fr
        ? `Bienvenue sur ${BRAND.name}. Ces conditions d'utilisation régissent votre accès et votre utilisation de la plateforme marketplace ${BRAND.fullName}, y compris notre site web, nos applications mobiles et les services associés.`
        : `Welcome to ${BRAND.name}. These Terms of Use govern your access to and use of the ${BRAND.fullName} marketplace platform, including our website, mobile applications, and related services.`}</p>
      <h2>{fr ? "1. Modèle de marketplace" : "1. Marketplace Model"}</h2>
      <p>{fr
        ? `${BRAND.name} fonctionne comme une plateforme marketplace. Les vendeurs référencent et vendent leur propre stock. ${BRAND.legalEntity} facilite les transactions, les paiements et la logistique selon un modèle de traitement hybride.`
        : `${BRAND.name} operates as a marketplace platform. Sellers list and sell their own inventory. ${BRAND.legalEntity} facilitates transactions, payments, and logistics in a hybrid fulfillment model.`}</p>
      <h2>{fr ? "2. Commandes et paiements" : "2. Orders & Payments"}</h2>
      <p>{fr
        ? "Nous acceptons les paiements par carte Stripe, Airtel Money, le portefeuille Somba et le paiement à la livraison. Les commandes payées à la livraison peuvent nécessiter une vérification par code OTP et sont soumises à des limites de prévention de la fraude."
        : "We support Stripe card payments, Airtel Money, Somba Wallet, and pay at delivery. Pay-at-delivery orders may require OTP verification and are subject to fraud prevention limits."}</p>
      <h2>{fr ? "3. Retours et remboursements" : "3. Returns & Refunds"}</h2>
      <p>{fr
        ? "Les remboursements peuvent être effectués sur le moyen de paiement d'origine ou sur le portefeuille Somba, à votre choix, conformément à notre politique de retour."
        : "Refunds may be issued to the original payment method or Somba Wallet at your choice, subject to our Return Policy."}</p>
      <h2>{fr ? "4. Livraison colis ouvert" : "4. Open Box Delivery"}</h2>
      <p>{fr
        ? "Lorsque disponible, vous pouvez inspecter les produits à la livraison avant de les accepter. Un refus déclenche un retour sans frais."
        : "Where available, you may inspect products at delivery before accepting. Refusal triggers return without charge."}</p>
      <nav className="mt-12 flex flex-wrap gap-4 text-sm">
        {LEGAL_LINKS.map((l) => <Link key={l.href} href={l.href} className="text-[var(--primary)] hover:underline">{fr ? l.labelFr : l.label}</Link>)}
      </nav>
    </div>
  );
}
