// Server messages a shopper can meet that the other lists miss: sign-in codes and two-factor, card payments, wallet
// top-ups, reviews, follows, cart limits, session loss. Found by listing every message `api/src` throws or returns
// as a reason and checking each one against `translateServerError`. Exact English text -> French. A message may be
// listed in one map only; one with a number or a name in it goes to `kServerPatternsMore`.

const Map<String, String> kServerErrorsMore = {
  // Card payments and top-ups
  'The card payment was cancelled.': 'Le paiement par carte a été annulé.',
  'Timed out waiting for the card payment.': 'Délai de paiement par carte dépassé.',
  'Could not reach the card processor. Please try again.': 'Impossible de joindre le prestataire de paiement par carte. Veuillez réessayer.',
  'Could not start the card payment. Please try again.': 'Impossible de démarrer le paiement par carte. Veuillez réessayer.',
  'Invalid top-up reference. Please try again.': 'Référence de recharge invalide. Veuillez réessayer.',
  'This top-up reference was already used for a different top-up.': 'Cette référence de recharge a déjà servi pour une autre recharge.',
  // Sign-in, codes and two-factor
  'Incorrect or expired code.': 'Code incorrect ou expiré.',
  'Too many wrong codes. Try again in a few minutes.': 'Trop de codes erronés. Réessayez dans quelques minutes.',
  'That code is not right. Check the time on your phone and try again.': 'Ce code n’est pas correct. Vérifiez l’heure de votre téléphone et réessayez.',
  'This sign-in expired. Enter your password again.': 'Cette connexion a expiré. Saisissez de nouveau votre mot de passe.',
  'Choose a new password that is different from the temporary one.': 'Choisissez un nouveau mot de passe différent du mot de passe temporaire.',
  'Two-factor sign-in is not available.': 'La connexion à deux facteurs n’est pas disponible.',
  'Two-factor authentication is not on for this account.': 'L’authentification à deux facteurs n’est pas activée sur ce compte.',
  'Two-factor authentication is already on. Turn it off first to set it up again.':
      'L’authentification à deux facteurs est déjà activée. Désactivez-la d’abord pour la configurer de nouveau.',
  'Two-factor authentication is already on.': 'L’authentification à deux facteurs est déjà activée.',
  'Two-factor authentication is not on.': 'L’authentification à deux facteurs n’est pas activée.',
  'Start the setup first.': 'Commencez d’abord la configuration.',
  'Could not check your account security. Try again.': 'Impossible de vérifier la sécurité de votre compte. Réessayez.',
  'Sessions are not available.': 'Les sessions ne sont pas disponibles.',
  'Invalid or missing token.': 'Session invalide ou absente. Reconnectez-vous.',
  'Your account is not active.': 'Votre compte n’est pas actif.',
  'Your account is switched off. Ask an administrator.': 'Votre compte est désactivé. Contactez un administrateur.',
  // Reviews, orders, stock
  'You already reported this review.': 'Vous avez déjà signalé cet avis.',
  'This review is already hidden.': 'Cet avis est déjà masqué.',
  'Tell the moderators what is wrong with this review (5 to 500 characters).': 'Dites aux modérateurs ce qui ne va pas dans cet avis (5 à 500 caractères).',
  'You cannot buy your own listing.': 'Vous ne pouvez pas acheter votre propre annonce.',
  'This product is no longer available.': 'Ce produit n’est plus disponible.',
};

final List<(RegExp, String Function(RegExpMatch))> kServerPatternsMore = [
  (RegExp(r'^Pay with your wallet or mobile money \((.+)\)\.$'), (m) => 'Payez avec votre portefeuille ou par mobile money (${m[1]!.replaceAll('_', ' ')}).'),
  (RegExp(r'^At most (\d+) lines\.$'), (m) => 'Au plus ${m[1]} lignes.'),
  (RegExp(r'^You can attach up to (\d+) photos\.$'), (m) => 'Vous pouvez joindre ${m[1]} photos au maximum.'),
];
