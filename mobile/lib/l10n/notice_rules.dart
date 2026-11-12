import 'strings.dart';

// French wording for the server notices a customer can receive (the phone's own fallback, used when the server's
// `titleFr` / `bodyFr` are absent: older rows, a push that carries only English). A port of the notices of
// `api/src/notifications/localize.ts` that reach a shopper; seller and admin notices are not listed here.
// Dynamic parts (references, product and store names, text people typed) pass through as is.

/// A dollar amount the server wrote in English ("1202.50") as French money ("1 202,50 $").
String noticeMoney(String raw) {
  final v = double.tryParse(raw);
  return v == null ? '$raw \$' : const Strings('fr').usd(v);
}

String _pick(Map<String, String> table, String key) => table[key] ?? key;

const Map<String, String> _paymentStatuses = {
  'pending': 'en attente',
  'succeeded': 'réussi',
  'failed': 'échoué',
  'refunded': 'remboursé',
};

const Map<String, String> _afterSaleSteps = {
  'requested': 'demandé',
  'approved': 'approuvé',
  'rejected': 'refusé',
  'completed': 'terminé',
  'received': 'reçu',
  'ready': 'prêt',
  'allocated': 'attribué',
  'dispatched': 'expédié',
  'delivered': 'livré',
};

/// How a payment method reads in French ("airtel_money" or "Airtel Money" in any case).
String noticeMethod(String m) {
  final id = m.trim().toLowerCase().replaceAll(RegExp(r'[\s-]+'), '_');
  return const {
        'airtel_money': 'Airtel Money',
        'orange_money': 'Orange Money',
        'vodacom_mpesa': 'Vodacom M-Pesa',
        'm_pesa': 'Vodacom M-Pesa',
        'stripe_card': 'carte bancaire',
        'card': 'carte bancaire',
        'wallet': 'portefeuille',
      }[id] ??
      m.replaceAll('_', ' ');
}

const Map<String, String> _resolutions = {
  'Refunded to wallet': 'Remboursé sur le portefeuille',
  'Resolved': 'Résolu',
  'Rejected': 'Refusé',
  'Partially refunded': 'Remboursement partiel',
  'Replacement approved': 'Remplacement approuvé',
  'Cancelled by the customer': 'Annulé par le client',
};

/// A dispute's resolution in French: the stock phrases the server writes are translated, text an agent typed is theirs.
String translateResolution(String r) => _resolutions[r.trim()] ?? r;

const Map<String, String> _reasons = {
  // Failed payments (mobile-money network, finance, the customer)
  'payment was not completed': 'le paiement n’a pas abouti',
  'Payment was not approved.': 'Le paiement n’a pas été validé.',
  'Declined by subscriber.': 'Refusé par l’abonné.',
  'Declined by finance.': 'Refusé par la comptabilité.',
  'Timed out waiting for approval.': 'Délai de validation dépassé.',
  'Timed out waiting for the card payment.': 'Délai de paiement par carte dépassé.',
  'The card payment was cancelled.': 'Le paiement par carte a été annulé.',
  'Could not reach the card processor. Please try again.': 'Impossible de joindre le prestataire de paiement par carte. Veuillez réessayer.',
  'Could not start the card payment. Please try again.': 'Impossible de démarrer le paiement par carte. Veuillez réessayer.',
  'Cancelled by customer.': 'Annulé par le client.',
  'Insufficient wallet balance.': 'Solde du portefeuille insuffisant.',
  'Could not reach the mobile-money network. Please try again.': 'Impossible de joindre le réseau mobile money. Veuillez réessayer.',
  'the transfer failed': 'le transfert a échoué',
  // Why a rider could not deliver (the rider app's choices, and the server default)
  'Customer not reachable': 'Client injoignable',
  'Customer unreachable': 'Client injoignable',
  'Wrong address': 'Adresse incorrecte',
  'Customer refused': 'Le client a refusé',
  'Could not be delivered': 'N’a pas pu être livré',
  'Payment issue': 'Problème de paiement',
  'Other': 'Autre',
  'Refunded': 'Remboursé',
  'Order cancelled': 'Commande annulée',
  // Why an item or an order was cancelled (the stock phrases of the sellers' and agents' consoles)
  'Out of stock': 'Rupture de stock',
  'Item out of stock': 'Article en rupture de stock',
  'Customer request': 'Demande du client',
  'Cancelled by the seller': 'Annulé par le vendeur',
  'Cancelled by KOMORIKO': 'Annulé par KOMORIKO',
};

