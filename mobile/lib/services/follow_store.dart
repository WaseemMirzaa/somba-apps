import 'package:flutter/foundation.dart';
import 'feature_hooks.dart';
import 'realtime_store.dart';

Map<String, dynamic> _asMap(dynamic d) => (d as Map).map((k, v) => MapEntry(k.toString(), v));

/// A store the shopper follows, as `follows:list` returns it (public fields only).
class FollowedStore {
  const FollowedStore({required this.id, required this.name, this.logoUrl, this.rating = 0, this.productCount = 0, this.followedAt});

  final String id;
  final String name;
  final String? logoUrl;
  final double rating;
  final int productCount;
  final DateTime? followedAt;

  factory FollowedStore.fromJson(Map<String, dynamic> j) => FollowedStore(
        id: j['id']?.toString() ?? '',
        name: j['name']?.toString() ?? '',
        logoUrl: (j['logoUrl'] as String?)?.isNotEmpty == true ? j['logoUrl'] as String : null,
        rating: (j['rating'] as num?)?.toDouble() ?? 0,
        productCount: (j['productCount'] as num?)?.toInt() ?? 0,
        followedAt: j['followedAt'] is String ? DateTime.tryParse(j['followedAt'] as String)?.toLocal() : null,
      );
}

/// Whether the shopper follows one store and how many people do (`follows:state`, `follows:toggle`).
class FollowState {
  const FollowState({required this.sellerId, required this.following, required this.followers});
  final String sellerId;
  final bool following;
  final int followers;

  factory FollowState.fromJson(Map<String, dynamic> j) => FollowState(
        sellerId: j['sellerId']?.toString() ?? '',
        following: j['following'] == true,
        followers: (j['followers'] as num?)?.toInt() ?? 0,
      );
}

/// The stores the shopper follows: the "Following" list in the account, the follow button on a store page and the
/// live `follows:updated` push (the shopper's other devices). New-product notices come as ordinary notifications.
class FollowStore extends ChangeNotifier {
  FollowStore._();
  static final FollowStore instance = FollowStore._();

  final List<FollowedStore> _stores = [];
  final Map<String, FollowState> _states = {};

  /// The followed stores, most recently followed first.
  List<FollowedStore> get stores => List.unmodifiable(_stores);

  bool loaded = false;
  bool loading = false;

  Future<dynamic> _call(String event, [Map<String, dynamic>? body]) => RealtimeStore.instance.call(event, body);

  FeatureHook get hook => FeatureHook(
        name: 'follows',
        pushes: {'follows:updated': _onPush},
        hydrate: (_) => load(),
        reset: reset,
      );

  void reset() {
    _stores.clear();
    _states.clear();
    loaded = false;
    loading = false;
    notifyListeners();
  }

  /// What is known about a store (null until [stateOf] or a toggle answered).
  FollowState? known(String sellerId) => _states[sellerId];

  /// Whether the shopper follows [sellerId] (false while unknown).
  bool isFollowing(String sellerId) => _states[sellerId]?.following ?? _stores.any((s) => s.id == sellerId);

  /// Loads the list. Throws when the server refuses (offline…).
  Future<void> load() async {
    loading = true;
    notifyListeners();
    try {
      final res = await _call('follows:list');
      final rows = [
        if (res is List)
          for (final e in res)
            if (e is Map) FollowedStore.fromJson(_asMap(e)),
      ].where((s) => s.id.isNotEmpty);
      _stores
        ..clear()
        ..addAll(rows);
      for (final s in _stores) {
        final cur = _states[s.id];
        _states[s.id] = FollowState(sellerId: s.id, following: true, followers: cur?.followers ?? 0);
      }
      loaded = true;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// Follower count and my follow for one store (`follows:state`). Throws the server's message.
  Future<FollowState> stateOf(String sellerId) async {
    final res = await _call('follows:state', {'sellerId': sellerId});
    final st = FollowState.fromJson(_asMap(res));
    _states[sellerId] = st;
    notifyListeners();
    return st;
  }

  /// Follows or unfollows (`follows:toggle`; [following] sets it, null flips it). Returns the new state and keeps
  /// the list in step. Throws the server's message (own store, too many follows, unknown store…).
  Future<FollowState> toggle(String sellerId, {bool? following}) async {
    final res = await _call('follows:toggle', {'sellerId': sellerId, if (following != null) 'following': following});
    final st = FollowState.fromJson(_asMap(res));
    _apply(sellerId, st);
    return st;
  }

  void _onPush(dynamic d) {
    if (d is! Map) return;
    final st = FollowState.fromJson(_asMap(d));
    if (st.sellerId.isEmpty) return;
    final known = _stores.any((s) => s.id == st.sellerId);
    _apply(st.sellerId, st);
    // Followed on another device: the list needs the store's card.
    if (st.following && !known) load().catchError((_) {});
  }

  void _apply(String requested, FollowState st) {
    _states[requested] = st;
    if (st.sellerId.isNotEmpty) _states[st.sellerId] = st;
    if (!st.following) _stores.removeWhere((s) => s.id == st.sellerId || s.id == requested);
    notifyListeners();
  }
}
