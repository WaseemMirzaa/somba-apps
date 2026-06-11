"use client";

import Link from "next/link";
import { useState } from "react";
import Image from "next/image";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { banners } from "@/lib/mock-data";
import { marketingCampaigns as initialCampaigns } from "@/lib/admin-entities";

export default function AdminMarketingPage() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("marketing")}
        subtitle={t("marketingSubtitle")}
        breadcrumbs={[{ label: t("adminBreadcrumb"), href: "/admin" }, { label: t("marketing") }]}
        actions={<Button size="sm" onClick={() => setShowCreate(true)}>{t("create")} {t("campaign")}</Button>}
      />

      {showCreate && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <input className="input-premium w-full px-4 py-2 text-sm" placeholder={t("campaignName")} id="campaign-name" />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => {
                const name = (document.getElementById("campaign-name") as HTMLInputElement)?.value || "New Campaign";
                setCampaigns((c) => [...c, { id: `CMP-0${c.length + 1}`, name, type: "banner", status: "scheduled", reach: "0", budget: 0, channels: ["homepage"] }]);
                setShowCreate(false);
                toast("Campaign created");
              }}>Save Campaign</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {campaigns.map((c) => (
          <Link key={c.id} href={`/admin/marketing/${c.id}`}>
            <Card className="transition-colors hover:border-blue-200">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <Badge variant={c.status === "active" ? "success" : "warning"}>{c.status}</Badge>
                  <span className="text-xs text-slate-400">{c.type}</span>
                </div>
                <h3 className="mt-3 font-semibold text-slate-900">{c.name}</h3>
                <p className="mt-1 text-sm text-slate-500">Reach: {c.reach}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <h3 className="font-semibold text-slate-900">Homepage Banners</h3>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {banners.map((b) => (
            <div key={b.id} className="relative h-32 overflow-hidden rounded-xl">
              <Image src={b.image} alt={b.title} fill className="object-cover" sizes="400px" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <p className="absolute bottom-3 left-3 text-sm font-semibold text-white">
                {locale === "fr" ? b.titleFr : b.title}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
