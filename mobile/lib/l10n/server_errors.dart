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
  // catalogue / orders
  'Product not found.': 'Produit introuvable.',
  'Unknown product. Refresh the catalogue and try again.': 'Produit inconnu. Actualisez le catalogue et réessayez.',
  'Order not found.': 'Commande introuvable.',
  'Order not found or not eligible for an exchange.': 'Commande introuvable ou non éligible à un échange.',
  'Order not found or not eligible for a replacement.': 'Commande introuvable ou non éligible à un remplacement.',
  'An order needs at least one item.': 'Une commande doit contenir au moins un article.',
  'Order total must be greater than zero.': 'Le total de la commande doit être supérieur à zéro.',
  'Choose a valid delivery zone.': 'Choisissez une zone de livraison valide.',
  'Invalid delivery fee.': 'Frais de livraison invalides.',
  'Invalid item price.': 'Prix d’article invalide.',
  'Unknown payment method.': 'Moyen de paiement inconnu.',
  'Cash on delivery is not available.': 'Le paiement à la livraison n’est pas disponible.',
  'Card payments are not available.': 'Les paiements par carte ne sont pas disponibles.',
  'Mobile money is not available yet. Please use another method.': 'Le mobile money n’est pas encore disponible. Utilisez un autre moyen de paiement.',
  'Insufficient wallet balance.': 'Solde du portefeuille insuffisant.',
  'Awaiting payment — this order cannot be fulfilled yet.': 'En attente de paiement : cette commande ne peut pas encore être traitée.',
  'This order has not been paid for or was cancelled.': 'Cette commande n’a pas été payée ou a été annulée.',
  'This order was cancelled and has already been settled.': 'Cette commande a été annulée et déjà réglée.',
  'Use cancel so stock and refunds are handled.': 'Utilisez l’annulation pour que le stock et les remboursements soient gérés.',
  'Unknown order status.': 'Statut de commande inconnu.',
  'A delivered order can only be marked returned.': 'Une commande livrée ne peut être que marquée comme retournée.',
  'Payment not found.': 'Paiement introuvable.',
  'No payment for this order.': 'Aucun paiement pour cette commande.',
  'This payment is being processed right now.': 'Ce paiement est en cours de traitement.',
  'You already have pending top-ups. Approve or wait for them to expire first.':
      'Vous avez déjà des recharges en attente. Validez-les ou attendez leur expiration.',
  'Top-up must be positive.': 'Le montant de la recharge doit être positif.',
  'Amount must be greater than zero.': 'Le montant doit être supérieur à zéro.',
  'Amount must be a positive number.': 'Le montant doit être un nombre positif.',
  'Already refunded.': 'Déjà remboursé.',
  'Only a completed payment can be refunded.': 'Seul un paiement abouti peut être remboursé.',
  // promos, reviews, questions, support
  'That code already exists.': 'Ce code existe déjà.',
  'Invalid expiry date.': 'Date d’expiration invalide.',
  'You have already reviewed this product.': 'Vous avez déjà donné votre avis sur ce produit.',
  'You can review a product after it has been delivered to you.': 'Vous pourrez donner votre avis sur un produit une fois qu’il vous aura été livré.',
  'Give a rating and write a short review.': 'Donnez une note et rédigez un court avis.',
  'Write your question first.': 'Écrivez d’abord votre question.',
  'Write a message first.': 'Écrivez d’abord un message.',
  'Subject and message are required.': 'L’objet et le message sont obligatoires.',
  'Ticket not found.': 'Ticket introuvable.',
  // promo codes
  'Invalid code.': 'Code invalide.',
  'This code has expired.': 'Ce code a expiré.',
  'This code is no longer available.': 'Ce code n’est plus disponible.',
  'You have already used this code.': 'Vous avez déjà utilisé ce code.',
  // payment outcomes
  'Payment failed.': 'Le paiement a échoué.',
  'Payment was not approved.': 'Le paiement n’a pas été validé.',
  'Declined by subscriber.': 'Refusé par l’abonné.',
  'Declined by finance.': 'Refusé par la comptabilité.',
  'Timed out waiting for approval.': 'Délai de validation dépassé.',
  'Cancelled by customer.': 'Annulé par le client.',
  'Could not reach the mobile-money network. Please try again.': 'Impossible de joindre le réseau mobile money. Veuillez réessayer.',
  // addresses
  'Street address and city are required.': 'L’adresse (rue) et la ville sont obligatoires.',
  // returns / exchanges
  'You already have an open request for this order.': 'Vous avez déjà une demande en cours pour cette commande.',
  'Please describe the problem (at least a few words).': 'Décrivez le problème (quelques mots au moins).',
  'Say which item you want to exchange and for what.': 'Indiquez l’article à échanger et ce que vous souhaitez en échange.',
  'Say which item needs replacing.': 'Indiquez l’article à remplacer.',
  'Dispute not found.': 'Litige introuvable.',
  'Exchange not found.': 'Échange introuvable.',
  'Replacement not found.': 'Remplacement introuvable.',
  'Mark the returned goods as received at the warehouse before refunding.': 'Marquez d’abord les articles retournés comme reçus à l’entrepôt avant de rembourser.',
  'Only returns have goods to receive.': 'Seuls les retours ont des articles à réceptionner.',
  'These goods were already marked as received.': 'Ces articles ont déjà été marqués comme reçus.',
  // uploads
  'Attach an image in the "file" field.': 'Joignez une image dans le champ « file ».',
  'Only JPEG, PNG or WebP images are allowed.': 'Seules les images JPEG, PNG ou WebP sont acceptées.',
  'That file is not a valid image.': 'Ce fichier n’est pas une image valide.',
  'Invalid avatar URL.': 'URL d’avatar invalide.',
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
  (RegExp(r'^"(.+)" just sold out or has too little stock left\.$'), (m) => '« ${m[1]} » est épuisé ou n’a plus assez de stock.'),
  (RegExp(r'^"(.+)" is not available\.$'), (m) => '« ${m[1]} » n’est pas disponible.'),
  (RegExp(r'^Insufficient wallet balance \(\$([\d.,]+) < \$([\d.,]+)\)\.$'),
      (m) => 'Solde du portefeuille insuffisant (${m[1]} \$ sur ${m[2]} \$ nécessaires).'),
  (RegExp(r'^Order can no longer be cancelled \(status: (\w+)\)\.$'), (m) => 'Cette commande ne peut plus être annulée (statut : ${_status(m[1]!)}).'),
  (RegExp(r'^A (\w+) order can no longer change\.$'), (m) => 'Une commande ${_status(m[1]!).toLowerCase()} ne peut plus être modifiée.'),
  (RegExp(r'^Quantity must be a whole number from 1 to (\d+)\.$'), (m) => 'La quantité doit être un nombre entier de 1 à ${m[1]}.'),
  (RegExp(r'^This payment is already (\w+)\.$'), (m) => 'Ce paiement est déjà ${_payStatus(m[1]!)}.'),
  (RegExp(r'^The minimum payout is \$([\d.,]+)\.$'), (m) => 'Le paiement minimum est de ${m[1]} \$.'),
  (RegExp(r'^You can withdraw up to \$([\d.,]+) right now\.$'), (m) => 'Vous pouvez retirer jusqu’à ${m[1]} \$ pour le moment.'),
  (RegExp(r'^Top-up method must be one of: (.+)\.$'), (m) => 'Le moyen de recharge doit être l’un des suivants : ${m[1]}.'),
  (RegExp(r'^An order that is (.+) cannot be marked ready\.$'), (m) => 'Une commande « ${m[1]} » ne peut pas être marquée comme prête.'),
  (RegExp(r'^A (\w+) parcel cannot be received\.$'), (m) => 'Un colis « ${m[1]} » ne peut pas être réceptionné.'),
  (RegExp(r'^A (.+) delivery cannot become (.+)\.$'), (m) => 'Une livraison « ${m[1]} » ne peut pas passer à « ${m[2]} ».'),
  (RegExp(r'^Minimum order \$([\d.,]+)\.$'), (m) => 'Commande minimum de ${m[1]} \$.'),
  (RegExp(r'^Request failed \((\d+)\)\.$'), (m) => 'La requête a échoué (${m[1]}).'),
  // class-validator messages (sign-up / reset forms)
  (RegExp(r'^email must be an email$'), (m) => 'Saisissez un e-mail valide.'),
  (RegExp(r'^password must be longer than or equal to (\d+) characters$'), (m) => 'Le mot de passe doit contenir au moins ${m[1]} caractères.'),
  (RegExp(r'^name must be longer than or equal to (\d+) characters$'), (m) => 'Le nom doit contenir au moins ${m[1]} caractères.'),
  (RegExp(r'^(\w+) should not be empty$'), (m) => 'Un champ obligatoire est vide.'),
];

String _status(String s) => switch (s) {
      'pending' => 'en attente',
      'confirmed' => 'confirmée',
      'processing' => 'en préparation',
      'shipped' => 'expédiée',
      'out_for_delivery' => 'en cours de livraison',
      'delivered' => 'livrée',
      'cancelled' => 'annulée',
      'returned' => 'retournée',
      _ => s,
    };

String _payStatus(String s) => switch (s) {
      'succeeded' => 'confirmé',
      'failed' => 'échoué',
      'pending' => 'en attente',
      'refunded' => 'remboursé',
      _ => s,
    };
