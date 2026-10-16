"use client";

import Link from "next/link";
import { BRAND, LEGAL_LINKS } from "@/lib/config";
import { useLocale } from "@/context/locale-context";

export default function ShippingPolicyPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose prose-slate">
      <h1>{fr ? "Politique d'expédition" : "Shipping Policy"}</h1>
      <p className="text-sm text-slate-500">{BRAND.legalEntity} · {BRAND.legalAddress}</p>
      <p>{fr
        ? `Cette politique explique comment ${BRAND.name} livre vos commandes.`
        : `This policy explains how ${BRAND.name} delivers your orders.`}</p>
      <h2>{fr ? "1. Zones et frais de livraison" : "1. Delivery zones and fees"}</h2>
      <p>{fr
        ? "Nous livrons dans les zones de livraison actives. Les frais dépendent de la zone choisie à la caisse et sont affichés avant le paiement."
        : "We deliver within our active delivery zones. The fee depends on the zone you choose at checkout and is shown before you pay."}</p>
      <h2>{fr ? "2. Délais" : "2. Delivery times"}</h2>
      <p>{fr
        ? "Le délai estimé est indiqué sur chaque fiche produit (généralement 1 à 3 jours). Il court à partir de la confirmation du paiement."
        : "The estimated time is shown on each product page (usually 1 to 3 days). It starts once your payment is confirmed."}</p>
      <h2>{fr ? "3. Suivi et code de remise" : "3. Tracking and handover code"}</h2>
      <p>{fr
        ? "Vous suivez votre commande en direct depuis votre compte. Lorsque le code de remise est activé, un code à 4 chiffres s'affiche sur votre commande pendant la livraison : donnez-le au livreur uniquement à la réception du colis."
        : "You follow your order live from your account. When the handover code is enabled, a 4-digit code appears on your order while it is on its way: give it to the rider only when you receive the parcel."}</p>
      <h2>{fr ? "4. Livraison manquée" : "4. Failed delivery"}</h2>
      <p>{fr
        ? "Si la livraison échoue (client absent, adresse introuvable), le colis est remis en file pour une nouvelle tentative. Après 3 tentatives échouées, la commande est annulée et remboursée."
        : "If a delivery fails (customer absent, address not found), the parcel is queued for another attempt. After 3 failed attempts the order is cancelled and refunded."}</p>
      <h2>{fr ? "5. Paiement à la livraison" : "5. Cash on delivery"}</h2>
      <p>{fr
        ? "Lorsqu'il est proposé à la caisse, vous payez le livreur en espèces à la réception."
        : "Where offered at checkout, you pay the rider in cash when the parcel arrives."}</p>
      <h2>{fr ? "6. Besoin d'aide ?" : "6. Need help?"}</h2>
      <p>{BRAND.supportEmail}</p>
      <nav className="mt-12 flex flex-wrap gap-4 text-sm">
        {LEGAL_LINKS.map((l) => <Link key={l.href} href={l.href} className="text-[var(--primary)] hover:underline">{fr ? l.labelFr : l.label}</Link>)}
      </nav>
    </div>
  );
}
