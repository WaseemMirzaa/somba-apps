import { LandingHeader } from "@/components/landing/header";
import { LandingFooter } from "@/components/landing/footer";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <LandingHeader />
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      <LandingFooter />
    </div>
  );
}
