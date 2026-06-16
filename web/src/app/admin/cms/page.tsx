"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cmsBlocks as initialBlocks } from "@/lib/admin-entities";
import { useToast } from "@/context/toast-context";

export default function AdminCmsPage() {
  const { toast } = useToast();
  const [blocks, setBlocks] = useState(initialBlocks);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="CMS — Homepage Layout"
        subtitle="Admin-editable blocks — click to configure"
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "CMS" }]}
        actions={<Link href="/"><Button size="sm">Preview Homepage</Button></Link>}
      />

      <div className="space-y-3">
        {blocks.map((block, i) => (
          <Card key={block.id} className={!block.active ? "opacity-60" : ""}>
            <CardContent className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-[var(--primary)]">{i + 1}</span>
                <div>
                  <h3 className="font-semibold">{block.title}</h3>
                  <p className="text-xs text-slate-500">{block.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={block.active ? "success" : "default"}>{block.active ? "Active" : "Hidden"}</Badge>
                {block.editable && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditing(block.id);
                      setBlocks((b) => b.map((item) => item.id === block.id ? { ...item, active: !item.active } : item));
                      toast(`Block "${block.title}" updated`);
                    }}
                  >
                    {editing === block.id ? "Saved" : "Edit Block"}
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
