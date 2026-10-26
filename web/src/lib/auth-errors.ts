/**
 * Sign-in / sign-up / password-reset errors in the viewer's language.
 *
 * The API answers in English (`api/src/auth/*`), and the browser's own `fetch` failures are English too, so the
 * forms translate what they show: a known message maps to its French text, anything else is passed through as-is
 * (a message we do not know cannot be translated, and showing it beats hiding it).
 */

const FR: Record<string, string> = {
  "invalid email or password": "E-mail ou mot de passe incorrect.",
  "an account with this email already exists": "Un compte existe déjà avec cet e-mail.",
  "that account type cannot be created by self-registration": "Ce type de compte ne peut pas être créé par inscription libre.",
  "this account has been suspended. contact support": "Ce compte a été suspendu. Contactez le support.",
  "account no longer exists": "Ce compte n'existe plus.",
  "invalid or expired refresh token": "Session expirée. Reconnectez-vous.",
  "session has been revoked": "Session expirée. Reconnectez-vous.",
  "session expired. please sign in again": "Session expirée. Reconnectez-vous.",
  "password must be at least 8 characters": "Le mot de passe doit contenir au moins 8 caractères.",
  "new password must be at least 8 characters": "Le nouveau mot de passe doit contenir au moins 8 caractères.",
  "current password is incorrect": "Le mot de passe actuel est incorrect.",
  "password is incorrect": "Le mot de passe est incorrect.",
  "invalid or expired link": "Lien invalide ou expiré.",
  "please wait before requesting another email": "Patientez un instant avant de demander un autre e-mail.",
  "please wait before requesting another code": "Patientez un instant avant de demander un autre code.",
  "code expired or too many attempts. request a new code": "Code expiré ou trop de tentatives. Demandez un nouveau code.",
  "incorrect code": "Code incorrect.",
  "incorrect or expired code": "Code incorrect ou expiré.",
  "add a phone number to your profile first": "Ajoutez d'abord un numéro de téléphone à votre profil.",
  "enter a valid phone number": "Saisissez un numéro de téléphone valide.",
  "that code is not right. check the time on your phone and try again": "Ce code n'est pas correct. Vérifiez l'heure de votre téléphone et réessayez.",
  "this sign-in expired. enter your password again": "Cette connexion a expiré. Saisissez à nouveau votre mot de passe.",
  "too many wrong codes. try again in a few minutes": "Trop de codes erronés. Réessayez dans quelques minutes.",
  "two-factor authentication code required": "Saisissez le code de vérification à 6 chiffres.",
};

const EN_FRIENDLY = {
  unreachable: "Cannot reach the server. Check your connection and try again.",
  tooMany: "Too many attempts. Please wait a minute and try again.",
  invalidEmail: "Enter a valid email address.",
  generic: "Something went wrong. Please try again.",
};
const FR_FRIENDLY = {
  unreachable: "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.",
  tooMany: "Trop de tentatives. Patientez une minute puis réessayez.",
  invalidEmail: "Saisissez une adresse e-mail valide.",
  generic: "Une erreur est survenue. Réessayez.",
};

const key = (m: string) => m.trim().replace(/[.!\s]+$/, "").toLowerCase();

/** The text of an auth error (an `Error`, a string or nothing) in English or French. */
export function authErrorText(err: unknown, fr: boolean): string {
  const raw = (err instanceof Error ? err.message : typeof err === "string" ? err : "").trim();
  const words = fr ? FR_FRIENDLY : EN_FRIENDLY;
  if (!raw) return words.generic;

  // The browser's own message when the API cannot be reached.
  if (/failed to fetch|networkerror|network request failed|load failed|cannot reach the server/i.test(raw)) return words.unreachable;
  // @nestjs/throttler.
  if (/too many requests|throttl/i.test(raw)) return words.tooMany;
  // class-validator on the e-mail field ("email must be an email", possibly followed by other fields' messages).
  if (/\bemail must be an email\b/i.test(raw)) return words.invalidEmail;

  const status = /^request failed \((\d{3})\)$/i.exec(raw);
  if (status) return fr ? `La requête a échoué (${status[1]}).` : raw;

  if (fr) return FR[key(raw)] ?? raw;
  return raw;
}
