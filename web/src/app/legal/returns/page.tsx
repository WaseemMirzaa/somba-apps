"use client";

import Link from "next/link";
import { BRAND, LEGAL_LINKS } from "@/lib/config";
import { useLocale } from "@/context/locale-context";

export default function ReturnsPolicyPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose prose-slate">
      <h1>{fr ? "Politique de retour" : "Return Policy"}</h1>
      <p className="text-sm text-slate-500">{BRAND.legalEntity} · {BRAND.legalAddress}</p>
      <p>{fr
        ? `Chez ${BRAND.name}, vous pouvez retourner un article livré dans un délai de 7 jours après la livraison.`
        : `At ${BRAND.name}, you can return a delivered item within 7 days of delivery.`}</p>
      <h2>{fr ? "1. Comment demander un retour" : "1. How to request a return"}</h2>
      <p>{fr
        ? "Ouvrez la commande concernée dans votre compte, choisissez « Retour », sélectionnez les articles et le motif. Vous recevez une référence de retour et pouvez suivre son statut dans « Mes retours »."
        : "Open the order in your account, choose “Return”, then select the items and the reason. You receive a return reference and can follow its status under “My returns”."}</p>
      <h2>{fr ? "2. Conditions" : "2. Conditions"}</h2>
      <p>{fr
        ? "L'article doit être dans l'état où vous l'avez reçu, avec ses accessoires et son emballage. Une seule demande de retour peut être ouverte à la fois pour une commande."
        : "The item must be in the condition you received it, with its accessories and packaging. Only one open return request is allowed per order at a time."}</p>
      <h2>{fr ? "3. Inspection et remboursement" : "3. Inspection and refund"}</h2>
      <p>{fr
        ? "Une fois le colis reçu et contrôlé à notre entrepôt, votre demande est examinée. Si elle est acceptée, le remboursement est effectué sur le moyen de paiement d'origine ou sur votre portefeuille Somba. Aucun remboursement n'est émis avant la réception des articles retournés."
        : "Once the parcel reaches our warehouse and is checked, your request is reviewed. If accepted, the refund goes to the original payment method or to your Somba wallet. No refund is issued before the returned goods are received."}</p>
      <h2>{fr ? "4. Livraison colis ouvert" : "4. Open-box delivery"}</h2>
      <p>{fr
        ? "Lorsque l'option est disponible, vous pouvez inspecter le colis à la livraison. En cas de refus, signalez-le au livreur ou ouvrez un ticket de support."
        : "Where the option is available, you may inspect the parcel at delivery. If you refuse it, tell the rider or open a support ticket."}</p>
      <h2>{fr ? "5. Besoin d'aide ?" : "5. Need help?"}</h2>
      <p>{fr ? "Contactez-nous via le support de votre compte ou à " : "Contact us through support in your account or at "}{BRAND.supportEmail}.</p>
      <nav className="mt-12 flex flex-wrap gap-4 text-sm">
        {LEGAL_LINKS.map((l) => <Link key={l.href} href={l.href} className="text-[var(--primary)] hover:underline">{fr ? l.labelFr : l.label}</Link>)}
      </nav>
    </div>
  );
}
