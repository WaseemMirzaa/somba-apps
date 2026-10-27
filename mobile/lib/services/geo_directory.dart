import 'dart:async';
import 'package:flutter/foundation.dart' show visibleForTesting;
import 'auth_service.dart' show ApiException;
import 'feature_hooks.dart';
import 'geo_models.dart';
import 'places_client.dart';
import 'realtime_store.dart';

/// The delivery geography (`geo:children`, `geo:communes`, `geo:resolve`) for the address form's pickers, cached per
/// parent so a picker opens instantly the second time. Any change the server announces (`geo:updated`, `coverage:updated`: a
/// warehouse gained or lost an area) drops the cache, so "served" is re-read the next time a picker opens.
class GeoDirectory {
  GeoDirectory._();
  static final GeoDirectory instance = GeoDirectory._();

  final Map<String, List<AreaDto>> _children = {};
  final Map<String, Future<List<AreaDto>>> _inflight = {};
  final Map<String, List<CommuneOption>> _communes = {};
  final Map<String, Future<List<CommuneOption>>> _communesInflight = {};
  List<ServedCity>? _servedCities;
  Future<List<ServedCity>>? _servedCitiesInflight;

  /// How long a new-style event (`geo:communes`, `geo:servedCities`) may take before the old way is tried. An older
  /// server never answers an event it does not know, so without this the picker would wait out the socket's timeout.
  @visibleForTesting
  static Duration eventProbeTimeout = const Duration(seconds: 4);

  /// The server answers `geo:communes` / `geo:servedCities`. Switched off for the session once it rejects one, so the
  /// old way is used straight away from then on (a slow answer alone does not switch it off).
  bool _bulkCommunes = true;
  bool _servedCitiesEvent = true;

  /// Bumped on every cache drop, so an open picker can tell its list is stale.
  int revision = 0;

  static const _roots = '';

  /// What is already cached under [parentId] (null: the provinces), or null when it was not fetched yet.
  List<AreaDto>? cached(String? parentId) => _children[parentId ?? _roots];

  /// The country's provinces (served first, as the server sorts them).
  Future<List<AreaDto>> provinces() => children(null);

  /// The areas directly under [parentId] (null: the provinces). Throws what the socket throws.
  Future<List<AreaDto>> children(String? parentId) {
    final key = parentId ?? _roots;
    final hit = _children[key];
    if (hit != null) return Future.value(hit);
    return _inflight[key] ??= _fetch(parentId).whenComplete(() {
      _inflight.remove(key);
    });
  }

  Future<List<AreaDto>> _fetch(String? parentId) async {
    final rev = revision;
    final raw = await RealtimeStore.instance.call('geo:children', {if (parentId != null) 'parentId': parentId});
    final out = AreaDto.listFrom(raw).where((a) => a.active).toList();
    if (rev == revision) _children[parentId ?? _roots] = out; // an answer that raced a change is not kept
    return out;
  }

  /// The communes of a city, with the district each one sits in when the city has districts (Kinshasa has four). A city
  /// without districts lists its communes directly, with no district. Quartiers are not included.
  ///
  /// One call (`geo:communes`; each commune comes with its `district`). A server that rejects it gets the old four-plus-one
  /// calls (`geo:children` of the city, then of every district).
  Future<List<CommuneOption>> communesOf(AreaDto city) {
    final hit = _communes[city.id];
    if (hit != null) return Future.value(hit);
    return _communesInflight[city.id] ??= _fetchCommunes(city).whenComplete(() {
      _communesInflight.remove(city.id);
    });
  }

  /// What is already cached for [city]'s communes, or null when they were not fetched yet.
  List<CommuneOption>? cachedCommunes(AreaDto city) => _communes[city.id];

  Future<List<CommuneOption>> _fetchCommunes(AreaDto city) async {
    final rev = revision;
    List<CommuneOption>? out;
    if (_bulkCommunes) {
      try {
        final raw = await RealtimeStore.instance.call('geo:communes', {'cityId': city.id}).timeout(eventProbeTimeout);
        out = communesFrom(raw);
        // A city that has areas below it but answers no commune: they may be quartiers straight under the city, which the old way lists.
        if (out != null && out.isEmpty && city.hasChildren) out = null;
      } on TimeoutException {
        out = null; // slow or an older server: the old way for this call, the new one is tried again next time
      } on ApiException catch (e) {
        if (e.localKey == null) _bulkCommunes = false; // the server answered, and refused it
      }
    }
    out ??= await _communesByDistrict(city);
    out = groupByDistrict(out);
    if (rev == revision) _communes[city.id] = out; // an answer that raced a change is not kept
    return out;
  }

