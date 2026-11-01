import 'feature_hooks.dart';
import 'models.dart';
import 'realtime_store.dart';

/// The warehouses (`hubs:list`: id, name, city, country, position), so a screen can say "at Kinshasa Hub" for the
/// id an order carries. Loaded after sign-in; empty (and harmless) when the server is an older build.
class HubDirectory {
  HubDirectory._();
  static final HubDirectory instance = HubDirectory._();

  final Map<String, HubInfo> _byId = {};

  HubInfo? byId(String? id) => id == null ? null : _byId[id];

  /// The warehouse's name, or null while unknown.
  String? nameOf(String? id) => byId(id)?.name;

  Future<void> load(RealtimeStore store) async {
    final rows = await store.call('hubs:list', {'activeOnly': false});
    if (rows is! List) return;
    _byId
      ..clear()
      ..addEntries([
        for (final r in rows)
          if (r is Map && r['id'] is String) MapEntry(r['id'] as String, HubInfo.fromJson(r.map((k, v) => MapEntry(k.toString(), v)))),
      ]);
  }

  /// Tests: put warehouses in without the socket.
  void debugSet(Iterable<HubInfo> hubs) => _byId
    ..clear()
    ..addEntries(hubs.map((h) => MapEntry(h.id, h)));

  FeatureHook get hook => FeatureHook(name: 'hubs', hydrate: load, reset: _byId.clear);
}

class HubInfo {
  const HubInfo({required this.id, required this.name, this.city = ''});
  final String id;
  final String name;
  final String city;

  factory HubInfo.fromJson(Map<String, dynamic> j) => HubInfo(id: j['id'] as String, name: textOrNull(j['name']) ?? '', city: textOrNull(j['city']) ?? '');
}
