"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminData } from "@/lib/admin";
import { adminBreadcrumb, cmsBlockTitle, cmsBlockTypeLabel } from "@/lib/admin-i18n";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

export default function AdminCmsPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { cmsBlocks } = useAdminData();
  const [blocks, setBlocks] = useState(cmsBlocks);
  useEffect(() => setBlocks(cmsBlocks), [cmsBlocks]);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "CMS — Mise en page de l'accueil" : "CMS — Homepage Layout"}
        subtitle={fr ? "Blocs modifiables par l'admin — cliquez pour configurer" : "Admin-editable blocks — click to configure"}
        breadcrumbs={[adminBreadcrumb(locale), { label: "CMS" }]}
        actions={<Link href="/"><Button size="sm">{fr ? "Aperçu de l'accueil" : "Preview Homepage"}</Button></Link>}
      />

      <div className="space-y-3">
        {blocks.map((block, i) => (
          <Card key={block.id} className={!block.active ? "opacity-60" : ""}>
            <CardContent className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-[var(--primary)]">{i + 1}</span>
                <div>
                  <h3 className="font-semibold">{cmsBlockTitle(block.id, block.title, fr)}</h3>
                  <p className="text-xs text-slate-500">{cmsBlockTypeLabel(block.type, fr)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={block.active ? "success" : "default"}>{block.active ? (fr ? "Actif" : "Active") : (fr ? "Masqué" : "Hidden")}</Badge>
                {block.editable && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditing(block.id);
                      setBlocks((b) => b.map((item) => item.id === block.id ? { ...item, active: !item.active } : item));
                      toast(
                        fr
                          ? `Bloc « ${cmsBlockTitle(block.id, block.title, fr)} » mis à jour`
                          : `Block "${block.title}" updated`
                      );
                    }}
                  >
                    {editing === block.id ? (fr ? "Enregistré" : "Saved") : (fr ? "Modifier le bloc" : "Edit Block")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