  /// The old way: the city's children, then the children of each of its districts.
  Future<List<CommuneOption>> _communesByDistrict(AreaDto city) async {
    final top = await children(city.id);
    final out = <CommuneOption>[];
    final districts = top.where((a) => a.level == AreaLevel.district).toList();
    for (final a in top) {
      if (a.level != AreaLevel.district) out.add((area: a, district: null));
    }
    final lists = await Future.wait([for (final d in districts) children(d.id)]);
    for (var i = 0; i < districts.length; i++) {
      for (final c in lists[i]) {
        out.add((area: c, district: districts[i]));
      }
    }
    return out;
  }

  /// The cities we deliver in (any coverage in or below them), for the "we deliver in…" part of a not-served notice.
  /// `geo:servedCities`, else worked out from the provinces that are served or partly served and their cities. Throws
  /// what the socket throws when neither works.
  Future<List<ServedCity>> servedCities() {
    final hit = _servedCities;
    if (hit != null) return Future.value(hit);
    return _servedCitiesInflight ??= _fetchServedCities().whenComplete(() {
      _servedCitiesInflight = null;
    });
  }

  /// The served cities already fetched, or null when they were not asked for yet.
  List<ServedCity>? get cachedServedCities => _servedCities;

  Future<List<ServedCity>> _fetchServedCities() async {
    final rev = revision;
    List<ServedCity>? out;
    if (_servedCitiesEvent) {
      try {
        final raw = await RealtimeStore.instance.call('geo:servedCities').timeout(eventProbeTimeout);
        if (raw is List) out = ServedCity.listFrom(raw);
      } on TimeoutException {
        out = null;
      } on ApiException catch (e) {
        if (e.localKey == null) _servedCitiesEvent = false;
      }
    }
    if (out == null) {
      final cities = <ServedCity>[];
      for (final province in await provinces()) {
        if (!province.selectable) continue;
        for (final city in await children(province.id)) {
          final c = city.level == AreaLevel.city && city.selectable ? ServedCity.tryParse({'id': city.id, 'name': city.name, 'nameEn': city.nameEn}) : null;
          if (c != null) cities.add(c);
        }
      }
      out = cities;
    }
    if (rev == revision) _servedCities = out; // an answer that raced a change is not kept
    return out;
  }

  /// Which area a map pick falls in. The Google [components] come first, then the [text] fields and the [pin]: the
  /// server tries them in that order and says which one matched. Null when the server cannot answer (older server).
  Future<AreaResolution?> resolve({List<AddrComponent> components = const [], Map<String, String>? text, ({double lat, double lng})? pin}) async {
    final body = <String, dynamic>{
      if (components.isNotEmpty) 'components': [for (final c in components) {'types': c.types, 'long_name': c.long}],
      if (text != null && text.isNotEmpty) 'text': text,
      if (pin != null) 'pin': {'lat': pin.lat, 'lng': pin.lng},
    };
    if (body.isEmpty) return null;
    final raw = await RealtimeStore.instance.call('geo:resolve', body);
    if (raw is! Map) return null;
    return AreaResolution.fromJson(raw);
  }

  /// Drop everything cached (a coverage or geography change; sign-out).
  void invalidate() {
    revision++;
    _children.clear();
    _inflight.clear();
    _communes.clear();
    _communesInflight.clear();
    _servedCities = null;
    _servedCitiesInflight = null;
  }

  /// Tests: put children in without the socket.
  void debugSet(String? parentId, List<AreaDto> areas) => _children[parentId ?? _roots] = areas;

  FeatureHook get hook => FeatureHook(
        name: 'geo',
        pushes: {
          'geo:updated': (_) => invalidate(),
          // A warehouse gained or lost an area: re-read which of the saved addresses are served.
          'coverage:updated': (_) {
            invalidate();
            if (RealtimeStore.instance.isSignedIn) unawaited(RealtimeStore.instance.refreshAddresses().catchError((_) {}));
          },
        },
        // Warm the provinces so the address form opens with its pickers (a failure just means a cold start later).
        hydrate: (_) async {
          try {
            await provinces();
          } catch (_) {}
        },
        reset: () {
          invalidate();
          _bulkCommunes = _servedCitiesEvent = true; // the next session may meet a newer server
        },
      );
}
