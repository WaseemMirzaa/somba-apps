import 'dart:convert';
import 'dart:math' as math;
import 'package:http/http.dart' as http;
import 'maps_config.dart';

typedef LatLngPair = ({double lat, double lng});

/// The line drawn from the rider to the next stop.
class RouteLine {
  const RouteLine({required this.points, this.distanceMeters, this.durationSeconds, required this.approximate});

  /// The path, first point = the rider.
  final List<LatLngPair> points;
  final int? distanceMeters;
  final int? durationSeconds;

  /// True for the straight fallback line (no road route available).
  final bool approximate;

  /// The straight line between two points.
  factory RouteLine.straight(LatLngPair from, LatLngPair to) =>
      RouteLine(points: [from, to], distanceMeters: haversineMeters(from, to).round(), approximate: true);
}

/// Great-circle distance in metres.
double haversineMeters(LatLngPair a, LatLngPair b) {
  double rad(double d) => d * math.pi / 180;
  final dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  final h = math.pow(math.sin(dLat / 2), 2) + math.cos(rad(a.lat)) * math.cos(rad(b.lat)) * math.pow(math.sin(dLng / 2), 2);
  return 2 * 6371000 * math.asin(math.sqrt(h));
}

/// Google's encoded polyline format (https://developers.google.com/maps/documentation/utilities/polylinealgorithm).
List<LatLngPair> decodePolyline(String encoded) {
  final out = <LatLngPair>[];
  var index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    for (var axis = 0; axis < 2; axis++) {
      var shift = 0, result = 0;
      int b;
      do {
        if (index >= encoded.length) return out; // truncated input: keep what was read
        b = encoded.codeUnitAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      final delta = (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
      if (axis == 0) {
        lat += delta;
      } else {
        lng += delta;
      }
    }
    out.add((lat: lat / 1e5, lng: lng / 1e5));
  }
  return out;
}

/// Asks the Routes API (`computeRoutes`) for the road route between two points. Returns null when the key is missing or the
/// API answers anything but a route (the key may not have Routes API enabled, the network may be down): the caller then
/// draws [RouteLine.straight]. After a refusal (403/400) it does not ask again until the app restarts.
class RouteService {
  RouteService({http.Client? client, String? apiKey}) : _client = client ?? http.Client(), _key = apiKey ?? MapsConfig.apiKey;

  final http.Client _client;
  final String _key;
  bool _refused = false;

  /// Tests: has the service given up asking?
  bool get refused => _refused;

  Future<RouteLine?> fetch(LatLngPair from, LatLngPair to) async {
    if (_key.isEmpty || _refused) return null;
    try {
      final res = await _client
          .post(
            Uri.https('routes.googleapis.com', '/directions/v2:computeRoutes'),
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': _key,
              'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
            },
            body: jsonEncode({
              'origin': {'location': {'latLng': {'latitude': from.lat, 'longitude': from.lng}}},
              'destination': {'location': {'latLng': {'latitude': to.lat, 'longitude': to.lng}}},
              'travelMode': 'DRIVE',
            }),
          )
          .timeout(const Duration(seconds: 8));
      if (res.statusCode == 400 || res.statusCode == 403) _refused = true;
      if (res.statusCode != 200) return null;
      return parseRoutesResponse(jsonDecode(res.body));
    } catch (_) {
      return null;
    }
  }
}

/// A `computeRoutes` answer as a [RouteLine]; null when it holds no route.
RouteLine? parseRoutesResponse(dynamic body) {
  if (body is! Map) return null;
  final routes = body['routes'];
  if (routes is! List || routes.isEmpty || routes.first is! Map) return null;
  final r = routes.first as Map;
  final enc = (r['polyline'] is Map) ? (r['polyline'] as Map)['encodedPolyline'] : null;
  if (enc is! String || enc.isEmpty) return null;
  final points = decodePolyline(enc);
  if (points.length < 2) return null;
  final dur = r['duration'] is String ? int.tryParse((r['duration'] as String).replaceAll('s', '').split('.').first) : null;
  return RouteLine(points: points, distanceMeters: (r['distanceMeters'] as num?)?.toInt(), durationSeconds: dur, approximate: false);
}
