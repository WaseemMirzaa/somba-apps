import 'strings.dart';

/// The server writes notifications in English. The ones riders receive are
/// shown in French; anything else is shown as received.
(String, String) localizeNotification(Strings s, String title, String body) {
  if (!s.isFr) return (title, body);
  final t = switch (title) {
    'Parcel ready for pickup' => 'Colis prêt à récupérer',
    'New order' => 'Nouvelle commande',
    'Delivery update' => 'Suivi de la livraison',
    'Order update' => 'Mise à jour de la commande',
    'Order cancelled' => 'Commande annulée',
    'New delivery available' => 'Nouvelle livraison disponible',
    'New delivery assigned to you' => 'Nouvelle livraison pour vous',
    'New task assigned to you' => 'Nouvelle tâche qui vous est assignée',
    'Task needs attention' => 'Tâche à vérifier',
    'Task to assign' => 'Tâche à confier à un livreur',
    'Support reply' => 'Réponse de l’assistance',
    'New reply on a ticket' => 'Nouvelle réponse sur un ticket',
    'Ticket assigned to you' => 'Ticket qui vous est assigné',
    'Ticket resolved' => 'Ticket résolu',
    'Ticket closed' => 'Ticket clôturé',
    'Ticket reopened' => 'Ticket rouvert',
    'Task updated' => 'Tâche mise à jour',
    'Delivery code unlocked' => 'Code de livraison déverrouillé',
    'Transfer run assigned' => 'Tournée de transfert assignée',
    'Transfer run on its way' => 'Tournée de transfert en route',
    'Document approved' => 'Document approuvé',
    'Document rejected' => 'Document refusé',
    'Account blocked' => 'Compte bloqué',
    'Account unblocked' => 'Compte débloqué',
    'Account suspended' => 'Compte suspendu',
    'Account reinstated' => 'Compte réactivé',
    'Test notification' => 'Notification de test',
    'Pickup scheduled' => 'Enlèvement programmé',
    _ => _assignedMany(title) ?? title,
  };
  var b = body;
  for (final p in [..._moreBodies, ..._bodies]) { // the specific shapes first: the general "X is now in your tasks" would swallow a transfer run's
    final m = p.$1.firstMatch(body);
    if (m != null) {
      b = p.$2(m);
      break;
    }
  }
  return (t, b);
}

/// What to show for a notice: the server's own French wording ([titleFr] / [bodyFr]) when French is asked and
/// present, else the phone's patterns above (older servers), else the text as received.
(String, String) displayNotice(Strings s, {required String title, required String body, String? titleFr, String? bodyFr}) {
  if (!s.isFr) return (title, body);
  final fallback = localizeNotification(s, title, body);
  // A "French" text that is only a copy of the English was never translated: the phone's own wording is better.
  String pick(String? served, String english, String phone) {
    final f = _nonBlank(served);
    return f != null && f != english.trim() ? f : phone;
  }

  return (pick(titleFr, title, fallback.$1), pick(bodyFr, body, fallback.$2));
}

String? _nonBlank(String? v) => v == null || v.trim().isEmpty ? null : v.trim();

/// "3 deliveries assigned to you" (a batch from the warehouse).
String? _assignedMany(String title) {
  final m = RegExp(r'^(\d+) deliveries assigned to you$').firstMatch(title);
  return m == null ? null : '${m[1]} livraisons pour vous';
}

/// An amount the server wrote in English (`1202.50`) as French money (`1 202,50 $`).
String _usdFr(String raw) {
  final v = double.tryParse(raw);
  return v == null ? '$raw \$' : const Strings('fr').usd(v);
}

/// A leg kind as the server writes it in a notice ("return to seller") in French.
String _legFr(String kind) => switch (kind) {
      'pickup' => 'la collecte',
      'transfer' => 'le transfert',
      'delivery' => 'la livraison',
      'express delivery' => 'la livraison express',
      'return pickup' => 'la collecte du retour',
      'return transfer' => 'le transfert du retour',
      'return to seller' => 'le retour au vendeur',
      'replacement delivery' => 'la livraison du remplacement',
      _ => kind,
    };

