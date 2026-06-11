"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { categories } from "@/lib/mock-data";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

export default function AdminCategoriesPage() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const [items, setItems] = useState(categories);
  const fr = locale === "fr";

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Catégories" : "Category Management"} actions={
        <Button onClick={() => toast(fr ? "Catégorie ajoutée" : "Category added")}>{fr ? "+ Ajouter" : "+ Add"}</Button>
      } />
      <div className="space-y-2">
        {items.map((c) => (
          <Link key={c.id} href={`/admin/categories/${c.id}`} className="card-premium flex items-center justify-between p-4 hover:border-blue-200">
            <span>{fr ? c.nameFr : c.name} {c.icon}</span>
            <span className="text-sm text-blue-600">{fr ? "Modifier" : "Edit"}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
