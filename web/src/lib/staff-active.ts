/**
 * The words of the admin's "Deactivate / Reactivate" action on a rider or a warehouse employee (`staff:setActive`,
 * docs/contracts/areas.md): the button, the confirmation and the toast, in both languages.
 *
 * No imports: `npm test` loads this file on its own.
 */

export interface StaffActiveCopy {
  /** The row button and the confirm button. */
  button: string;
  /** The confirmation's title. */
  title: string;
  /** What the confirmation says will happen. */
  body: string;
  /** The toast once the server said yes; `openTasks` = tasks the person still holds (riders). */
  done: (openTasks: number) => string;
}

/** `activate` = the account is being switched ON (a reactivation); false = switched OFF. Riders and warehouse employees read differently. */
export function staffActiveCopy(role: string, activate: boolean, fr: boolean): StaffActiveCopy {
  const rider = role === "rider";
  if (activate) {
    return {
      button: fr ? "Réactiver" : "Reactivate",
      title: rider ? (fr ? "Réactiver ce livreur ?" : "Reactivate this rider?") : fr ? "Réactiver cet employé ?" : "Reactivate this employee?",
      body: rider
        ? fr ? "La personne peut se reconnecter et compte de nouveau comme livreur dans son entrepôt." : "They can sign in again and count as a rider for their warehouse."
        : fr ? "La personne peut se reconnecter et reçoit de nouveau les alertes de son entrepôt." : "They can sign in again and get their warehouse's notices again.",
      done: () => (rider ? (fr ? "Livreur réactivé" : "Rider reactivated") : fr ? "Employé réactivé" : "Employee reactivated"),
    };
  }
  return {
    button: fr ? "Désactiver" : "Deactivate",
    title: rider ? (fr ? "Désactiver ce livreur ?" : "Deactivate this rider?") : fr ? "Désactiver cet employé ?" : "Deactivate this employee?",
    body: rider
      ? fr
        ? "La personne est déconnectée aussitôt et ne peut plus se reconnecter. Son entrepôt ne la compte plus comme livreur : s'il n'en reste aucun, les commandes de ses zones sont livrées depuis l'entrepôt le plus proche qui a des livreurs, et les admins sont alertés. Les colis déjà assignés lui restent jusqu'à ce que l'entrepôt les confie à quelqu'un d'autre."
        : "They are signed out at once and cannot sign in again. Their warehouse stops counting them as a rider: if it has none left, orders to its areas are delivered from the nearest staffed warehouse and the admins are alerted. Parcels already assigned to them stay on their list until the warehouse gives them to someone else."
      : fr
        ? "La personne est déconnectée aussitôt et ne peut plus se reconnecter. Elle ne reçoit plus les alertes de son entrepôt."
        : "They are signed out at once and cannot sign in again. They no longer get their warehouse's notices.",
    done: (openTasks) => {
      const base = rider ? (fr ? "Livreur désactivé" : "Rider deactivated") : fr ? "Employé désactivé" : "Employee deactivated";
      if (!rider || openTasks <= 0) return base;
      return fr
        ? `${base} · ${openTasks} ${openTasks > 1 ? "tâches ouvertes à réassigner" : "tâche ouverte à réassigner"}`
        : `${base} · ${openTasks} open ${openTasks > 1 ? "tasks" : "task"} to hand over`;
    },
  };
}
