import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart' as ph;
import 'package:shared_preferences/shared_preferences.dart';

/// Where the OS notification permission stands.
enum NotifPermState { granted, denied, unknown }

/// What the app needs from the OS to ask for and manage the notification permission. The default uses
/// `permission_handler`, which works on Android 13+ (runtime `POST_NOTIFICATIONS`) and on iOS without Firebase
/// having to start first; tests pass a fake.
abstract class NotificationPermissionBackend {
  Future<NotifPermState> status();

  /// Shows the system prompt (a no-op when the OS will not show it again). Returns the state afterwards.
  Future<NotifPermState> request();

  /// Opens this app's notification settings. False when the settings screen could not be opened.
  Future<bool> openSettings();
}

class SystemNotificationPermission implements NotificationPermissionBackend {
  static NotifPermState _map(ph.PermissionStatus s) => s.isGranted || s.isProvisional ? NotifPermState.granted : NotifPermState.denied;

  @override
  Future<NotifPermState> status() async => _map(await ph.Permission.notification.status);

  @override
  Future<NotifPermState> request() async => _map(await ph.Permission.notification.request());

  @override
  Future<bool> openSettings() => ph.openAppSettings();
}

/// Asks for the notification permission once per install, right after the first sign-in, whether or not Firebase starts
/// in this build, and tells the Settings / Profile row when notifications are off. Every failure is silent: a denied
/// permission never blocks sign-in, and a denial is not re-asked automatically (the row opens the system settings).
class NotificationPermission extends ChangeNotifier {
  NotificationPermission({NotificationPermissionBackend? backend}) : backend = backend ?? SystemNotificationPermission();

  /// Not final so a test can swap in its own instance.
  static NotificationPermission instance = NotificationPermission();
  static const String askedKey = 'notification_permission_asked';

  final NotificationPermissionBackend backend;
  NotifPermState _state = NotifPermState.unknown;
  NotifPermState get state => _state;

  /// The "Notifications are off. Open settings" row shows only when the permission is known not to be granted.
  bool get showSettingsRow => _state == NotifPermState.denied;

  void _set(NotifPermState s) {
    if (s == _state) return;
    _state = s;
    notifyListeners();
  }

  /// Re-reads the OS state (call on resume: the person may have changed it in the system settings).
  Future<void> refresh() async {
    try {
      _set(await backend.status());
    } catch (e) {
      if (kDebugMode) debugPrint('Notification permission status failed: $e');
    }
  }

  /// Shows the system prompt the first time this install signs in; afterwards only re-reads the state.
  /// Returns true when the prompt was requested now.
  Future<bool> askOnce() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final current = await backend.status();
      _set(current);
      if (current == NotifPermState.granted || prefs.getBool(askedKey) == true) return false;
      await prefs.setBool(askedKey, true);
      _set(await backend.request());
      return true;
    } catch (e) {
      if (kDebugMode) debugPrint('Notification permission request failed: $e');
      return false;
    }
  }

  Future<bool> openSettings() async {
    try {
      return await backend.openSettings();
    } catch (_) {
      return false;
    }
  }
}
