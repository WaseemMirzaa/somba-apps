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

/// "3 deliveries assigned to you" (a batch from the warehouse).
String? _assignedMany(String title) {
  final m = RegExp(r'^(\d+) deliveries assigned to you$').firstMatch(title);
  return m == null ? null : '${m[1]} livraisons pour vous';
}

final List<(RegExp, String Function(RegExpMatch))> _bodies = [
  (RegExp(r'^(\S+) is packed and ready\.$'), (m) => '${m[1]} est emballé et prêt.'),
  (RegExp(r'^(\S+) · \$([\d.]+) from (.+)$'), (m) => '${m[1]} · ${m[2]} \$ de ${m[3]}'),
  (RegExp(r'^(\S+) was cancelled\.$'), (m) => '${m[1]} a été annulée.'),
  (RegExp(r'^(\S+)(?: · collect \$([\d.]+) cash)?\. Open the app to accept it\.$'),
      (m) => m[2] == null ? '${m[1]}. Ouvrez l’application pour l’accepter.' : '${m[1]} · ${m[2]} \$ à encaisser. Ouvrez l’application pour l’accepter.'),
  (RegExp(r'^(\S+) is now in your deliveries\.$'), (m) => '${m[1]} est maintenant dans vos livraisons.'),
  (RegExp(r'^(.+) — collect them at the warehouse\.$'), (m) => '${m[1]} — à récupérer à l’entrepôt.'),
];
