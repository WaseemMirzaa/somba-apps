"use client";

import { BRAND } from "@/lib/config";
import { useLocale } from "@/context/locale-context";

export default function PrivacyPage() {
  const { locale, t } = useLocale();
  const fr = locale === "fr";

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose prose-slate">
      <h1>{t("privacyPolicy")}</h1>
      <p>{t("privacyIntro")}</p>
      <h2>{t("dataCollection")}</h2>
      <p>{t("dataCollectionDesc")}</p>
      <h2>{t("dataSharing")}</h2>
      <p>{t("dataSharingDesc")}</p>
      <h2>{t("yourRights")}</h2>
      <p>{t("yourRightsDesc")} {fr ? "Contactez" : "Contact"} {BRAND.supportEmail}.</p>
    </div>
  );
}
