import { BRAND, LEGAL_LINKS } from "@/lib/config";
import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose prose-slate">
      <h1>Terms of Use</h1>
      <p className="text-sm text-slate-500">{BRAND.legalEntity} · {BRAND.legalAddress}</p>
      <p>Welcome to {BRAND.name}. These Terms of Use govern your access to and use of the {BRAND.fullName} marketplace platform, including our website, mobile applications, and related services.</p>
      <h2>1. Marketplace Model</h2>
      <p>{BRAND.name} operates as a marketplace platform. Sellers list and sell their own inventory. {BRAND.legalEntity} facilitates transactions, payments, and logistics in a hybrid fulfillment model.</p>
      <h2>2. Orders & Payments</h2>
      <p>We support Stripe card payments, Airtel Money, Somba Wallet, and pay at delivery. Pay-at-delivery orders may require OTP verification and are subject to fraud prevention limits.</p>
      <h2>3. Returns & Refunds</h2>
      <p>Refunds may be issued to the original payment method or Somba Wallet at your choice, subject to our Return Policy.</p>
      <h2>4. Open Box Delivery</h2>
      <p>Where available, you may inspect products at delivery before accepting. Refusal triggers return without charge.</p>
      <nav className="mt-12 flex flex-wrap gap-4 text-sm">
        {LEGAL_LINKS.map((l) => <Link key={l.href} href={l.href} className="text-[var(--primary)] hover:underline">{l.label}</Link>)}
      </nav>
    </div>
  );
}
