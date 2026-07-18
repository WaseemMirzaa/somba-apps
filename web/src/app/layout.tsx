import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/context/locale-context";
import { AuthProvider } from "@/context/auth-context";
import { ToastProvider } from "@/context/toast-context";
import { ShopProvider } from "@/context/shop-context";
import { WarehouseAdminProvider } from "@/context/warehouse-admin-context";
import { WarehouseStaffProvider } from "@/context/warehouse-staff-context";
import { SellerSubscriptionProvider } from "@/context/seller-subscription-context";
import { MarketProvider } from "@/context/market-context";
import { NotificationProvider } from "@/context/notification-context";
import { DisputeProvider } from "@/context/dispute-context";
import { ModerationProvider } from "@/context/moderation-context";
import { CategoriesProvider } from "@/context/categories-context";
import { SupportProvider } from "@/context/support-context";
import { ReviewsProvider } from "@/context/reviews-context";
import { ReplacementProvider } from "@/context/replacement-context";
import { RiderZoneProvider } from "@/context/rider-zone-context";
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
  title: "S&T Marketplace — Complete Marketplace Platform",
  description: "S&T Marketplace — Admin, Seller, Warehouse, Rider & Customer apps. Purchase and deploy your marketplace.",
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
                <NotificationProvider>
                  <DisputeProvider>
                    <SellerSubscriptionProvider>
                      <WarehouseAdminProvider>
                        <ModerationProvider>
                          <CategoriesProvider>
                            <SupportProvider>
                              <ReviewsProvider>
                                <ReplacementProvider>
                                  <RiderZoneProvider>
                                    <ShopProvider>
                                      <ToastProvider>{children}</ToastProvider>
                                    </ShopProvider>
                                  </RiderZoneProvider>
                                </ReplacementProvider>
                              </ReviewsProvider>
                            </SupportProvider>
                          </CategoriesProvider>
                        </ModerationProvider>
                      </WarehouseAdminProvider>
                    </SellerSubscriptionProvider>
                  </DisputeProvider>
                </NotificationProvider>
              </AuthProvider>
            </WarehouseStaffProvider>
          </MarketProvider>
          </RealtimeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
