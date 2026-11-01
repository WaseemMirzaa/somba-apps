import 'models.dart' show textOrNull;

/// The levels of the delivery geography (docs/contracts/areas.md): country > province > city > district > commune > quartier.
abstract final class AreaLevel {
  static const country = 'country';
  static const province = 'province';
  static const city = 'city';
  static const district = 'district';
  static const commune = 'commune';
  static const quartier = 'quartier';
}

/// Lower-case, no accents, no hyphens, apostrophes or spaces: how the server matches area names, and how the app
/// matches the area named in a server message against an address's areas.
String foldAreaName(String s) {
  const from = 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ';
  const to = 'aaaaaaceeeeiiiinooooouuuuyyoa';
  final b = StringBuffer();
  for (final c in s.toLowerCase().runes) {
    final ch = String.fromCharCode(c);
    final i = from.indexOf(ch);
    if (i >= 0) {
      b.write(to[i]);
    } else if (RegExp(r"[a-z0-9]").hasMatch(ch)) {
      b.write(ch);
    }
  }
  return b.toString();
}

/// One place in the delivery geography, as the server serves it (`geo:*`, and inside addresses as `areaChain`).
class AreaDto {
  const AreaDto({
    required this.id,
    this.code = '',
    this.level = AreaLevel.commune,
    required this.name,
    this.nameEn,
    this.googleName = '',
    this.googleNameEn = '',
    this.aliases = const [],
    this.parentId,
    this.path = '',
    this.depth = 0,
    this.lat,
    this.lng,
    this.active = true,
    this.served = false,
    this.partiallyServed = false,
    this.hubId,
    this.hubName,
    this.childCount = 0,
    this.feeOverrideUsd,
  });

  final String id;
  final String code;
  final String level;

  /// The official (French) name.
  final String name;

  /// The English name; null when it is the same as [name].
  final String? nameEn;

  /// Google's spelling with `language=fr` / `language=en`.
  final String googleName;
  final String googleNameEn;
  final List<String> aliases;
  final String? parentId;
  final String path;
  final int depth;
  final double? lat, lng;
  final bool active;

  /// This area, or one of its parents, is covered by an active warehouse.
  final bool served;

  /// Not served itself, but something inside it is (Haut-Katanga when only the city of Lubumbashi is covered). Absent
  /// on older servers, then false. Such an area is selectable in a picker: the next level down is where it gets served.
  final bool partiallyServed;
  final String? hubId;
  final String? hubName;
  final int childCount;

  /// Only on a warehouse's coverage list (`hubs:coverage`).
  final double? feeOverrideUsd;

  /// The name in the app's language: English when asked and known, else the official French name.
  String nameFor(String lang) => lang == 'en' ? (nameEn ?? name) : name;

  /// A picker may offer this area: it is served, or something inside it is.
  bool get selectable => served || partiallyServed;

  bool get hasChildren => childCount > 0;

  /// The area is called [text] by any of its names (the server's message names an area in one language or the other).
  bool isCalled(String text) {
    final f = foldAreaName(text);
    if (f.isEmpty) return false;
    return [name, nameEn, googleName, googleNameEn, ...aliases].whereType<String>().any((n) => foldAreaName(n) == f);
  }

  factory AreaDto.fromJson(Map<String, dynamic> j) {
    double? d(Object? v) => v is num ? v.toDouble() : null;
    final name = textOrNull(j['name']) ?? textOrNull(j['googleName']) ?? textOrNull(j['nameEn']) ?? '';
    final en = textOrNull(j['nameEn']);
    return AreaDto(
      id: '${j['id'] ?? j['areaId'] ?? ''}',
      code: textOrNull(j['code']) ?? '',
      level: textOrNull(j['level']) ?? AreaLevel.commune,
      name: name,
      nameEn: en == null || en == name ? null : en,
      googleName: textOrNull(j['googleName']) ?? name,
      googleNameEn: textOrNull(j['googleNameEn']) ?? textOrNull(j['googleName']) ?? name,
      aliases: j['aliases'] is List ? [for (final a in j['aliases'] as List) if (a is String && a.trim().isNotEmpty) a.trim()] : const [],
      parentId: textOrNull(j['parentId']),
      path: textOrNull(j['path']) ?? '',
      depth: j['depth'] is num ? (j['depth'] as num).toInt() : 0,
      lat: d(j['lat']),
      lng: d(j['lng']),
      active: j['active'] != false,
      served: j['served'] == true,
      partiallyServed: j['partiallyServed'] == true,
      hubId: textOrNull(j['hubId']),
      hubName: textOrNull(j['hubName']),
      childCount: j['childCount'] is num ? (j['childCount'] as num).toInt() : 0,
      feeOverrideUsd: d(j['feeOverrideUsd']),
    );
  }

