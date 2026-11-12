/** Who wrote a message in a return / dispute thread, as a short word in the viewer's language (`warehouse_staff` -> "entrepôt"). */
const ROLES: Record<string, { en: string; fr: string }> = {
  customer: { en: "customer", fr: "client" },
  seller: { en: "seller", fr: "vendeur" },
  rider: { en: "rider", fr: "livreur" },
  warehouse_staff: { en: "warehouse", fr: "entrepôt" },
  warehouse: { en: "warehouse", fr: "entrepôt" },
};

export function authorRoleLabel(role: string | null | undefined, fr: boolean): string {
  const r = (role ?? "").trim();
  if (r.startsWith("admin")) return "KOMORIKO"; // every admin role speaks for the platform
  const hit = ROLES[r];
  return hit ? (fr ? hit.fr : hit.en) : r.replace(/_/g, " ");
}
