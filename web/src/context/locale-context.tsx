"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { type Locale, type TranslationKey, t } from "@/lib/i18n";

/**
 * UI language, EN / FR (default French).
 *
 *  - A choice made in this browser (header toggle, account page) is saved in localStorage and wins on every visit.
 *  - A browser that never chose follows the account's language once someone signs in (the account's value is cached
 *    under a second key so a reload does not flash French first).
 *  - A choice made while signed in is written to the account by <LocaleAccountSync> (`me:update { locale }`).
 *
 * The value lives in an external store (localStorage), read with useSyncExternalStore: the server and the first
 * client render both say French, then React swaps in the saved language without a hydration mismatch.
 */

const CHOICE_KEY = "somba-locale";
const ACCOUNT_KEY = "somba-locale-account";
const DEFAULT_LOCALE: Locale = "fr";

const isLocale = (v: unknown): v is Locale => v === "en" || v === "fr";

function readKey(key: string): Locale | null {
  try {
    const v = window.localStorage.getItem(key);
    return isLocale(v) ? v : null;
  } catch {
    return null; // storage blocked (private window): the in-memory copy below still works for this tab
  }
}
function writeKey(key: string, value: Locale | null) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* storage blocked: the in-memory copy keeps the choice for this tab */
  }
}

const memory: { choice: Locale | null; account: Locale | null } = { choice: null, account: null };
const listeners = new Set<() => void>();
const choiceListeners = new Set<(locale: Locale) => void>();
const notify = () => listeners.forEach((fn) => fn());

function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn); // another tab changed the language
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}

const currentChoice = (): Locale | null => readKey(CHOICE_KEY) ?? memory.choice;
const currentAccount = (): Locale | null => readKey(ACCOUNT_KEY) ?? memory.account;

const getLocale = (): Locale => currentChoice() ?? currentAccount() ?? DEFAULT_LOCALE;
const getServerLocale = (): Locale => DEFAULT_LOCALE;
const getChosen = (): boolean => currentChoice() !== null;

/** Subscribe to language choices made by the person (not to the account's value being adopted). */
export function onLocaleChoice(fn: (locale: Locale) => void): () => void {
  choiceListeners.add(fn);
  return () => {
    choiceListeners.delete(fn);
  };
}

interface LocaleContextType {
  locale: Locale;
  /** The person picked this language (toggle / profile): saved in this browser and, signed in, on the account. */
  setLocale: (locale: Locale, opts?: { skipAccount?: boolean }) => void;
  /** This browser has an explicit choice (so the account's language must not override it). */
  hasChosen: boolean;
  /** Follow the account's language (only does anything while this browser has not chosen). */
  adoptAccountLocale: (locale: Locale | null) => void;
  t: (key: TranslationKey) => string;
}

const LocaleContext = createContext<LocaleContextType | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Q: the entire UI is delivered in French by default — the FR/EN toggle remains.
  const locale = useSyncExternalStore(subscribe, getLocale, getServerLocale);
  const hasChosen = useSyncExternalStore(subscribe, getChosen, () => false);

  // Screen readers and the browser's own translation prompt follow the UI language.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale, opts?: { skipAccount?: boolean }) => {
    memory.choice = next;
    writeKey(CHOICE_KEY, next);
    notify();
    if (!opts?.skipAccount) choiceListeners.forEach((fn) => fn(next));
  }, []);

  const adoptAccountLocale = useCallback((next: Locale | null) => {
    memory.account = next;
    writeKey(ACCOUNT_KEY, next);
    notify();
  }, []);

  const translate = useCallback((key: TranslationKey) => t(locale, key), [locale]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, hasChosen, adoptAccountLocale, t: translate }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
