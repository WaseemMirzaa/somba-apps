/**
 * The rider's own account: the rules for editing name and phone (`me:update`) and for changing the password
 * (`me:changePassword`). They mirror the server (`api/src/users/users.service.ts`, `api/src/auth/auth.service.ts`) and the
 * Flutter rider app (`rider-app/lib/screens/account_screen.dart`), so a problem is caught before the request and the
 * server's own refusal still wins. Only name and phone are ever sent: the e-mail, the role and the warehouse are not the
 * rider's to change.
 *
 * No imports: `npm test` loads this file on its own.
 */

const PHONE_RULE = /^\+?[0-9 ()-]{7,20}$/;

/** A display name is 2 to 80 characters once trimmed. */
export const isValidName = (name: string): boolean => name.trim().length >= 2 && name.trim().length <= 80;

/** A phone is optional; when typed it must look like one. */
export const isValidPhone = (phone: string): boolean => phone.trim() === "" || PHONE_RULE.test(phone.trim());

export interface ProfileProblems {
  name: string | null;
  phone: string | null;
}

/** What is wrong with the typed name and phone, in the rider's language (null = fine). */
export function profileProblems(name: string, phone: string, fr: boolean): ProfileProblems {
  return {
    name: isValidName(name) ? null : fr ? "Saisissez votre nom (2 à 80 caractères)." : "Enter your name (2 to 80 characters).",
    phone: isValidPhone(phone) ? null : fr ? "Saisissez un numéro de téléphone valide." : "Enter a valid phone number.",
  };
}

/** The body of `me:update`: name and phone only; a blank phone clears it. */
export const profilePatch = (name: string, phone: string): { name: string; phone: string | null } => ({
  name: name.trim(),
  phone: phone.trim() === "" ? null : phone.trim(),
});

/** Is the signed-in user shown after `me:update` / `me:updated` the same account (never show someone else's)? */
export const isSameAccount = (mine: { id?: string } | null | undefined, pushed: { id?: string; role?: string } | null | undefined): boolean =>
  !!mine?.id && !!pushed?.id && mine.id === pushed.id && pushed.role === "rider";

export interface PasswordProblems {
  current: string | null;
  next: string | null;
  again: string | null;
}

/** What is wrong with the three password fields (null = fine). */
export function passwordProblems(current: string, next: string, again: string, fr: boolean): PasswordProblems {
  return {
    current: current === "" ? (fr ? "Saisissez votre mot de passe actuel." : "Enter your current password.") : null,
    next:
      next.length < 8
        ? fr ? "8 caractères au minimum." : "At least 8 characters."
        : next === current
          ? fr ? "Choisissez un mot de passe différent de l'actuel." : "Choose a password different from the current one."
          : null,
    again: again !== next ? (fr ? "Les deux mots de passe sont différents." : "The two passwords do not match.") : null,
  };
}

export const hasProblems = (p: ProfileProblems | PasswordProblems): boolean => Object.values(p).some((v) => v !== null);
