"use client";

import Link from "next/link";
import { BRAND, LEGAL_LINKS } from "@/lib/config";
import { useLocale } from "@/context/locale-context";
import { usePublicSettings } from "@/lib/shop-live";

export default function ShippingPolicyPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const s = usePublicSettings();
  const usd = (n: number) => `$${n.toLocaleString(fr ? "fr-FR" : "en-GB", { maximumFractionDigits: 2 })}`;
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose prose-slate">
      <h1>{fr ? "Politique d'expédition" : "Shipping Policy"}</h1>
      <p className="text-sm text-slate-500">{BRAND.legalEntity} · {BRAND.legalAddress}</p>
      <p>{fr
        ? `Cette politique explique comment ${BRAND.name} livre vos commandes.`
        : `This policy explains how ${BRAND.name} delivers your orders.`}</p>
      <h2>{fr ? "1. Livraison par l'entrepôt de votre zone" : "1. Delivery from your area's warehouse"}</h2>
      <p>{fr
        ? "Nous livrons dans les villes et communes que nos entrepôts desservent ; les autres zones affichent « bientôt » et ne peuvent pas encore commander. Chaque zone dépend d'un seul entrepôt : un livreur de l'entrepôt de la zone du vendeur collecte le colis, qui est ensuite acheminé jusqu'à l'entrepôt de votre zone (trois étapes au plus : collecte chez le vendeur, transfert entre entrepôts si nécessaire, livraison à votre porte). Si le vendeur et vous dépendez du même entrepôt, il n'y a pas de transfert."
        : "We deliver to the cities and communes our warehouses serve; other areas show “coming soon” and cannot order yet. Each area belongs to one warehouse: a rider from the warehouse serving the seller's area collects the parcel, and it then travels to the warehouse serving your area (at most three legs: pickup at the seller, a transfer between warehouses when needed, and delivery to your door). If the seller and you share the same warehouse, there is no transfer."}</p>
      <h2>{fr ? "2. Votre adresse doit être épinglée" : "2. Your address must be pinned"}</h2>
      <p>{fr
        ? "Pour trouver votre zone, calculer le trajet et les frais, votre adresse de livraison doit être placée sur la carte. Sans épingle, la commande ne peut pas être passée."
        : "To find your area and work out the route and the fee, your delivery address must be pinned on the map. Without a pin the order cannot be placed."}</p>
      <h2>{fr ? "3. Frais de livraison" : "3. Delivery fees"}</h2>
      <p>{fr
        ? `Les frais se composent d'un montant de base (${usd(s.deliveryBaseUsd)}) plus ${usd(s.deliveryPerKmUsd)} par kilomètre entre l'entrepôt de livraison et votre adresse, plafonnés à ${usd(s.deliveryMaxUsd)}. Lorsqu'un colis doit voyager d'un entrepôt à un autre, un supplément de transfert de ${usd(s.deliveryTransferUsd)} s'ajoute. Le montant exact est calculé et affiché avant le paiement, et c'est celui qui est facturé.`
        : `The fee is a base amount (${usd(s.deliveryBaseUsd)}) plus ${usd(s.deliveryPerKmUsd)} per kilometre between the delivery warehouse and your address, capped at ${usd(s.deliveryMaxUsd)}. When a parcel has to travel from one warehouse to another, a transfer surcharge of ${usd(s.deliveryTransferUsd)} is added. The exact amount is worked out and shown before you pay, and that is what you are charged.`}</p>
      <h2>{fr ? "4. Délais" : "4. Delivery times"}</h2>
      <p>{fr
        ? "Le délai estimé est indiqué sur chaque fiche produit : il comprend le délai de livraison du vendeur et son délai de préparation. Il court à partir de la confirmation du paiement. Une boutique en vacances ne prend pas de nouvelles commandes jusqu'à son retour."
        : "The estimated time is shown on each product page: it includes the seller's delivery time and their handling time. It starts once your payment is confirmed. A store on vacation does not take new orders until it is back."}</p>
      <h2>{fr ? "5. Suivi et code de remise" : "5. Tracking and handover code"}</h2>
      <p>{fr
        ? "Vous suivez le trajet de votre colis en direct depuis votre compte. Lorsque le code de remise est activé, un code à 4 chiffres s'affiche sur votre commande pendant la livraison : donnez-le au livreur uniquement à la réception du colis."
        : "You follow your parcel's journey live from your account. When the handover code is enabled, a 4-digit code appears on your order while it is on its way: give it to the rider only when you receive the parcel."}</p>
      <h2>{fr ? "6. Livraison manquée" : "6. Failed delivery"}</h2>
      <p>{fr
        ? "Si la livraison échoue (client absent, adresse introuvable), une nouvelle tentative est programmée par l'entrepôt. Après 3 tentatives échouées, la commande est annulée et remboursée."
        : "If a delivery fails (customer absent, address not found), the warehouse schedules another attempt. After 3 failed attempts the order is cancelled and refunded."}</p>
      <h2>{fr ? "7. Paiement à la livraison" : "7. Cash on delivery"}</h2>
      <p>{fr
        ? "Lorsqu'il est proposé à la caisse, vous payez le livreur en espèces à la réception."
        : "Where offered at checkout, you pay the rider in cash when the parcel arrives."}</p>
      <h2>{fr ? "8. Besoin d'aide ?" : "8. Need help?"}</h2>
      <p>{BRAND.supportEmail}</p>
      <nav className="mt-12 flex flex-wrap gap-4 text-sm">
        {LEGAL_LINKS.map((l) => <Link key={l.href} href={l.href} className="text-[var(--primary)] hover:underline">{fr ? l.labelFr : l.label}</Link>)}
      </nav>
    </div>
  );
}
