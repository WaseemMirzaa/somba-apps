/** The words of the admin "Reset password" and "Edit e-mail" actions on a staff or rider account, in English and French. */
const EN = {
  pendingBadge: "Temporary password",
  resetButton: "Reset password",
  resetTitle: "Issue a new temporary password?",
  resetBody:
    "A new temporary password is made for this account and shown to you once. Their current password stops working, they are signed out everywhere, and they must choose a password of their own at the next sign-in. The action is recorded in the audit log, without the password.",
  resetConfirm: "Issue new password",
  issuedTitle: "New temporary password",
  issuedNote:
    "This password is shown once and cannot be retrieved later. Copy it now and hand it over privately. Do not send it in a public channel. The person must replace it at their next sign-in.",
  resetDone: (name: string) => `New temporary password issued for ${name}`,
  issuedHeadline: (name: string, email: string) => `New temporary password for ${name} (${email})`,
  emailButton: "Edit e-mail",
  emailTitle: "Correct the e-mail address",
  emailLabel: "E-mail address",
  emailBody:
    "The address must not be used by another account. It is the address the person signs in with and where password links go; it counts as unverified until they confirm it. The change is recorded in the audit log.",
  emailRequired: "Enter an e-mail address.",
  emailDone: (name: string) => `E-mail updated for ${name}`,
};
const FR: typeof EN = {
  pendingBadge: "Mot de passe temporaire",
  resetButton: "Réinitialiser le mot de passe",
  resetTitle: "Émettre un nouveau mot de passe temporaire ?",
  resetBody:
    "Un nouveau mot de passe temporaire est créé pour ce compte et ne vous est montré qu'une fois. Son mot de passe actuel cesse de fonctionner, la personne est déconnectée partout et devra choisir son propre mot de passe à la prochaine connexion. L'action est inscrite au journal d'audit, sans le mot de passe.",
  resetConfirm: "Émettre le mot de passe",
  issuedTitle: "Nouveau mot de passe temporaire",
  issuedNote:
    "Ce mot de passe n'est affiché qu'une fois et ne peut pas être retrouvé plus tard. Copiez-le maintenant et remettez-le en privé. Ne l'envoyez pas sur un canal public. La personne devra le remplacer à sa prochaine connexion.",
  resetDone: (name) => `Nouveau mot de passe temporaire émis pour ${name}`,
  issuedHeadline: (name, email) => `Nouveau mot de passe temporaire pour ${name} (${email})`,
  emailButton: "Modifier l'e-mail",
  emailTitle: "Corriger l'adresse e-mail",
  emailLabel: "Adresse e-mail",
  emailBody:
    "L'adresse ne doit pas être utilisée par un autre compte. C'est l'adresse de connexion de la personne et celle où partent les liens de mot de passe ; elle est considérée comme non vérifiée jusqu'à confirmation. La modification est inscrite au journal d'audit.",
  emailRequired: "Saisissez une adresse e-mail.",
  emailDone: (name) => `E-mail modifié pour ${name}`,
};

export function staffActionText(fr: boolean) {
  return fr ? FR : EN;
}
