import { BRAND } from "@/lib/config";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose prose-slate">
      <h1>Privacy Policy</h1>
      <p>{BRAND.legalEntity} ({BRAND.name}) respects your privacy. This policy describes how we collect, use, and protect personal data for users in France and globally.</p>
      <h2>Data We Collect</h2>
      <p>Account information, order history, payment details (tokenized), delivery addresses, device information, and customer support communications.</p>
      <h2>GDPR Rights</h2>
      <p>EU residents may request access, rectification, erasure, and portability of personal data by contacting {BRAND.supportEmail}.</p>
    </div>
  );
}
