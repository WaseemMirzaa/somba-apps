import 'package:flutter/foundation.dart';
import 'rider_store.dart';
import 'shift_models.dart';

/// The rider's shift state (clock in/out, breaks) and last 7 days. The shift IS the duty state: on shift while one is open.
/// Reads and writes go over the rider's one socket (`shift:*` events); a `shift:updated` push (this phone, another phone,
/// or the server closing a forgotten shift) replaces the state at once.
class ShiftStore extends ChangeNotifier {
  ShiftStore._();
  static final ShiftStore instance = ShiftStore._();

  ShiftSummary? summary;
  bool loading = false;

  /// The last read failed (shown with a retry); cleared by the next good answer.
  Object? loadError;

  /// A clock action is in flight (the buttons wait, so a double tap sends once).
  bool busy = false;

  Future<dynamic> _ask(String event) => RiderStore.instance.request(event);

  /// Read the state (`shift:mine`). Quiet on failure: [loadError] says so and an older state stays on screen.
  Future<void> load() async {
    if (loading) return;
    loading = true;
    notifyListeners();
    try {
      _apply(await _ask('shift:mine'));
      loadError = null;
    } catch (e) {
      loadError = e;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> clockIn() => _act('shift:clockIn');
  Future<void> clockOut() => _act('shift:clockOut');
  Future<void> startBreak() => _act('shift:breakStart');
  Future<void> endBreak() => _act('shift:breakEnd');

  /// One clock action. Throws what the server refuses with (the screen shows it); the state is left as it was.
  Future<void> _act(String event) async {
    if (busy) return;
    busy = true;
    notifyListeners();
    try {
      _apply(await _ask(event));
      loadError = null;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  /// A `shift:updated` push.
  void applyPush(dynamic d) {
    try {
      _apply(d);
      loadError = null;
      notifyListeners();
    } catch (_) {/* malformed push: the next read fixes it */}
  }

  void _apply(dynamic d) {
    if (d is! Map) throw const FormatException('shift answer');
    summary = ShiftSummary.fromJson(d.map((k, v) => MapEntry(k.toString(), v)));
  }

  /// Sign-out: forget everything.
  void clear() {
    summary = null;
    loading = false;
    loadError = null;
    busy = false;
    notifyListeners();
  }
}
