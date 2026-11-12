import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The chime for something new that arrives while the app is open: a live notice over the socket, a push shown as an
/// in-app banner, a chat message from the other side (and, in the rider app, a task alert). Closed-app pushes are
/// sounded by the phone itself (Android channel `somba_default`, iOS `aps.sound`), not by this class.
///
/// One chime per [minGap] (a push and its socket notice arrive together), never throws, and a Sound switch in
/// Settings (saved on this phone, on by default). `SystemSound.play(alert)` is the platform's own alert sound on
/// Android and iOS; tests inject [player] so no audio is played.
class NotificationSound extends ChangeNotifier {
  NotificationSound({void Function()? player, DateTime Function()? clock, this.minGap = const Duration(seconds: 2)})
      : _player = player ?? _systemPlayer,
        _clock = clock ?? DateTime.now;

  /// Not final so a test can swap in an instance with a silent player and its own clock.
  static NotificationSound instance = NotificationSound();
  static const String prefKey = 'notification_sound';

  final Duration minGap;
  final void Function() _player;
  final DateTime Function() _clock;
  DateTime? _last;
  bool _enabled = true;

  /// The Sound switch (default on).
  bool get enabled => _enabled;

  static void _systemPlayer() {
    // The platform's own alert sound (Android and iOS). A failure (no platform channel in a test, a muted device) is ignored.
    SystemSound.play(SystemSoundType.alert).catchError((Object _) {});
  }

  /// Reads the saved choice. Call once at start; a failure keeps the default (on).
  Future<void> load() async {
    try {
      final saved = (await SharedPreferences.getInstance()).getBool(prefKey);
      if (saved != null && saved != _enabled) {
        _enabled = saved;
        notifyListeners();
      }
    } catch (_) {/* storage unavailable: stay on */}
  }

  /// Flips the switch; it shows at once and is saved (a failed save only means it is not remembered).
  Future<void> setEnabled(bool value) async {
    _enabled = value;
    notifyListeners();
    try {
      await (await SharedPreferences.getInstance()).setBool(prefKey, value);
    } catch (_) {/* not remembered after a restart */}
  }

  /// Plays the chime unless the switch is off or one played less than [minGap] ago. True when it played.
  bool play() {
    try {
      if (!_enabled) return false;
      final now = _clock();
      final last = _last;
      if (last != null && now.difference(last) < minGap) return false;
      _last = now;
      _player();
      return true;
    } catch (_) {
      return false;
    }
  }
}

/// Whether a live notice stays silent. Only chat notices do: customer <-> store messaging is closed (admin-controls contract
/// section 3), so a notice of that type is never news. Every other kind of notice sounds.
bool isSilentNotice(String type) => type == 'chat';
