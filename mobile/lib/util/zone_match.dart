import '../data/market_profiles.dart';

/// Lower-case, accents stripped, punctuation squashed: "Limeté " → "limete".
String _norm(String? v) {
  if (v == null) return '';
  const from = 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ';
  const to = 'aaaaaaceeeeiiiinooooouuuuyy';
  final b = StringBuffer();
  for (final r in v.toLowerCase().runes) {
    final ch = String.fromCharCode(r);
    final i = from.indexOf(ch);
    b.write(i >= 0 ? to[i] : ch);
  }
  return b.toString().replaceAll(RegExp(r'^commune (de |d\x27)?'), '').replaceAll(RegExp(r'[^a-z0-9]+'), ' ').trim();
}

/// The delivery zone an address falls in, matched on the commune name (zones are communes), else on the zone id
/// the address already carries. Null when the address is outside every zone — "we don't deliver there yet".
Zone? zoneForAddress({String? commune, String? city, String? zoneId, required List<Zone> zones}) {
  if (zoneId != null) {
    for (final z in zones) {
      if (z.id == zoneId) return z;
    }
  }
  final c = _norm(commune);
  if (c.isEmpty) return null;
  final cityN = _norm(city);
  for (final z in zones) {
    final names = {_norm(z.id), _norm(z.name), _norm(z.nameFr)};
    final sameCity = cityN.isEmpty || _norm(z.city).isEmpty || _norm(z.city) == cityN;
    if (sameCity && names.contains(c)) return z;
  }
  return null;
}
