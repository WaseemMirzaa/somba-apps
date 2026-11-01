// A small delivery geography and a fake socket for the area tests (not a test itself).
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/geo_directory.dart';
import 'package:lipcart/services/geo_models.dart';

import 'gap_helpers.dart';

Map<String, dynamic> area(
  String id,
  String level,
  String name, {
  String? nameEn,
  String? googleName,
  String? googleNameEn,
  String? parentId,
  bool served = true,
  bool partiallyServed = false,
  int childCount = 0,
  String? hubName,
  List<String> aliases = const [],
}) =>
    {
      'id': id,
      'code': id.toUpperCase(),
      'level': level,
      'name': name,
      'nameEn': nameEn,
      'googleName': googleName ?? name,
      'googleNameEn': googleNameEn ?? nameEn ?? name,
      'aliases': aliases,
      'parentId': parentId,
      'path': 'CD/$id',
      'depth': 1,
      'lat': null,
      'lng': null,
      'active': true,
      'served': served,
      if (partiallyServed) 'partiallyServed': true,
      'hubId': served ? 'hub-kin' : null,
      'hubName': served ? (hubName ?? 'Entrepôt Kinshasa') : null,
      'childCount': childCount,
    };

/// Kinshasa (served: province > city > 4 districts > communes), Kongo-Central (served, English name differs) and a
/// handful of unserved provinces (Nord-Kivu / North Kivu with the city of Goma).
final Map<String, List<Map<String, dynamic>>> kGeo = {
  '': [
    area('p-kin', 'province', 'Kinshasa', childCount: 1),
    area('p-kc', 'province', 'Kongo-Central', nameEn: 'Kongo Central', childCount: 0),
    area('p-nk', 'province', 'Nord-Kivu', nameEn: 'North Kivu', served: false, childCount: 2),
    for (var i = 1; i <= 9; i++) area('p-x$i', 'province', 'Province $i', served: false, childCount: 0),
  ],
  'p-kin': [area('c-kin', 'city', 'Kinshasa', parentId: 'p-kin', childCount: 4)],
  'p-nk': [
    area('c-goma', 'city', 'Goma', parentId: 'p-nk', served: false),
    area('c-beni', 'city', 'Beni', parentId: 'p-nk', served: false),
  ],
  'c-kin': [
    area('d-luk', 'district', 'Lukunga', parentId: 'c-kin', childCount: 2),
    area('d-mon', 'district', 'Mont-Amba', parentId: 'c-kin', childCount: 2),
  ],
  'd-luk': [
    area('m-gombe', 'commune', 'Gombe', parentId: 'd-luk', childCount: 1),
    area('m-ngal', 'commune', 'Ngaliema', parentId: 'd-luk'),
  ],
  'd-mon': [
    area('m-limete', 'commune', 'Limete', parentId: 'd-mon', hubName: 'Entrepôt Limete'),
    area('m-matete', 'commune', 'Matete', parentId: 'd-mon'),
  ],
  'm-gombe': [area('q-bat', 'quartier', 'Batetela', parentId: 'm-gombe')],
};

AreaDto areaOf(String id) {
  for (final list in kGeo.values) {
    for (final a in list) {
      if (a['id'] == id) return AreaDto.fromJson(a);
    }
  }
  throw StateError('no area $id');
}

/// The chain `geo:resolve` returns: country, then [ids] from the province down.
List<Map<String, dynamic>> chainOf(List<String> ids) => [
      area('cd', 'country', 'République démocratique du Congo', nameEn: 'Democratic Republic of the Congo', childCount: 26),
      for (final id in ids) kGeo.values.expand((l) => l).firstWhere((a) => a['id'] == id),
    ];

Map<String, dynamic> resolved(List<String> ids, {bool served = true, String? hub = 'Entrepôt Kinshasa', String matchedBy = 'components'}) {
  final chain = chainOf(ids);
  return {'area': chain.last, 'chain': chain, 'served': served, 'hubId': served ? 'hub-kin' : null, 'hubName': served ? hub : null, 'matchedBy': matchedBy};
}

const kNoMatch = {'area': null, 'chain': <dynamic>[], 'served': false, 'hubId': null, 'hubName': null, 'matchedBy': null};

/// Every commune below a city, each with the district it sits in (null when it hangs straight under the city), in the
/// order the server sends them for `geo:communes`: served first, then by name (so the districts are interleaved).
List<Map<String, dynamic>> communesOfCity(String cityId, {Map<String, List<Map<String, dynamic>>>? geo}) {
  final tree = geo ?? kGeo;
  final out = <Map<String, dynamic>>[];
  for (final top in tree[cityId] ?? const <Map<String, dynamic>>[]) {
    if (top['level'] == 'district') {
      for (final c in tree[top['id']] ?? const <Map<String, dynamic>>[]) {
        out.add({...c, 'district': top});
      }
    } else if (top['level'] == 'commune') {
      out.add({...top, 'district': null});
    }
  }
  out.sort((a, b) {
    if (a['served'] != b['served']) return a['served'] == true ? -1 : 1;
    return (a['name'] as String).compareTo(b['name'] as String);
  });
  return out;
}

/// A socket that serves [geo] (default [kGeo]) for `geo:children`, `geo:communes` (unless [bulkCommunes] is false: then
/// it rejects the event, like a server that does not know it) and `geo:servedCities` (the [servedCities] rows; null: the
/// event is rejected), answers `geo:resolve` with [resolve] (recorded in [resolves]) and everything else like the shared
/// fake (empty reads, the quote). Every call is recorded in [log] as `event` or `event:parentId|cityId`.
Future<dynamic> Function(String event, [Map<String, dynamic>? body]) areaCalls({
  Object? Function(Map<String, dynamic>? body)? resolve,
  List<Map<String, dynamic>>? resolves,
  Map<String, dynamic> Function(Map<String, dynamic>? body)? quote,
  Map<String, dynamic Function(Map<String, dynamic>? body)> extra = const {},
  Map<String, List<Map<String, dynamic>>>? geo,
  bool bulkCommunes = true,
  List<Map<String, dynamic>>? servedCities,
  List<String>? log,
}) {
  final base = gapCalls(quote: quote, extra: extra);
  final tree = geo ?? kGeo;
  return (event, [body]) async {
    log?.add(event == 'geo:children' ? 'geo:children:${body?['parentId'] ?? ''}' : event == 'geo:communes' ? 'geo:communes:${body?['cityId']}' : event);
    if (event == 'geo:children') return tree[body?['parentId'] ?? ''] ?? const <dynamic>[];
    if (event == 'geo:communes') {
      if (!bulkCommunes) throw ApiException('Unknown event.');
      return communesOfCity('${body?['cityId']}', geo: tree);
    }
    if (event == 'geo:servedCities') {
      if (servedCities == null) throw ApiException('Unknown event.');
      return servedCities;
    }
    if (event == 'geo:resolve') {
      resolves?.add(body ?? {});
      return resolve == null ? kNoMatch : resolve(body);
    }
    return base(event, body);
  };
}

/// A fresh geography: nothing cached, and the new-style events (`geo:communes`, `geo:servedCities`) tried again.
void resetGeo() => GeoDirectory.instance.hook.reset!();