  static List<AreaDto> listFrom(Object? raw) => raw is List
      ? [for (final e in raw) if (e is Map) AreaDto.fromJson(e.map((k, v) => MapEntry(k.toString(), v)))]
      : const [];
}

/// The answer of `geo:resolve`: the most specific area found, its chain from the country down, and whether a warehouse
/// serves it.
class AreaResolution {
  const AreaResolution({this.area, this.chain = const [], this.served = false, this.hubId, this.hubName, this.matchedBy});

  final AreaDto? area;
  final List<AreaDto> chain;
  final bool served;
  final String? hubId;
  final String? hubName;

  /// `components` | `text` | `pin`, null when nothing matched.
  final String? matchedBy;

  bool get found => area != null;

  AreaDto? at(String level) {
    for (final a in chain.reversed) {
      if (a.level == level) return a;
    }
    return null;
  }

  factory AreaResolution.fromJson(Object? raw) {
    if (raw is! Map) return const AreaResolution();
    final j = raw.map((k, v) => MapEntry(k.toString(), v));
    final chain = AreaDto.listFrom(j['chain']);
    final areaRaw = j['area'];
    final area = areaRaw is Map ? AreaDto.fromJson(areaRaw.map((k, v) => MapEntry(k.toString(), v))) : (chain.isEmpty ? null : chain.last);
    return AreaResolution(
      area: area,
      chain: chain.isEmpty && area != null ? [area] : chain,
      served: j['served'] == true,
      hubId: textOrNull(j['hubId']),
      hubName: textOrNull(j['hubName']),
      matchedBy: textOrNull(j['matchedBy']),
    );
  }
}

/// The area in the chain at [level], most specific first (null when the chain has none).
AreaDto? areaAt(List<AreaDto> chain, String level) {
  for (final a in chain.reversed) {
    if (a.level == level) return a;
  }
  return null;
}

/// A commune with the district it sits in (Kinshasa has four; null for a city without districts).
typedef CommuneOption = ({AreaDto area, AreaDto? district});

/// The answer of `geo:communes` (also `geo:children` with `flatten: 'commune'`): every commune of a city in one list,
/// each carrying the `district` it belongs to. Inactive communes are left out. Null when [raw] is not such an answer
/// (not a list, or a list with no commune in it: an older server answering with the districts), so the caller can ask
/// the old way.
List<CommuneOption>? communesFrom(Object? raw) {
  if (raw is! List) return null;
  final out = <CommuneOption>[];
  var anyCommune = false;
  for (final e in raw) {
    if (e is! Map) continue;
    final j = e.map((k, v) => MapEntry(k.toString(), v));
    final area = AreaDto.fromJson(j);
    if (area.level != AreaLevel.commune) continue;
    anyCommune = true;
    if (!area.active) continue;
    final d = j['district'];
    out.add((area: area, district: d is Map ? AreaDto.fromJson(d.map((k, v) => MapEntry(k.toString(), v))) : null));
  }
  if (raw.isNotEmpty && !anyCommune) return null;
  return out;
}

/// The communes listed the way an area sheet shows them: those without a district first, then one group per district
/// (served ones first, then by name), keeping the order the server gave inside each group.
List<CommuneOption> groupByDistrict(List<CommuneOption> communes) {
  final groups = <String, List<CommuneOption>>{};
  final districts = <String, AreaDto>{};
  final loose = <CommuneOption>[];
  for (final c in communes) {
    final d = c.district;
    if (d == null) {
      loose.add(c);
    } else {
      districts[d.id] = d;
      (groups[d.id] ??= []).add(c);
    }
  }
  final order = districts.values.toList()
    ..sort((a, b) {
      if (a.selectable != b.selectable) return a.selectable ? -1 : 1;
      return a.name.compareTo(b.name);
    });
  return [...loose, for (final d in order) ...groups[d.id]!];
}

/// A city we deliver in, named in both languages: the `servedCities` of a not-served refusal and the rows of
/// `geo:servedCities`.
class ServedCity {
  const ServedCity({required this.id, required this.name, this.nameEn});

  final String id;

  /// The official (French) name.
  final String name;

  /// The English name; null when it is the same as [name].
  final String? nameEn;

  String nameFor(String lang) => lang == 'en' ? (nameEn ?? name) : name;

  /// Null when there is no name to show.
  static ServedCity? tryParse(Object? raw) {
    if (raw is! Map) return null;
    final name = textOrNull(raw['name']) ?? textOrNull(raw['nameEn']);
    if (name == null) return null;
    final en = textOrNull(raw['nameEn']);
    return ServedCity(id: '${raw['id'] ?? ''}', name: name, nameEn: en == null || en == name ? null : en);
  }

  /// The cities of a list; entries without a name are dropped, anything but a list is empty.
  static List<ServedCity> listFrom(Object? raw) {
    if (raw is! List) return const [];
    return [
      for (final e in raw)
        if (tryParse(e) != null) tryParse(e)!,
    ];
  }
}