/// Reasons the server attaches to a failed payment, a cancelled item or a failed delivery.
String translateReasonText(String r) {
  final t = r.trim();
  final exact = _reasons[t];
  if (exact != null) return exact;
  final network = RegExp(r'^The mobile-money network refused the payment: ([\s\S]+)$').firstMatch(t);
  if (network != null) return 'Le réseau mobile money a refusé le paiement : ${network[1]}';
  final other = RegExp(r'^Other: ([\s\S]+)$').firstMatch(t);
  if (other != null) return 'Autre : ${other[1]}';
  return r;
}

/// Notice titles that need no data to translate.
const Map<String, String> kNoticeTitlesFr = {
  'Complete your payment': 'Finalisez votre paiement',
  'Pickup scheduled': 'Enlèvement programmé',
  'Package at the warehouse': 'Colis à l’entrepôt',
  'Package collected': 'Colis récupéré',
  'Item cancelled by the seller': 'Article annulé par le vendeur',
  'Return requested on your order': 'Retour demandé sur votre commande',
  'Dispute opened on your order': 'Litige ouvert sur votre commande',
  'Returned goods received': 'Articles retournés reçus',
  'Return resolved': 'Retour résolu',
  'Return closed': 'Retour clôturé',
  'Return accepted': 'Retour accepté',
  'Return approved': 'Retour approuvé',
  'Return rejected': 'Retour refusé',
  'Return reply': 'Réponse au retour',
  'Dispute reply': 'Réponse au litige',
  'Seller did not respond': 'Le vendeur n’a pas répondu',
  'Returned goods graded': 'Articles retournés contrôlés',
  'Phone refund failed': 'Échec du remboursement mobile',
  'Card refund failed': 'Échec du remboursement par carte',
  'Support reply': 'Réponse de l’assistance',
  'Ticket resolved': 'Ticket résolu',
  'Ticket closed': 'Ticket clôturé',
  'Ticket reopened': 'Ticket rouvert',
  'The seller replied to your review': 'Le vendeur a répondu à votre avis',
  'Your review was hidden': 'Votre avis a été masqué',
  'Your review is visible again': 'Votre avis est de nouveau visible',
  'Your question was answered': 'Votre question a reçu une réponse',
  'Account blocked': 'Compte bloqué',
  'Account unblocked': 'Compte débloqué',
  'Account suspended': 'Compte suspendu',
  'Account reinstated': 'Compte réactivé',
  'Test notification': 'Notification de test',
  'New message from the seller': 'Nouveau message du vendeur',
  'Two-factor authentication enabled': 'Authentification à deux facteurs activée',
  'Two-factor authentication disabled': 'Authentification à deux facteurs désactivée',
  'Two-factor authentication reset': 'Authentification à deux facteurs réinitialisée',
  'New from a store you follow': 'Nouveau chez une boutique que vous suivez',
  'Flash sale started': 'Vente flash démarrée',
  'Flash sale ended': 'Vente flash terminée',
};

/// Titles with a word that changes ("Exchange approved", "Replacement shipped").
String? noticeTitlePattern(String title) {
  final after = RegExp(r'^(Exchange|Replacement) (\w+)$').firstMatch(title);
  if (after != null) return '${after[1] == 'Exchange' ? 'Échange' : 'Remplacement'} ${_pick(_afterSaleSteps, after[2]!)}';
  return null;
}