final List<(RegExp, String Function(RegExpMatch))> _bodies = [
  (RegExp(r'^(\S+): (.+) is now in your tasks\.$'), (m) => '${m[1]} : ${_legFr(m[2]!)} est maintenant dans vos tâches.'),
  (RegExp(r'^(\S+): (.+) failed after (\d+) attempts \((.*)\)\.$'), (m) => '${m[1]} : ${_legFr(m[2]!)} a échoué après ${m[3]} tentatives (${m[4]}).'),
  (RegExp(r'^(\S+): (.+) needs a rider\.$'), (m) => '${m[1]} : ${_legFr(m[2]!)} attend un livreur.'),
  (RegExp(r'^(\S+) is packed and ready\.$'), (m) => '${m[1]} est emballé et prêt.'),
  (RegExp(r'^(\S+) · \$([\d.]+) from (.+)$'), (m) => '${m[1]} · ${_usdFr(m[2]!)} de ${m[3]}'),
  (RegExp(r'^(\S+) was cancelled\.$'), (m) => '${m[1]} a été annulée.'),
  (RegExp(r'^(\S+)\. Open the app to accept it\.$'), (m) => '${m[1]}. Ouvrez l’application pour l’accepter.'),
  (RegExp(r'^(\S+) is now in your deliveries\.$'), (m) => '${m[1]} est maintenant dans vos livraisons.'),
  (RegExp(r'^(.+) — collect them at the warehouse\.$'), (m) => '${m[1]} — à récupérer à l’entrepôt.'),
];

/// "de" before a place name, elided before a vowel or a mute h: "d’Entrepôt Limete", "de Kinshasa Hub".
String _de(String name) => RegExp(r'^[aeiouyhàâäéèêëîïôöùûü]', caseSensitive: false).hasMatch(name) ? 'd’$name' : 'de $name';

/// The rider's compliance documents, as the English notices name them.
const Map<String, String> _documents = {
  'driver licence': 'permis de conduire',
  'vehicle insurance': 'assurance du véhicule',
  'vehicle registration': 'carte grise',
  'ID': 'pièce d’identité',
  'document': 'document',
};

/// Why a delivery failed or a payment was refused, as the server and the rider app's own choices word it.
String translateReason(String r) => const {
      'Customer not reachable': 'Client injoignable',
      'Customer unreachable': 'Client injoignable',
      'Wrong address': 'Adresse incorrecte',
      'Customer refused': 'Le client a refusé',
      'Could not be delivered': 'N’a pas pu être livré',
      'Payment issue': 'Problème de paiement',
      'Other': 'Autre',
    }[r.trim()] ??
    r;

/// More notices a rider receives (task changes, transfer runs, documents, account), after the ones above.
final List<(RegExp, String Function(RegExpMatch))> _moreBodies = [
  (RegExp(r'^(\S+): ([a-z ]+) now carries more parcels\.$'), (m) => '${m[1]} : ${_legFr(m[2]!)} mise à jour, d’autres colis s’y ajoutent.'),
  (RegExp(r'^(\S+): you can enter the delivery code again\.$'), (m) => '${m[1]} : vous pouvez de nouveau saisir le code de livraison.'),
  (RegExp(r'^(\S+): 1 parcel to (.+) is now in your tasks\.$'), (m) => '${m[1]} : 1 colis à destination ${_de(m[2]!)} est ajouté à vos tâches.'),
  (RegExp(r'^(\S+): (\d+) parcel(?:s|\(s\)) to (.+) are now in your tasks\.$'),
      (m) => '${m[1]} : ${m[2]} colis à destination ${_de(m[3]!)} sont ajoutés à vos tâches.'),
  (RegExp(r'^Your (driver licence|vehicle insurance|vehicle registration|ID|document) was approved\.$'),
      (m) => 'Votre document « ${_documents[m[1]]} » a été approuvé.'),
  (RegExp(r'^Your (driver licence|vehicle insurance|vehicle registration|ID|document) was rejected: (.+)$'),
      (m) => 'Votre document « ${_documents[m[1]]} » a été refusé : ${m[2]}'),
  (RegExp(r'^Your account is suspended\. Contact support for help\.$'), (m) => 'Votre compte est suspendu. Contactez le support pour obtenir de l’aide.'),
  (RegExp(r'^Your account is active again\.$'), (m) => 'Votre compte est de nouveau actif.'),
  (RegExp(r'^(\S+): a rider will collect your package\.$'), (m) => '${m[1]} : un livreur viendra récupérer votre colis.'),
  (RegExp(r'^Notifications reach this account\. If push is set up, your devices show this too\.$'),
      (m) => 'Les notifications arrivent bien sur ce compte. Si les notifications push sont configurées, vos appareils affichent aussi celle-ci.'),
];
