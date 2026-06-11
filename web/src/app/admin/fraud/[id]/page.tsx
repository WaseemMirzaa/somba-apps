"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getFraudAlert } from "@/lib/admin-entities";
import { useToast } from "@/context/toast-context";

const severityVariant = { low: "default", medium: "warning", high: "danger" } as const;

export default function AdminFraudDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const alert = getFraudAlert(id);

  if (!alert) return <div className="p-8 text-center text-slate-500">Alert not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={alert.id} subtitle={String(alert.type).replace("_", " ")} backHref="/admin/fraud" actions={<Badge variant={severityVariant[alert.severity]}>{alert.severity}</Badge>} />
      <DetailSection title="Risk Alert">
        <InfoGrid items={[
          { label: "Customer", value: alert.customer },
          ...(alert.orderId ? [{ label: "Order", value: <Link href={`/admin/orders/${alert.orderId}`} className="text-blue-600 hover:underline">{alert.orderId}</Link> }] : []),
          { label: "Score", value: <span className="font-bold text-red-600">{alert.score}</span> },
          { label: "Status", value: <Badge variant={alert.status === "blocked" ? "danger" : "info"}>{alert.status}</Badge> },
          { label: "Date", value: alert.date },
        ]} />
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={() => toast("Alert marked reviewed")}>Mark Reviewed</Button>
          <Button variant="secondary" size="sm" onClick={() => toast("Customer blocked")}>Block Customer</Button>
        </div>
      </DetailSection>
    </div>
  );
}
