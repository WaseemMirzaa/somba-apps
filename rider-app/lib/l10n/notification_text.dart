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
    _ => title,
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

final List<(RegExp, String Function(RegExpMatch))> _bodies = [
  (RegExp(r'^(\S+) is packed and ready\.$'), (m) => '${m[1]} est emballé et prêt.'),
  (RegExp(r'^(\S+) · \$([\d.]+) from (.+)$'), (m) => '${m[1]} · ${m[2]} \$ de ${m[3]}'),
  (RegExp(r'^(\S+) was cancelled\.$'), (m) => '${m[1]} a été annulée.'),
];
