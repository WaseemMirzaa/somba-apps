import 'dart:convert';
import 'package:http/http.dart' as http;
import 'maps_config.dart';

/// One Google address component, normalised from either the Places (New) or the Geocoding shape.
typedef AddrComponent = ({List<String> types, String long});

/// Address fields a map pick can pre-fill into the form.
class PickedParts {
  final String? line1, commune, city, region, country, postalCode;
  const PickedParts({this.line1, this.commune, this.city, this.region, this.country, this.postalCode});
}

/// A place the customer chose (search result, map tap, drag or current location).
class PickedPlace {
  final double lat, lng;
  final String? placeId, formatted;
  final PickedParts parts;

  /// Google's address components for the pin, in the language it was looked up in: `geo:resolve` matches them
  /// against the delivery areas (in either language).
  final List<AddrComponent> components;
  const PickedPlace({required this.lat, required this.lng, this.placeId, this.formatted, this.parts = const PickedParts(), this.components = const []});

  /// The pin as stored on the address (`geo`); the server validates and encrypts it.
  Map<String, Object> toGeoJson() => {
        'lat': double.parse(lat.toStringAsFixed(6)),
        'lng': double.parse(lng.toStringAsFixed(6)),
        if (placeId != null) 'placeId': placeId!,
        if (formatted != null) 'formatted': formatted!,
      };
}

class PlaceSuggestion {
  final String placeId, title, subtitle;
  const PlaceSuggestion({required this.placeId, required this.title, required this.subtitle});
}

/// Turn address components into the fields our address form uses.
PickedParts partsFromComponents(List<AddrComponent> comps) {
  String? get(List<String> types) {
    for (final c in comps) {
      if (c.types.any(types.contains) && c.long.isNotEmpty) return c.long;
    }
    return null;
  }

  final street = [get(['street_number']), get(['route'])].whereType<String>().join(' ');
  return PickedParts(
    line1: street.isNotEmpty ? street : get(['premise', 'establishment', 'point_of_interest']),
    commune: get(['sublocality_level_1', 'sublocality', 'neighborhood', 'administrative_area_level_3']),
    city: get(['locality', 'postal_town', 'administrative_area_level_2']),
    region: get(['administrative_area_level_1']),
    country: get(['country']),
    postalCode: get(['postal_code']),
  );
}

class PlacesException implements Exception {
  final String message;
  PlacesException(this.message);
  @override
  String toString() => message;
}

/// Thin client for Places API (New) autocomplete/details and the Geocoding API (reverse).
class PlacesClient {
  PlacesClient({http.Client? client, String? apiKey, this.language = 'en'})
      : _http = client ?? http.Client(),
        _key = apiKey ?? MapsConfig.apiKey;

  final http.Client _http;
  final String _key;
  final String language;

  Map<String, dynamic> _json(http.Response r, String what) {
    Map<String, dynamic> body = {};
    try {
      final d = jsonDecode(r.body);
      if (d is Map<String, dynamic>) body = d;
    } catch (_) {}
    if (r.statusCode >= 400) {
      final msg = (body['error'] is Map ? (body['error'] as Map)['message'] : null) ?? 'HTTP ${r.statusCode}';
      throw PlacesException('$what failed: $msg');
    }
    return body;
  }

  /// Predictions for what the customer has typed so far. [sessionToken] groups one search into one billable session.
  Future<List<PlaceSuggestion>> autocomplete(String input, {required String sessionToken, double? biasLat, double? biasLng}) async {
    if (input.trim().length < 2) return const [];
    final res = await _http
        .post(
          Uri.parse('https://places.googleapis.com/v1/places:autocomplete'),
          headers: {'Content-Type': 'application/json', 'X-Goog-Api-Key': _key},
          body: jsonEncode({
            'input': input.trim(),
            'sessionToken': sessionToken,
            'languageCode': language,
            'includedRegionCodes': MapsConfig.regionCodes,
            if (biasLat != null && biasLng != null)
              'locationBias': {
                'circle': {
                  'center': {'latitude': biasLat, 'longitude': biasLng},
                  'radius': 30000.0,
                }
              },
          }),
        )
        .timeout(const Duration(seconds: 10));
    return parseSuggestions(_json(res, 'Place search'));
  }

