"use client";

import { BRAND } from "@/lib/config";
import { useLocale } from "@/context/locale-context";

export default function PrivacyPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose prose-slate">
      <h1>{fr ? "Politique de confidentialité" : "Privacy Policy"}</h1>
      <p>{fr
        ? `${BRAND.legalEntity} (${BRAND.name}) respecte votre vie privée. Cette politique décrit comment nous collectons, utilisons et protégeons les données personnelles des utilisateurs en France et dans le monde.`
        : `${BRAND.legalEntity} (${BRAND.name}) respects your privacy. This policy describes how we collect, use, and protect personal data for users in France and globally.`}</p>
      <h2>{fr ? "Données que nous collectons" : "Data We Collect"}</h2>
      <p>{fr
        ? "Informations de compte, historique des commandes, détails de paiement (tokenisés), adresses de livraison, informations sur l'appareil et communications avec le service client."
        : "Account information, order history, payment details (tokenized), delivery addresses, device information, and customer support communications."}</p>
      <h2>{fr ? "Droits RGPD" : "GDPR Rights"}</h2>
      <p>{fr
        ? `Les résidents de l'UE peuvent demander l'accès, la rectification, l'effacement et la portabilité de leurs données personnelles en contactant ${BRAND.supportEmail}.`
        : `EU residents may request access, rectification, erasure, and portability of personal data by contacting ${BRAND.supportEmail}.`}</p>
    </div>
  );
}
