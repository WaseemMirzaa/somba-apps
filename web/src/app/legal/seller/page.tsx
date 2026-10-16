"use client";

import Link from "next/link";
import { BRAND, LEGAL_LINKS } from "@/lib/config";
import { useLocale } from "@/context/locale-context";

export default function SellerAgreementPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose prose-slate">
      <h1>{fr ? "Contrat vendeur" : "Seller Agreement"}</h1>
      <p className="text-sm text-slate-500">{BRAND.legalEntity} · {BRAND.legalAddress}</p>
      <p>{fr
        ? `Ce contrat régit la vente de produits par des vendeurs sur la marketplace ${BRAND.fullName}.`
        : `This agreement governs the sale of products by sellers on the ${BRAND.fullName} marketplace.`}</p>
      <h2>{fr ? "1. Compte et boutique" : "1. Account and store"}</h2>
      <p>{fr
        ? "Vous ouvrez une boutique avec un compte vendeur. Les informations fournies (nom, adresse d'enlèvement) doivent être exactes. Nous pouvons suspendre une boutique qui enfreint ce contrat."
        : "You open a store with a seller account. The information you give (name, pickup address) must be accurate. We may suspend a store that breaches this agreement."}</p>
      <h2>{fr ? "2. Annonces" : "2. Listings"}</h2>
      <p>{fr
        ? "Vos annonces doivent décrire fidèlement le produit, son prix et son stock. Les nouvelles annonces peuvent être soumises à modération avant leur mise en ligne. Les produits interdits ou contrefaits sont retirés."
        : "Your listings must describe the product, its price and its stock truthfully. New listings may be moderated before they go live. Prohibited or counterfeit products are removed."}</p>
      <h2>{fr ? "3. Commandes et préparation" : "3. Orders and fulfilment"}</h2>
      <p>{fr
        ? "Vous préparez chaque commande et la marquez « prête » pour l'enlèvement. Un livreur Somba&Teka collecte le colis à votre adresse d'enlèvement ou il est déposé à notre entrepôt, puis livré au client."
        : "You pack each order and mark it “ready” for pickup. A Somba&Teka rider collects the parcel from your pickup address (or it is dropped at our warehouse) and delivers it to the customer."}</p>
      <h2>{fr ? "4. Commission et paiements" : "4. Commission and payouts"}</h2>
      <p>{fr
        ? "Une commission est prélevée sur chaque vente ; son taux est affiché dans votre tableau de bord vendeur. Vos gains deviennent disponibles après la période de validation (livraison et délai de retour). Vous demandez un paiement depuis votre tableau de bord ; il est versé par virement bancaire ou mobile money après approbation."
        : "A commission is deducted from each sale; the rate is shown in your seller dashboard. Your earnings become available after the clearance period (delivery and return window). You request a payout from your dashboard; it is paid by bank transfer or mobile money once approved."}</p>
      <h2>{fr ? "5. Retours et litiges" : "5. Returns and disputes"}</h2>
      <p>{fr
        ? "Les retours sont gérés selon la politique de retour. Un remboursement accordé au client peut être déduit de vos gains sur la commande concernée."
        : "Returns follow the Return Policy. A refund granted to the customer may be deducted from your earnings on the related order."}</p>
      <h2>{fr ? "6. Contact" : "6. Contact"}</h2>
      <p>{BRAND.supportEmail}</p>
      <nav className="mt-12 flex flex-wrap gap-4 text-sm">
        {LEGAL_LINKS.map((l) => <Link key={l.href} href={l.href} className="text-[var(--primary)] hover:underline">{fr ? l.labelFr : l.label}</Link>)}
      </nav>
    </div>
  );
}
