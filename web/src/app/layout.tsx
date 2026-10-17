import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/context/locale-context";
import { AuthProvider } from "@/context/auth-context";
import { ToastProvider } from "@/context/toast-context";
import { ShopProvider } from "@/context/shop-context";
import { WarehouseAdminProvider } from "@/context/warehouse-admin-context";
import { WarehouseStaffProvider } from "@/context/warehouse-staff-context";
import { MarketProvider } from "@/context/market-context";
import { ReviewsProvider } from "@/context/reviews-context";
import { RealtimeProvider } from "@/context/realtime-context";

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
  title: "S&T Marketplace — Shop, sell and deliver",
  description: "S&T Marketplace: shop products from verified sellers, pay with mobile money or your wallet and follow your delivery live.",
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
              <WarehouseStaffProvider>
                <AuthProvider>
                  <WarehouseAdminProvider>
                    <ReviewsProvider>
                      <ShopProvider>
                        <ToastProvider>{children}</ToastProvider>
                      </ShopProvider>
                    </ReviewsProvider>
                  </WarehouseAdminProvider>
                </AuthProvider>
              </WarehouseStaffProvider>
            </MarketProvider>
          </RealtimeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