  /// Full details (coordinates + address parts) of a chosen suggestion.
  Future<PickedPlace> details(String placeId, {required String sessionToken}) async {
    final res = await _http.get(
      Uri.parse('https://places.googleapis.com/v1/places/${Uri.encodeComponent(placeId)}?languageCode=$language&sessionToken=${Uri.encodeComponent(sessionToken)}'),
      headers: {'X-Goog-Api-Key': _key, 'X-Goog-FieldMask': 'id,formattedAddress,location,addressComponents'},
    ).timeout(const Duration(seconds: 10));
    return parsePlaceDetails(_json(res, 'Place details'));
  }

  /// Address of a pin; falls back to a bare pin when Google returns nothing.
  Future<PickedPlace> reverseGeocode(double lat, double lng) async {
    final res = await _http
        .get(Uri.parse('https://maps.googleapis.com/maps/api/geocode/json?latlng=$lat,$lng&language=$language&key=$_key'))
        .timeout(const Duration(seconds: 10));
    final body = _json(res, 'Reverse geocoding');
    final status = body['status'];
    if (status != null && status != 'OK' && status != 'ZERO_RESULTS') {
      throw PlacesException('Reverse geocoding failed: $status ${body['error_message'] ?? ''}'.trim());
    }
    return parseGeocode(body, lat, lng);
  }

  void close() => _http.close();
}

List<PlaceSuggestion> parseSuggestions(Map<String, dynamic> body) {
  final out = <PlaceSuggestion>[];
  for (final s in (body['suggestions'] as List? ?? const [])) {
    final p = (s as Map)['placePrediction'];
    if (p is! Map) continue;
    final id = p['placeId'] as String?;
    if (id == null) continue;
    final fmt = p['structuredFormat'] as Map?;
    final main = (fmt?['mainText'] as Map?)?['text'] as String? ?? (p['text'] as Map?)?['text'] as String? ?? '';
    final secondary = (fmt?['secondaryText'] as Map?)?['text'] as String? ?? '';
    out.add(PlaceSuggestion(placeId: id, title: main, subtitle: secondary));
  }
  return out;
}

PickedPlace parsePlaceDetails(Map<String, dynamic> body) {
  final loc = body['location'] as Map?;
  final lat = (loc?['latitude'] as num?)?.toDouble();
  final lng = (loc?['longitude'] as num?)?.toDouble();
  if (lat == null || lng == null) throw PlacesException('Place details had no location.');
  final comps = <AddrComponent>[
    for (final c in (body['addressComponents'] as List? ?? const []))
      (types: List<String>.from((c as Map)['types'] as List? ?? const []), long: (c['longText'] as String?) ?? ''),
  ];
  return PickedPlace(
    lat: lat,
    lng: lng,
    placeId: body['id'] as String?,
    formatted: body['formattedAddress'] as String?,
    parts: partsFromComponents(comps),
    components: comps,
  );
}

PickedPlace parseGeocode(Map<String, dynamic> body, double lat, double lng) {
  final results = body['results'] as List? ?? const [];
  if (results.isEmpty) return PickedPlace(lat: lat, lng: lng);
  final best = results.first as Map;
  final comps = <AddrComponent>[
    for (final c in (best['address_components'] as List? ?? const []))
      (types: List<String>.from((c as Map)['types'] as List? ?? const []), long: (c['long_name'] as String?) ?? ''),
  ];
  return PickedPlace(
    lat: lat,
    lng: lng,
    placeId: best['place_id'] as String?,
    formatted: best['formatted_address'] as String?,
    parts: partsFromComponents(comps),
    components: comps,
  );
}
