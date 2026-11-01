"use client";

import Link from "next/link";
import { BRAND, LEGAL_LINKS } from "@/lib/config";
import { useLocale } from "@/context/locale-context";
import { usePublicSettings } from "@/lib/shop-live";

export default function ReturnsPolicyPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const s = usePublicSettings();
  const days = s.returnWindowDays;
  const hours = s.sellerResponseHours;
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose prose-slate">
      <h1>{fr ? "Politique de retour" : "Return Policy"}</h1>
      <p className="text-sm text-slate-500">{BRAND.legalEntity} · {BRAND.legalAddress}</p>
      <p>{days > 0
        ? fr
          ? `Chez ${BRAND.name}, vous pouvez retourner un article livré dans un délai de ${days} jours après la livraison.`
          : `At ${BRAND.name}, you can return a delivered item within ${days} days of delivery.`
        : fr
          ? "Les retours sont fermés pour le moment."
          : "Returns are closed at the moment."}</p>
      <h2>{fr ? "1. Comment demander un retour" : "1. How to request a return"}</h2>
      <p>{fr
        ? "Ouvrez la commande concernée dans votre compte, choisissez « Retour », puis sélectionnez les articles et les quantités, indiquez le motif, ajoutez des photos (jusqu'à 6) et choisissez où recevoir le remboursement (portefeuille Somba ou téléphone Mobile Money). Vous recevez une référence et suivez chaque étape dans « Retours et échanges »."
        : "Open the order in your account, choose “Return”, select the items and quantities, give the reason, add photos (up to 6) and choose where to receive the refund (Somba wallet or mobile-money phone). You receive a reference and follow every step under “Returns and exchanges”."}</p>
      <h2>{fr ? "2. Réponse du vendeur et escalade" : "2. Seller answer and escalation"}</h2>
      <p>{fr
        ? `Le vendeur dispose de ${hours} h pour accepter ou refuser votre retour (en indiquant un motif). S'il refuse ou ne répond pas à temps, vous pouvez demander au support Somba d'examiner votre demande ; c'est lui qui tranche alors.`
        : `The seller has ${hours} h to accept or refuse your return (giving a reason). If they refuse or do not answer in time, you can ask Somba support to review your request, and support then decides.`}</p>
      <h2>{fr ? "3. Collecte et remboursement" : "3. Pickup and refund"}</h2>
      <p>{fr
        ? "Une fois le retour accepté, un livreur de l'entrepôt vient récupérer les articles chez vous et les amène à l'entrepôt ; le colis repart ensuite vers l'entrepôt du vendeur. Dès que les articles sont reçus à l'entrepôt, vous êtes remboursé des seuls articles retournés (remboursement partiel possible) ; seuls les articles revendables sont remis en stock. Aucun remboursement n'est émis avant la réception des articles."
        : "Once the return is accepted, a warehouse rider collects the items from you and brings them to the warehouse; the parcel then travels back to the seller's warehouse. As soon as the items are received at the warehouse, you are refunded for the returned items only (a partial refund is possible); only resellable items go back on the shelf. No refund is issued before the items are received."}</p>
      <h2>{fr ? "4. Un autre problème ?" : "4. A different problem?"}</h2>
      <p>{fr
        ? "Article manquant, abîmé, mauvais article ou commande non reçue : utilisez « Signaler un problème » sur la commande. Le vendeur peut répondre, puis le support décide : remboursement total ou partiel, remplacement, ou refus motivé. Vous pouvez aussi demander un remplacement ou un échange (taille, couleur…) : un livreur apporte le nouvel article et reprend l'ancien lors du même trajet."
        : "Missing or damaged item, wrong item or order not received: use “Report a problem” on the order. The seller can answer, then support decides: full or partial refund, a replacement, or a reasoned refusal. You can also ask for a replacement or an exchange (size, colour…): a rider brings the new item and collects the old one on the same trip."}</p>
      <h2>{fr ? "5. Conditions" : "5. Conditions"}</h2>
      <p>{fr
        ? "L'article doit être dans l'état où vous l'avez reçu, avec ses accessoires et son emballage. Vous ne pouvez pas retourner plus d'unités que vous n'en avez achetées."
        : "The item must be in the condition you received it, with its accessories and packaging. You cannot return more units than you bought."}</p>
      <h2>{fr ? "6. Besoin d'aide ?" : "6. Need help?"}</h2>
      <p>{fr ? "Contactez-nous via le support de votre compte ou à " : "Contact us through support in your account or at "}{BRAND.supportEmail}.</p>
      <nav className="mt-12 flex flex-wrap gap-4 text-sm">
        {LEGAL_LINKS.map((l) => <Link key={l.href} href={l.href} className="text-[var(--primary)] hover:underline">{fr ? l.labelFr : l.label}</Link>)}
      </nav>
    </div>
  );
}
