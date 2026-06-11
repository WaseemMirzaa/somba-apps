"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { cmsBlocks } from "@/lib/admin-entities";

export default function AdminCmsPage() {
  const { t } = useLocale();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("cms")}
        subtitle={t("cmsBlocks")}
        breadcrumbs={[{ label: t("adminBreadcrumb"), href: "/admin" }, { label: t("cms") }]}
        actions={<Link href="/"><span className="inline-flex rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white">{t("storefront")}</span></Link>}
      />

      <div className="space-y-3">
        {cmsBlocks.map((block, i) => (
          <Link key={block.id} href={`/admin/cms/blocks/${block.id}`}>
            <Card className={`transition-colors hover:border-blue-200 ${!block.active ? "opacity-60" : ""}`}>
              <CardContent className="flex items-center justify-between p-5">
                <div className="flex items-center gap-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-blue-600">{i + 1}</span>
                  <div>
                    <h3 className="font-semibold">{block.title}</h3>
                    <p className="text-xs text-slate-500">{block.type}</p>
                  </div>
                </div>
                <Badge variant={block.active ? "success" : "default"}>{block.active ? t("active") : t("draft")}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