/// Bodies of the notices a customer receives; first match wins, specific patterns before general ones.
final List<(RegExp, String Function(RegExpMatch))> kNoticeBodiesFr = [
  (RegExp(r'^Complete the card payment to confirm (\S+)\.$'), (m) => 'Finalisez le paiement par carte pour confirmer ${m[1]}.'),
  (RegExp(r'^(\S+): a rider will collect your package\.$'), (m) => '${m[1]} : un livreur viendra récupérer votre colis.'),
  (RegExp(r'^(\S+): your package reached the warehouse\.$'), (m) => '${m[1]} : votre colis est arrivé à l’entrepôt.'),
  (RegExp(r'^(\S+): the rider collected your package and is taking it to the customer\.$'),
      (m) => '${m[1]} : le livreur a récupéré votre colis et l’emmène chez le client.'),
  (RegExp(r'^(\S+) could not be delivered and is going back to the seller\. Our team will contact you about your order\.$'),
      (m) => '${m[1]} n’a pas pu être livrée et retourne chez le vendeur. Notre équipe vous contactera au sujet de votre commande.'),
  (RegExp(r'^(\S+): (.+) was cancelled \((.+)\)\.( \$([\d.]+) was refunded to your wallet\.)? The rest of your order continues\.$'),
      (m) =>
          '${m[1]} : ${m[2]} a été annulé (${translateReasonText(m[3]!)}).${m[4] != null ? ' ${noticeMoney(m[5]!)} ont été remboursés sur votre portefeuille.' : ''} Le reste de votre commande continue.'),
  (RegExp(r'^(\S+): part of your order is on its way\. The rest will follow\.$'),
      (m) => '${m[1]} : une partie de votre commande est en route. Le reste suivra.'),
  (RegExp(r'^(\S+): part of your order was delivered\. The rest will follow\.$'),
      (m) => '${m[1]} : une partie de votre commande a été livrée. Le reste suivra.'),
  (RegExp(r'^(\S+): (.+) could not be delivered \((.+)\)\.( \$([\d.]+) was refunded to your wallet\.)?$'),
      (m) => '${m[1]} : ${m[2]} n’a pas pu être livré (${translateReasonText(m[3]!)}).${m[5] != null ? ' ${noticeMoney(m[5]!)} ont été remboursés sur votre portefeuille.' : ''}'),
  (RegExp(r'^(\S+): (.+)\. We will try again \(attempt (\d+) of (\d+)\)\.$'),
      (m) => '${m[1]} : ${translateReasonText(m[2]!)}. Nous allons réessayer (tentative ${m[3]} sur ${m[4]}).'),
  (RegExp(r'^(\S+) was cancelled by KOMORIKO support: (.+?)\.( \$([\d.]+) was refunded to your wallet\.)?$'),
      (m) =>
          '${m[1]} a été annulée par l’assistance KOMORIKO : ${translateReasonText(m[2]!)}.${m[3] != null ? ' ${noticeMoney(m[4]!)} ont été remboursés sur votre portefeuille.' : ''}'),
  (RegExp(r'^\$([\d.]+) for (\S+) is on its way back to your card\.$'), (m) => '${noticeMoney(m[1]!)} pour ${m[2]} reviennent sur votre carte.'),
  (RegExp(r'^\$([\d.]+) for (\S+) was sent back to your card\.$'), (m) => '${noticeMoney(m[1]!)} pour ${m[2]} ont été renvoyés sur votre carte.'),
  (RegExp(r'^\$([\d.]+) for (\S+) → wallet \(the card refund could not be completed\)\.$'),
      (m) => '${noticeMoney(m[1]!)} pour ${m[2]} → portefeuille (le remboursement sur la carte n’a pas pu aboutir).'),
  (RegExp(r'^(\S+) · (.+?) · \$([\d.]+) · (\w+)$'),
      (m) => '${m[1]} · ${noticeMethod(m[2]!)} · ${noticeMoney(m[3]!)} · ${_pick(_paymentStatuses, m[4]!)}'),
  (RegExp(r'^Payment for your (.*) seller plan confirmed\.$'), (m) => 'Le paiement de votre abonnement vendeur ${m[1]} est confirmé.'),
  // Returns, disputes, support, reviews
  (RegExp(r'^(\S+) · (\S+): the warehouse received the returned goods\.$'), (m) => '${m[1]} · ${m[2]} : l’entrepôt a reçu les articles retournés.'),
  (RegExp('^(\\S+)( · \\S+)?: (${_resolutions.keys.map(RegExp.escape).join('|')})\$'),
      (m) => '${m[1]}${m[2] ?? ''} : ${_pick(_resolutions, m[3]!)}'),
  (RegExp(r'^Your review: ([\s\S]*)$'), (m) => 'Votre avis : ${m[1]}'),
  // Account
  (RegExp(r'^Signing in to your account now asks for a code from your authenticator app\.$'),
      (m) => 'La connexion à votre compte demande maintenant un code de votre application d’authentification.'),
  (RegExp(r'^Two-factor authentication was turned off on your account\.$'), (m) => 'L’authentification à deux facteurs a été désactivée sur votre compte.'),
  (RegExp(r'^A super admin reset two-factor authentication on your account\. Sign in again and set it up again\.$'),
      (m) => 'Un super admin a réinitialisé l’authentification à deux facteurs de votre compte. Reconnectez-vous et configurez-la de nouveau.'),
  (RegExp(r'^Your account is suspended\. Contact support for help\.$'), (m) => 'Votre compte est suspendu. Contactez le support pour obtenir de l’aide.'),
  (RegExp(r'^Your account is active again\.$'), (m) => 'Votre compte est de nouveau actif.'),
  (RegExp(r'^Notifications reach this account\. If push is set up, your devices show this too\.$'),
      (m) => 'Les notifications arrivent bien sur ce compte. Si les notifications push sont configurées, vos appareils affichent aussi celle-ci.'),
  // Flash sales and follows
  (RegExp(r'^(.+) is now on flash sale at \$([\d.]+)\.$'), (m) => '${m[1]} est maintenant en vente flash à ${noticeMoney(m[2]!)}.'),
  (RegExp(r'^(.+): the flash sale has ended; the price is back to normal\.$'), (m) => '${m[1]} : la vente flash est terminée ; le prix est revenu à la normale.'),
  (RegExp(r'^(.+) · (\d+(?:\.\d+)?)% off$'), (m) => '${m[1]} · ${m[2]} % de réduction'),
];

