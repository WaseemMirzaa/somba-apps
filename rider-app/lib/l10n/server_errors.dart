import 'strings.dart';

/// Server errors reach the app in English. The common ones are shown in the
/// user's language; any other message is displayed as received.
String translateServerError(String raw, Strings s) {
  if (!s.isFr) return raw;
  final text = raw.trim();
  final exact = _exactFr[text];
  if (exact != null) return exact;
  for (final p in _patternsFr) {
    final m = p.$1.firstMatch(text);
    if (m != null) return p.$2(m);
  }
  return raw;
}

/// Exposed for tests: every English message the client knows how to translate.
Iterable<String> get knownServerErrors => _exactFr.keys;

final Map<String, String> _exactFr = {
  // sign-in / account
  'Invalid email or password.': 'E-mail ou mot de passe incorrect.',
  'Invalid or expired refresh token.': 'Votre session a expiré. Reconnectez-vous.',
  'Session has been revoked.': 'Votre session a été fermée. Reconnectez-vous.',
  'Sign in to continue.': 'Connectez-vous pour continuer.',
  'Signed out.': 'Vous avez été déconnecté.',
  'This account has been suspended. Contact support.': 'Ce compte est suspendu. Contactez l’assistance.',
  'Account no longer exists.': 'Ce compte n’existe plus.',
  'Account not found.': 'Compte introuvable.',
  'User not found.': 'Utilisateur introuvable.',
  'An account with this email already exists.': 'Un compte existe déjà avec cet e-mail.',
  'That account type cannot be created by self-registration.': 'Ce type de compte ne peut pas être créé par inscription libre.',
  'Password is incorrect.': 'Mot de passe incorrect.',
  'Current password is incorrect.': 'Le mot de passe actuel est incorrect.',
  'Password must be at least 8 characters.': 'Le mot de passe doit contenir au moins 8 caractères.',
  'New password must be at least 8 characters.': 'Le nouveau mot de passe doit contenir au moins 8 caractères.',
  'Enter a valid email.': 'Saisissez un e-mail valide.',
  'Enter a valid phone number.': 'Saisissez un numéro de téléphone valide.',
  'Enter a valid mobile-money phone number, e.g. +243 81 234 5678.': 'Saisissez un numéro mobile money valide, par ex. +243 81 234 5678.',
  'Add a phone number to your profile first.': 'Ajoutez d’abord un numéro de téléphone à votre profil.',
  'Name must be 2–80 characters.': 'Le nom doit contenir entre 2 et 80 caractères.',
  'Locale must be en or fr.': 'La langue doit être « en » ou « fr ».',
  'Invalid or expired link.': 'Lien invalide ou expiré.',
  'Incorrect code.': 'Code incorrect.',
  'Code expired or too many attempts. Request a new code.': 'Code expiré ou trop de tentatives. Demandez un nouveau code.',
  'Please wait before requesting another code.': 'Patientez avant de demander un nouveau code.',
  'Please wait before requesting another email.': 'Patientez avant de demander un nouvel e-mail.',
  // permissions / generic
  'Not allowed.': 'Action non autorisée.',
  'Customers only.': 'Réservé aux clients.',
  'Riders only.': 'Réservé aux livreurs.',
  'Sellers only.': 'Réservé aux vendeurs.',
  'Staff only.': 'Réservé au personnel.',
  'Admins only.': 'Réservé aux administrateurs.',
  'Ops only.': 'Réservé aux opérations.',
  'Too many requests — slow down.': 'Trop de requêtes. Veuillez ralentir.',
  'Too many attempts. Please wait a minute.': 'Trop de tentatives. Patientez une minute.',
  'Payload too large.': 'Données trop volumineuses.',
  'This request was already handled.': 'Cette demande a déjà été traitée.',
  // delivery (rider)
  'Delivery task not found.': 'Livraison introuvable.',
  'This delivery is no longer available.': 'Cette livraison n’est plus disponible.',
  'This delivery was just updated. Refresh and try again.': 'Cette livraison vient d’être mise à jour. Actualisez et réessayez.',
  'Wrong delivery code. Ask the customer for the 4-digit code shown in their app.':
      'Code de livraison incorrect. Demandez au client le code à 4 chiffres affiché dans son application.',
  'This order has no delivery waiting for pickup.': 'Cette commande n’a aucune livraison en attente de ramassage.',
  'Invalid delivery status.': 'Statut de livraison invalide.',
  'Choose an active rider.': 'Choisissez un livreur actif.',
  'A valid device token is required.': 'Un jeton d’appareil valide est requis.',
  // network (generated on the device)
  'Socket not connected.': 'Pas de connexion au serveur.',
};

final List<(RegExp, String Function(RegExpMatch))> _patternsFr = [
  (RegExp(r'^A (.+) delivery cannot become (.+)\.$'), (m) => 'Une livraison « ${_taskStatus(m[1]!)} » ne peut pas passer à « ${_taskStatus(m[2]!)} ».'),
  (RegExp(r'^Request failed \((\d+)\)\.$'), (m) => 'La requête a échoué (${m[1]}).'),
  (RegExp(r'^email must be an email$'), (m) => 'Saisissez un e-mail valide.'),
  (RegExp(r'^password must be longer than or equal to (\d+) characters$'), (m) => 'Le mot de passe doit contenir au moins ${m[1]} caractères.'),
  (RegExp(r'^(\w+) should not be empty$'), (m) => 'Un champ obligatoire est vide.'),
];

String _taskStatus(String s) => switch (s) {
      'unassigned' => 'disponible',
      'assigned' => 'assignée',
      'picked up' => 'récupérée',
      'in transit' => 'en route',
      'delivered' => 'livrée',
      'failed' => 'échouée',
      _ => s,
    };
