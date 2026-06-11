"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCmsBlock } from "@/lib/admin-entities";
import { useToast } from "@/context/toast-context";

export default function AdminCmsBlockDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const block = getCmsBlock(id);

  if (!block) return <div className="p-8 text-center text-slate-500">Block not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={block.title}
        subtitle={block.type}
        backHref="/admin/cms"
        actions={<Badge variant={block.active ? "success" : "default"}>{block.active ? "Active" : "Hidden"}</Badge>}
      />
      <DetailGrid>
        <DetailGridSection title="Block settings">
          <InfoGrid items={[
            { label: "Block ID", value: block.id },
            { label: "Type", value: block.type },
            { label: "Editable", value: block.editable ? "Yes" : "No" },
          ]} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => toast(`Block "${block.title}" saved`)}>Save changes</Button>
            <Link href="/"><Button variant="secondary" size="sm">Preview homepage</Button></Link>
          </div>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
