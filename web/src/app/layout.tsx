import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { LocaleProvider } from "@/context/locale-context";
import { AuthProvider } from "@/context/auth-context";
import { ToastProvider } from "@/context/toast-context";
import { ShopProvider } from "@/context/shop-context";
import { MarketProvider } from "@/context/market-context";
import { RealtimeProvider } from "@/context/realtime-context";
import { LocaleAccountSync } from "@/components/layout/locale-account-sync";
import { AlertsPrompt } from "@/components/layout/alerts-prompt";
import { LocaleDocumentMeta } from "@/components/layout/locale-document-meta";
import { SITE_META } from "@/lib/site-meta";

// Fonts ship inside the app (npm packages @fontsource-variable/*), so a build or a deploy never depends on Google being reachable.
const inter = localFont({
  variable: "--font-sans",
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  display: "swap",
});

const jakarta = localFont({
  variable: "--font-display",
  src: "../../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2",
  weight: "200 800",
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "KOMORIKO",
  // French is the default language (the visitor's choice is read in the browser: see LocaleDocumentMeta).
  title: SITE_META.fr.title,
  description: SITE_META.fr.description,
  openGraph: {
    siteName: "KOMORIKO",
    title: SITE_META.fr.title,
    description: SITE_META.fr.description,
    type: "website",
  },
  icons: {
    icon: "/brand/logo-stack.png",
    apple: "/brand/logo-stack.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${inter.variable} ${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--background)]">
        <LocaleProvider>
          <RealtimeProvider>
            <MarketProvider>
                              <AuthProvider>
                                                            <ShopProvider>
                        <ToastProvider>
                          <LocaleAccountSync />
                          <LocaleDocumentMeta />
                          <AlertsPrompt />
                          {children}
                        </ToastProvider>
                      </ShopProvider>
                                                      </AuthProvider>
                          </MarketProvider>
          </RealtimeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
