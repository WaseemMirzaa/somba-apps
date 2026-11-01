import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { paymentMethodLabel } from "@/lib/payment-methods";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, locale = "en") {
  // Whole dollars stay compact ("$89"); anything with cents shows both digits
  // ("$71.20") so a total is never rounded away from what is charged.
  const cents = Math.abs(amount - Math.round(amount)) > 0.004;
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(amount);
}

export function formatPaymentMethod(method: string, locale: "en" | "fr" = "en") {
  return paymentMethodLabel(method, locale === "fr");
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
