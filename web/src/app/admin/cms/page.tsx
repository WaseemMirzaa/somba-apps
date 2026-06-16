"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cmsBlocks as initialBlocks } from "@/lib/admin-entities";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

const BLOCK_TITLES_FR: Record<string, string> = {
  hero: "Bannière héro",
  categories: "Grille de catégories",
  flash: "Bandeau vente flash",
  trending: "Produits tendance",
  stores: "Meilleures boutiques",
};

const BLOCK_TYPE_FR: Record<string, string> = {
  hero: "bannière héro",
  category_grid: "grille de catégories",
  flash_sale: "vente flash",
  product_carousel: "carrousel de produits",
  store_grid: "grille de boutiques",
};

export default function AdminCmsPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [blocks, setBlocks] = useState(initialBlocks);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "CMS — Mise en page de l'accueil" : "CMS — Homepage Layout"}
        subtitle={fr ? "Blocs modifiables par l'admin — cliquez pour configurer" : "Admin-editable blocks — click to configure"}
        breadcrumbs={[{ label: fr ? "Admin" : "Admin", href: "/admin" }, { label: "CMS" }]}
        actions={<Link href="/"><Button size="sm">{fr ? "Aperçu de l'accueil" : "Preview Homepage"}</Button></Link>}
      />

      <div className="space-y-3">
        {blocks.map((block, i) => (
          <Card key={block.id} className={!block.active ? "opacity-60" : ""}>
            <CardContent className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-[var(--primary)]">{i + 1}</span>
                <div>
                  <h3 className="font-semibold">{fr ? (BLOCK_TITLES_FR[block.id] ?? block.title) : block.title}</h3>
                  <p className="text-xs text-slate-500">{fr ? (BLOCK_TYPE_FR[block.type] ?? block.type) : block.type}</p>
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
                      toast(fr ? `Bloc « ${BLOCK_TITLES_FR[block.id] ?? block.title} » mis à jour` : `Block "${block.title}" updated`);
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
