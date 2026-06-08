import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, locale = "en") {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCdf(amount: number, locale = "en") {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency: "CDF",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDualCurrency(
  usd: number,
  locale = "en",
  fxRate?: number
): { usd: string; cdf?: string } {
  const usdFormatted = formatCurrency(usd, locale);
  if (!fxRate) return { usd: usdFormatted };
  return { usd: usdFormatted, cdf: formatCdf(Math.round(usd * fxRate), locale) };
}

export function formatNumber(n: number, locale = "en") {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US").format(n);
}
