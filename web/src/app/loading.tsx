"use client";

import { FullPageLoader } from "@/components/ui/loader";
import { useLocale } from "@/context/locale-context";

export default function Loading() {
  const { locale } = useLocale();
  return <FullPageLoader locale={locale} label="Loading…" labelFr="Chargement…" />;
}
