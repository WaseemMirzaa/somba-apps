import 'package:flutter/foundation.dart';
import 'realtime_store.dart';

/// Per-category push switches (`me:prefs` -> `notify`, `me:setPrefs {notify: {order: false}}`).
/// A kind that is off still lands in the notifications list; it only stops the push. Every kind is on by default.
class NotifyPrefs extends ChangeNotifier {
  NotifyPrefs._();
  static final NotifyPrefs instance = NotifyPrefs._();

  /// The kinds a shopper can switch (the seller-only `payout` and `stock` are not offered).
  static const List<String> customerKinds = ['order', 'message', 'question', 'review', 'product', 'promo'];

  Map<String, dynamic> get _notify {
    final n = RealtimeStore.instance.prefs['notify'];
    return n is Map ? n.map((k, v) => MapEntry(k.toString(), v)) : <String, dynamic>{};
  }

  bool isOn(String kind) => _notify[kind] != false;

  /// Switches one kind. The change shows at once; when the server refuses it is put back and the error is rethrown
  /// (the caller announces it). The server MERGES the nested map, and so does this: the other kinds are untouched.
  Future<void> set(String kind, bool value) async {
    final previous = isOn(kind);
    _write({kind: value});
    notifyListeners();
    try {
      final res = await RealtimeStore.instance.call('me:setPrefs', {
        'notify': {kind: value}
      });
      if (res is Map && res['notify'] is Map) {
        _write((res['notify'] as Map).map((k, v) => MapEntry(k.toString(), v)));
      }
      notifyListeners();
    } catch (_) {
      _write({kind: previous});
      notifyListeners();
      rethrow;
    }
  }

  void _write(Map<String, dynamic> changes) {
    final store = RealtimeStore.instance;
    store.prefs = {
      ...store.prefs,
      'notify': {..._notify, ...changes}
    };
  }
}
