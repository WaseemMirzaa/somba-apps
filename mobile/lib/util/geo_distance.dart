import 'dart:math' as math;
import '../l10n/strings.dart';

/// Great-circle distance in kilometres between two points (haversine).
double distanceKm(double lat1, double lng1, double lat2, double lng2) {
  const r = 6371.0;
  double rad(double d) => d * math.pi / 180;
  final dLat = rad(lat2 - lat1);
  final dLng = rad(lng2 - lng1);
  final a = math.pow(math.sin(dLat / 2), 2) + math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.pow(math.sin(dLng / 2), 2);
  return 2 * r * math.asin(math.min(1, math.sqrt(a)));
}

/// "850 m", "1.2 km" / "1,2 km", "14 km": short, in the language's number style.
String distanceLabel(Strings s, double km) {
  if (km < 1) return '${((km * 1000) / 10).round() * 10} m';
  final text = km < 10 ? km.toStringAsFixed(1) : km.round().toString();
  return '${s.isFr ? text.replaceAll('.', ',') : text} km';
}

/// Within this distance the rider is "very close" (no number: a few metres of GPS drift would flicker).
const riderNearKm = 0.1;

/// "Your rider is 1.2 km away" / "Votre livreur est tout près"; null when the delivery pin is not known.
String? riderDistanceText(Strings s, ({double lat, double lng}) rider, ({double lat, double lng})? destination) {
  if (destination == null) return null;
  final km = distanceKm(rider.lat, rider.lng, destination.lat, destination.lng);
  return km < riderNearKm ? s.trackRiderNear : s.trackRiderAway(distanceLabel(s, km));
}

/// "Updated 12 s ago" / "Mis à jour il y a 12 s" (seconds below a minute, then minutes).
String updatedAgoText(Strings s, DateTime at, {DateTime? now}) {
  final secs = (now ?? DateTime.now()).difference(at).inSeconds;
  if (secs < 5) return s.trackUpdatedNow;
  if (secs < 60) return s.trackUpdatedS(secs);
  return s.trackUpdatedM(secs ~/ 60);
}
