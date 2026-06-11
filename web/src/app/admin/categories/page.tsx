"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { categories } from "@/lib/mock-data";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { localizedField } from "@/lib/locale-helpers";

export default function AdminCategoriesPage() {
  const { locale, t } = useLocale();
  const { toast } = useToast();
  const [items, setItems] = useState(categories);

  return (
    <div className="space-y-6">
      <PageHeader title={t("categoryManagement")} actions={
        <Button onClick={() => toast(t("categoryAdded"))}>{t("addCategory")}</Button>
      } />
      <div className="space-y-2">
        {items.map((c) => (
          <Link key={c.id} href={`/admin/categories/${c.id}`} className="card-premium flex items-center justify-between p-4 hover:border-blue-200">
            <span>{localizedField(locale, c.name, c.nameFr)} {c.icon}</span>
            <span className="text-sm text-blue-600">{t("edit")}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
