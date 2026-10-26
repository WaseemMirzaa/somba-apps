"use client";

import { PageHeader } from "@/components/ui/page-header";
import { ChatInbox } from "@/components/seller/engage-chat";
import { useLocale } from "@/context/locale-context";

export default function SellerMessagesPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        subtitle={fr ? "Conversations avec vos clients, en direct" : "Conversations with your customers, live"}
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: "Messages" }]}
      />
      <ChatInbox />
    </div>
  );
}
