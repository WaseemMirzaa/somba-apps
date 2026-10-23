import 'strings.dart';

/// The server writes notifications (and wallet history lines) in English.
/// The common ones are shown in French; anything else is shown as received.
(String, String) localizeNotification(Strings s, String title, String body) {
  if (!s.isFr) return (title, body);
  final t = _titles[title] ?? _titlePattern(title) ?? title;
  var b = body;
  for (final p in _bodies) {
    final m = p.$1.firstMatch(body);
    if (m != null) {
      b = p.$2(m);
      break;
    }
  }
  return (t, b);
}

/// A wallet history line ("Wallet top-up via airtel_money") in the user's language.
String localizeWalletDescription(Strings s, String text) {
  for (final p in _walletLines) {
    final m = p.$1.firstMatch(text);
    if (m != null) return p.$2(s, m);
  }
  return text;
}

String _method(String m) => const {
      'airtel_money': 'Airtel Money',
      'orange_money': 'Orange Money',
      'vodacom_mpesa': 'Vodacom M-Pesa',
    }[m.replaceAll(' ', '_')] ??
    m.replaceAll('_', ' ');

String _status(String s) => switch (s.replaceAll(' ', '_')) {
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

const Map<String, String> _titles = {
  'Approve your payment': 'Validez votre paiement',
  'Order placed': 'Commande enregistrée',
  'Order cancelled': 'Commande annulée',
  'Order update': 'Mise à jour de la commande',
  'Rider assigned': 'Livreur assigné',
  'Parcel at our warehouse': 'Colis à notre entrepôt',
  'Delivery update': 'Suivi de la livraison',
  'Delivery attempt failed': 'Échec de la livraison',
  'Payment': 'Paiement',
  'Payment received': 'Paiement reçu',
  'Payment failed': 'Paiement échoué',
  'Refund issued': 'Remboursement effectué',
  'Refund sent': 'Remboursement envoyé',
  'Return requested': 'Retour demandé',
  'Return received': 'Retour reçu',
  'Dispute opened': 'Litige ouvert',
  'Dispute resolved': 'Litige résolu',
  'Dispute closed': 'Litige clôturé',
  'Exchange requested': 'Échange demandé',
  'Replacement requested': 'Remplacement demandé',
};

String? _titlePattern(String title) {
  final m = RegExp(r'^(Exchange|Replacement) (\w+)$').firstMatch(title);
  if (m == null) return null;
  final what = m[1] == 'Exchange' ? 'Échange' : 'Remplacement';
  final st = switch (m[2]) {
    'approved' => 'approuvé',
    'rejected' => 'refusé',
    'completed' => 'terminé',
    'requested' => 'demandé',
    _ => m[2]!,
  };
  return '$what $st';
}

final List<(RegExp, String Function(RegExpMatch))> _bodies = [
  (RegExp(r'^(\S+) reached the Somba&Teka warehouse and will be on its way soon\.$'), (m) => '${m[1]} est arrivé à l’entrepôt Somba&Teka et sera bientôt en route.'),
  (RegExp(r'^Approve the (.+) request on your phone to confirm (\S+)\.$'), (m) => 'Validez la demande ${_method(m[1]!)} sur votre téléphone pour confirmer ${m[2]}.'),
  (RegExp(r"^We received (\S+)\. You'll get updates here in real time\.$"), (m) => 'Nous avons reçu ${m[1]}. Vous recevrez les mises à jour ici en temps réel.'),
  (RegExp(r'^(\S+) is now (.+)\.$'), (m) => '${m[1]} est maintenant ${_status(m[2]!)}.'),
  (RegExp(r'^(\S+) was cancelled\. Refund credited to your wallet\.$'), (m) => '${m[1]} a été annulée. Le remboursement a été crédité sur votre portefeuille.'),
  (RegExp(r'^(\S+) was cancelled\. \$([\d.]+) was refunded to your wallet\.$'), (m) => '${m[1]} a été annulée. ${m[2]} \$ ont été remboursés sur votre portefeuille.'),
  (RegExp(r'^(\S+) was cancelled\.$'), (m) => '${m[1]} a été annulée.'),
  (RegExp(r'^(\S+) was cancelled: (.+)\.$'), (m) => '${m[1]} a été annulée : ${translateReason(m[2]!)}.'),
  (RegExp(r'^(.+) is handling (\S+)\.$'), (m) => '${m[1]} s’occupe de ${m[2]}.'),
  (RegExp(r'^(\S+): (.+)\. We will try again \(attempt (\d+) of (\d+)\)\. You can also cancel the order\.$'),
      (m) => '${m[1]} : ${m[2]}. Nous allons réessayer (tentative ${m[3]} sur ${m[4]}). Vous pouvez aussi annuler la commande.'),
  (RegExp(r'^(\S+) could not be delivered after (\d+) attempts \((.+)\)\. \$([\d.]+) was refunded to your wallet\.$'),
      (m) => '${m[1]} n’a pas pu être livrée après ${m[2]} tentatives (${m[3]}). ${m[4]} \$ ont été remboursés sur votre portefeuille.'),
  (RegExp(r'^(\S+) could not be delivered after (\d+) attempts \((.+)\)\.( Your payment was refunded to your wallet\.)?$'),
      (m) => '${m[1]} n’a pas pu être livrée après ${m[2]} tentatives (${m[3]}).${m[4] != null ? ' Votre paiement a été remboursé sur votre portefeuille.' : ''}'),
  (RegExp(r'^\$([\d.]+) added to your wallet\.$'), (m) => '${m[1]} \$ ajoutés à votre portefeuille.'),
  (RegExp(r'^Payment for (\S+) confirmed\.$'), (m) => 'Le paiement de ${m[1]} est confirmé.'),
  (RegExp(r'^\$([\d.]+) for (\S+)( → wallet)?\.$'), (m) => '${m[1]} \$ pour ${m[2]}${m[3] != null ? ' → portefeuille' : ''}.'),
  (RegExp(r'^\$([\d.]+) for (\S+) is on its way back to your mobile-money number\.$'), (m) => '${m[1]} \$ pour ${m[2]} reviennent sur votre numéro mobile money.'),
  (RegExp(r'^\$([\d.]+) for (\S+) was sent to your mobile-money number\.$'), (m) => '${m[1]} \$ pour ${m[2]} ont été envoyés sur votre numéro mobile money.'),
  (RegExp(r'^\$([\d.]+) for (\S+) → wallet \(the network could not take it back to your phone\)\.$'),
      (m) => '${m[1]} \$ pour ${m[2]} → portefeuille (le réseau n’a pas pu les renvoyer sur votre téléphone).'),
  (RegExp(r'^(\S+): we received your goods\. Your request is being reviewed\.$'), (m) => '${m[1]} : nous avons reçu vos articles. Votre demande est en cours d’examen.'),
];

/// Reasons the server attaches to a failed payment or delivery.
String translateReason(String r) => const {
      'payment was not completed': 'le paiement n’a pas abouti',
      'Payment was not approved.': 'Le paiement n’a pas été validé.',
      'Declined by subscriber.': 'Refusé par l’abonné.',
      'Declined by finance.': 'Refusé par la comptabilité.',
      'Timed out waiting for approval.': 'Délai de validation dépassé.',
      'Cancelled by customer.': 'Annulé par le client.',
    }[r] ??
    r;

final List<(RegExp, String Function(Strings, RegExpMatch))> _walletLines = [
  (RegExp(r'^Order (\S+)$'), (s, m) => s.wtxOrder(m[1])),
  (RegExp(r'^Wallet top-up via (\S+)$'), (s, m) => s.wtxTopup(_method(m[1]!))),
  (RegExp(r'^Refund for cancelled order (\S+)$'), (s, m) => s.wtxRefundCancelled(m[1])),
  (RegExp(r'^Refund for (\S+)$'), (s, m) => s.wtxRefund(m[1])),
  (RegExp(r'^Payout (\S+)$'), (s, m) => s.wtxPayout(m[1])),
];
