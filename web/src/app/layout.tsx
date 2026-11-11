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
  title: "KOMORIKO — Shop, sell and deliver",
  description: "KOMORIKO: shop products from verified sellers, pay with mobile money or your wallet and follow your delivery live.",
  openGraph: {
    siteName: "KOMORIKO",
    title: "KOMORIKO — Shop, sell and deliver",
    description: "KOMORIKO: shop products from verified sellers, pay with mobile money or your wallet and follow your delivery live.",
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
    <html lang="en" className={`${inter.variable} ${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--background)]">
        <LocaleProvider>
          <RealtimeProvider>
            <MarketProvider>
                              <AuthProvider>
                                                            <ShopProvider>
                        <ToastProvider>
                          <LocaleAccountSync />
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
