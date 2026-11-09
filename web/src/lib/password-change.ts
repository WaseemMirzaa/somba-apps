/**
 * Accounts an administrator created (staff, riders, department admins) start with a temporary password and the server
 * refuses everything except changing it (`code: "password_change_required"`, api/src/auth/password-change.ts).
 * These are the pieces every portal shares: the code, the browser event a refused call raises, and the decision.
 */
export const PASSWORD_CHANGE_REQUIRED = "password_change_required";

/** Raised on `window` when any socket call is refused with {@link PASSWORD_CHANGE_REQUIRED}. */
export const PASSWORD_CHANGE_EVENT = "somba:password-change-required";

/** Is this failure the server's "change your temporary password first"? */
export function isPasswordChangeRequired(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: unknown }).code === PASSWORD_CHANGE_REQUIRED;
}

/** Must this signed-in account see the change-password screen instead of its portal? */
export function mustChangePassword(user: { mustChangePassword?: boolean } | null | undefined): boolean {
  return user?.mustChangePassword === true;
}

/** The user after the server refused a call with the code: held at the change screen until the change is made. */
export function heldAtPasswordChange<T extends { mustChangePassword?: boolean }>(user: T | null): T | null {
  return user && !user.mustChangePassword ? { ...user, mustChangePassword: true } : user;
}

const TEXT = {
  en: {
    title: "Choose a new password",
    body: "Your account was set up with a temporary password. Choose a password of your own to continue. Nothing else is available until you do.",
    current: "Temporary password",
    hint: "Enter the temporary password you were given, then a new password that is different from it.",
    signOut: "Sign out",
    changed: "Password changed. Welcome.",
  },
  fr: {
    title: "Choisissez un nouveau mot de passe",
    body: "Votre compte a été créé avec un mot de passe temporaire. Choisissez un mot de passe personnel pour continuer. Rien d'autre n'est disponible tant que ce n'est pas fait.",
    current: "Mot de passe temporaire",
    hint: "Saisissez le mot de passe temporaire qui vous a été remis, puis un nouveau mot de passe différent de celui-ci.",
    signOut: "Se déconnecter",
    changed: "Mot de passe modifié. Bienvenue.",
  },
} as const;

/** The words of the forced-change screen in the viewer's language. */
export function passwordChangeText(fr: boolean) {
  return fr ? TEXT.fr : TEXT.en;
}
