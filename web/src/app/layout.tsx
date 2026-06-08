import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/context/locale-context";
import { AuthProvider } from "@/context/auth-context";
import { ThemeProvider } from "@/context/theme-context";
import { ToastProvider } from "@/context/toast-context";
import { ShopProvider } from "@/context/shop-context";
import { WarehouseAdminProvider } from "@/context/warehouse-admin-context";
import { SellerSubscriptionProvider } from "@/context/seller-subscription-context";
import { MarketProvider } from "@/context/market-context";
import { NotificationProvider } from "@/context/notification-context";
import { DisputeProvider } from "@/context/dispute-context";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Somba — Complete Marketplace Platform",
  description: "Somba & Tekka — Admin, Seller, Warehouse, Rider & Customer apps. Purchase and deploy your marketplace.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--background)]">
        <ThemeProvider>
          <LocaleProvider>
            <MarketProvider>
              <AuthProvider>
                <NotificationProvider>
                  <DisputeProvider>
                    <SellerSubscriptionProvider>
                      <WarehouseAdminProvider>
                        <ShopProvider>
                          <ToastProvider>{children}</ToastProvider>
                        </ShopProvider>
                      </WarehouseAdminProvider>
                    </SellerSubscriptionProvider>
                  </DisputeProvider>
                </NotificationProvider>
              </AuthProvider>
            </MarketProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
