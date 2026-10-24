"use client";

import { useEffect, useRef } from "react";
import { onLocaleChoice, useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { useSocketEvent } from "@/lib/shop-live";
import type { Locale } from "@/lib/i18n";

/**
 * Keeps the UI language and the account's language together (L14), renders nothing:
 *  - signing in: a browser that never chose a language follows the account's `locale`;
 *  - the person toggles the language while signed in: `me:update { locale }` saves it on the account;
 *  - the language changes on another device (`me:updated`): a browser that never chose follows it;
 *  - signing out forgets the account's language so the next visitor starts in French.
 */
export function LocaleAccountSync() {
  const { user, status } = useRealtime();
  const { hasChosen, adoptAccountLocale } = useLocale();
  const { toast } = useToast();
  const signedIn = !!user && status === "connected";
  const accountLocale = user?.locale;
  const hadUser = useRef(false);

  // Sign-in: follow the account (unless this browser has its own choice).
  useEffect(() => {
    if (!user) return;
    hadUser.current = true;
    if (accountLocale === "en" || accountLocale === "fr") adoptAccountLocale(accountLocale);
  }, [user, accountLocale, adoptAccountLocale]);

  // Sign-out: drop the cached account language.
  useEffect(() => {
    if (user || !hadUser.current) return;
    hadUser.current = false;
    adoptAccountLocale(null);
  }, [user, adoptAccountLocale]);

  // The account's language changed elsewhere.
  useSocketEvent<{ locale?: Locale }>("me:updated", (u) => {
    if (!hasChosen && (u.locale === "en" || u.locale === "fr")) adoptAccountLocale(u.locale);
  });

  // The person picked a language here: save it on the account.
  useEffect(() => {
    return onLocaleChoice((next) => {
      if (!signedIn) return;
      socketClient.request("me:update", { locale: next }).catch(() => {
        toast(
          next === "fr"
            ? "Langue appliquée ici, mais pas enregistrée sur votre compte."
            : "Language applied here, but not saved on your account.",
          "error",
        );
      });
    });
  }, [signedIn, toast]);

  return null;
}