/// Wallet history lines beyond the ones `Strings` knows (French only: English is what the server wrote).
final List<(RegExp, String Function(RegExpMatch))> kWalletLinesFr = [
  (RegExp(r'^Refund for (\S+) \(phone refund failed\)$'), (m) => 'Remboursement de ${m[1]} (échec du remboursement mobile)'),
  (RegExp(r'^Refund for (\S+) \(card refund failed\)$'), (m) => 'Remboursement de ${m[1]} (échec du remboursement par carte)'),
  (RegExp(r'^Refund for (\S+) \(returned items\)$'), (m) => 'Remboursement de ${m[1]} (articles retournés)'),
  (RegExp(r'^Refund for (\S+) \(dispute\)$'), (m) => 'Remboursement de ${m[1]} (litige)'),
  (RegExp(r'^Exchange (\S+): price difference$'), (m) => 'Échange ${m[1]} : différence de prix'),
  (RegExp(r'^Exchange (\S+): price difference refunded$'), (m) => 'Échange ${m[1]} : différence de prix remboursée'),
  (RegExp(r'^Exchange (\S+) rejected: price difference returned$'), (m) => 'Échange ${m[1]} refusé : différence de prix restituée'),
  (RegExp(r'^Refund: seller cancelled part of (\S+)$'), (m) => 'Remboursement : le vendeur a annulé une partie de ${m[1]}'),
  (RegExp(r'^Seller plan (\S+)$'), (m) => 'Abonnement vendeur ${m[1]}'),
  (RegExp(r'^Welcome store credit$'), (m) => 'Crédit de bienvenue'),
];
