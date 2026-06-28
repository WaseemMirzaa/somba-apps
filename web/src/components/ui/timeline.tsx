"use client";

import { cn } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

/**
 * French translations for the timeline milestone labels used across the order,
 * fulfillment, return, replacement and onboarding flows. Labels come from the
 * mock data layer in English; unknown labels fall back to the original text.
 */
const TIMELINE_LABELS_FR: Record<string, string> = {
  "Allocated": "Alloué",
  "Approved by seller": "Approuvé par le vendeur",
  "Approved": "Approuvé",
  "Arrived": "Arrivé",
  "At warehouse": "À l'entrepôt",
  "Batch Created": "Lot créé",
  "Collected from seller": "Collecté chez le vendeur",
  "Collected": "Collecté",
  "Confirmed": "Confirmé",
  "Created": "Créé",
  "Delivered": "Livré",
  "Dispatch new item": "Expédier le nouvel article",
  "Dispatched to customer": "Expédié au client",
  "Dispatched": "Expédié",
  "Exchange requested": "Échange demandé",
  "First Order Received": "Première commande reçue",
  "First Product Added": "Premier produit ajouté",
  "First Sale": "Première vente",
  "In Transit to Warehouse": "En transit vers l'entrepôt",
  "In Transit": "En transit",
  "Inspecting": "Inspection en cours",
  "Inspection Passed": "Inspection réussie",
  "Inspection completed": "Inspection terminée",
  "Last delivery completed": "Dernière livraison terminée",
  "New variant allocated": "Nouvelle variante allouée",
  "New variant dispatched": "Nouvelle variante expédiée",
  "Old item pickup": "Récupération de l'ancien article",
  "Old item received": "Ancien article reçu",
  "Order Delivered": "Commande livrée",
  "Order placed": "Commande passée",
  "Out for delivery": "En cours de livraison",
  "Packed": "Emballé",
  "Paid": "Payé",
  "Payout Processed": "Versement traité",
  "Picked from seller": "Récupéré chez le vendeur",
  "Picked up": "Récupéré",
  "Picked": "Prélevé",
  "Pickup Completed": "Récupération terminée",
  "Pickup Scheduled": "Récupération planifiée",
  "Placed": "Passée",
  "Products Added": "Produits ajoutés",
  "Ready for pickup": "Prêt pour la récupération",
  "Received at Warehouse": "Reçu à l'entrepôt",
  "Received": "Reçu",
  "Refund Processed": "Remboursement traité",
  "Registered": "Inscrit",
  "Replacement allocated": "Remplacement alloué",
  "Replacement requested": "Remplacement demandé",
  "Requested": "Demandé",
  "Reserved": "Réservé",
  "Return Approved": "Retour approuvé",
  "Return Requested": "Retour demandé",
  "Returned item received": "Article retourné reçu",
  "Rider Assigned": "Livreur assigné",
  "Rider handover at hub": "Transfert au livreur au hub",
  "Seller approved": "Vendeur approuvé",
  "Seller notified": "Vendeur notifié",
  "Shift approved": "Service approuvé",
  "Shift started": "Service commencé",
  "Sorted": "Trié",
  "Supervisor review": "Examen par le superviseur",
  "Warehouse inspection": "Inspection à l'entrepôt",
  "Warehouse": "Entrepôt",
};

export function ActivityTimeline({
  events,
}: {
  events: { time: string; label: string; detail?: string; detailFr?: string; done?: boolean }[];
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <ol className="relative space-y-0">
      {events.map((event, i) => (
        <li key={i} className="flex gap-4 pb-6 last:pb-0">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "h-3 w-3 rounded-full ring-4 ring-white",
                event.done !== false ? "bg-[var(--primary)]" : "bg-slate-200"
              )}
            />
            {i < events.length - 1 && (
              <div className="mt-1 w-px flex-1 bg-blue-100" style={{ minHeight: 24 }} />
            )}
          </div>
          <div className="flex-1 pt-0">
            <p className="text-sm font-medium text-slate-900">{fr ? (TIMELINE_LABELS_FR[event.label] ?? event.label) : event.label}</p>
            {event.detail && (
              <p className="text-xs text-slate-500">{fr ? (event.detailFr ?? event.detail) : event.detail}</p>
            )}
            <p className="text-xs text-slate-400">{event.time}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
