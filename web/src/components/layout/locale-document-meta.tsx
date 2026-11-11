"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "@/context/locale-context";
import { SITE_META as COPY } from "@/lib/site-meta";

/**
 * The page title and description follow the UI language. The server can only render the default language (French:
 * the choice lives in the browser), so this swaps the document title, description and share tags to the visitor's
 * language after load and keeps them there: Next writes the server's tags again after hydration and after each
 * navigation, so a small observer puts the right language back whenever that happens.
 */
export function LocaleDocumentMeta() {
  const { locale } = useLocale();
  const pathname = usePathname();
  useEffect(() => {
    const c = COPY[locale];
    const set = (selector: string, value: string) => {
      const el = document.querySelector(selector);
      if (el && el.getAttribute("content") !== value) el.setAttribute("content", value);
    };
    const apply = () => {
      // A page that sets its own title keeps it: only the site-wide titles are swapped.
      const isSiteTitle = document.title === COPY.en.title || document.title === COPY.fr.title || document.title === "";
      if (isSiteTitle && document.title !== c.title) document.title = c.title;
      set('meta[name="description"]', c.description);
      set('meta[property="og:title"]', c.title);
      set('meta[property="og:description"]', c.description);
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["content"] });
    return () => observer.disconnect();
  }, [locale, pathname]);
  return null;
}
