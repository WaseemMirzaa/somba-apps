"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { DeliveredForm } from "@/components/warehouse/rider-task-actions";
import { useRiderData } from "@/lib/rider";
import { useLocale } from "@/context/locale-context";

/** Proof of delivery = the delivered step: the customer's 4-digit code (and cash for COD), sent to the server. */
export default function RiderPodPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const router = useRouter();
  const { getRiderTask, refresh, loading } = useRiderData();
  const task = getRiderTask(id);

  if (!task) {
    return <div className="text-center text-slate-500">{loading ? (fr ? "Chargement…" : "Loading…") : (fr ? "Tâche introuvable" : "Task not found")}</div>;
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title={fr ? "Preuve de livraison" : "Proof of Delivery"} subtitle={task.orderId} backHref={`/rider/tasks/${id}`} />

      <DetailSection title={fr ? "Détails" : "Details"}>
        <InfoGrid items={[
          { label: t("customer"), value: task.customer },
          { label: fr ? "Commande" : "Order", value: task.orderId },
          { label: fr ? "Adresse" : "Address", value: task.address, full: true },
        ]} />
      </DetailSection>

      <DetailSection title={fr ? "Vérification" : "Verification"}>
        {task.status === "in_transit" && !task.hubBound ? (
          <DeliveredForm
            task={task}
            onDone={() => {
              void refresh();
              router.push(`/rider/tasks/${id}`);
            }}
          />
        ) : task.status === "delivered" ? (
          <p className="text-sm text-emerald-700">{fr ? "Cette livraison est déjà confirmée." : "This delivery is already confirmed."}</p>
        ) : task.hubBound ? (
          <p className="text-sm text-slate-600">
            {fr ? "Ce trajet se termine à l'entrepôt : le personnel scanne le colis, vous n'avez rien à confirmer." : "This leg ends at the warehouse: the staff scan the parcel in, there is nothing for you to confirm."}{" "}
            <Link href={`/rider/tasks/${id}`} className="text-emerald-700 underline">
              {fr ? "Retour à la tâche" : "Back to the task"}
            </Link>
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            {fr
              ? "Vous pouvez confirmer la livraison une fois en route vers le client."
              : "You can confirm delivery once you are on the way to the customer."}{" "}
            <Link href={`/rider/tasks/${id}`} className="text-emerald-700 underline">
              {fr ? "Retour à la tâche" : "Back to the task"}
            </Link>
          </p>
        )}
      </DetailSection>
    </div>
  );
}
