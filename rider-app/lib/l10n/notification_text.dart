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
    _ => _assignedMany(title) ?? title,
  };
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

/// What to show for a notice: the server's own French wording ([titleFr] / [bodyFr]) when French is asked and
/// present, else the phone's patterns above (older servers), else the text as received.
(String, String) displayNotice(Strings s, {required String title, required String body, String? titleFr, String? bodyFr}) {
  if (!s.isFr) return (title, body);
  final fallback = localizeNotification(s, title, body);
  return (_nonBlank(titleFr) ?? fallback.$1, _nonBlank(bodyFr) ?? fallback.$2);
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
  (RegExp(r'^(\S+)(?: · collect \$([\d.]+) cash)?\. Open the app to accept it\.$'),
      (m) => m[2] == null ? '${m[1]}. Ouvrez l’application pour l’accepter.' : '${m[1]} · ${_usdFr(m[2]!)} à encaisser. Ouvrez l’application pour l’accepter.'),
  (RegExp(r'^(\S+) is now in your deliveries\.$'), (m) => '${m[1]} est maintenant dans vos livraisons.'),
  (RegExp(r'^(.+) — collect them at the warehouse\.$'), (m) => '${m[1]} — à récupérer à l’entrepôt.'),
];
