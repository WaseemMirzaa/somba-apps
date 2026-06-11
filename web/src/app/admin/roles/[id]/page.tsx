"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAdminRole } from "@/lib/admin-entities";
import { useToast } from "@/context/toast-context";

export default function AdminRoleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const role = getAdminRole(id);

  if (!role) return <div className="p-8 text-center text-slate-500">Role not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={role.name} subtitle={`${role.permissions.length} permission scopes`} backHref="/admin/roles" />
      <DetailSection title="Permissions">
        <div className="flex flex-wrap gap-2">
          {role.permissions.map((p) => (
            <Badge key={p} variant="primary">{p}</Badge>
          ))}
        </div>
        <Button className="mt-4" size="sm" onClick={() => toast("Role permissions saved")}>Save Permissions</Button>
      </DetailSection>
    </div>
  );
}
