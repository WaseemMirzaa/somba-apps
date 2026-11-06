import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Google Maps configuration for the route map on a task.
///
/// The map is shown only when a key is supplied at build/run time:
///   flutter run --dart-define=GOOGLE_MAPS_API_KEY=AIza...
/// The SAME key must also reach the native Maps SDKs (both places are git-ignored):
///   Android: GOOGLE_MAPS_API_KEY=AIza...  in android/local.properties
///   iOS:     GOOGLE_MAPS_API_KEY=AIza...  in ios/Flutter/Secrets.xcconfig
/// Enable in Google Cloud: Maps SDK for Android and Maps SDK for iOS. Add Routes API to the key to draw the road route;
/// without it the map draws a straight line to the next stop.
/// Without a key the task list works exactly as before: the Navigate button opens Google Maps or Apple Maps.
class MapsConfig {
  MapsConfig._();

  static const String apiKey = String.fromEnvironment('GOOGLE_MAPS_API_KEY');

  /// The map is offered only when BOTH sides have the key: the Dart define and the native Maps SDK. A map created without
  /// the native key aborts the app on iOS and draws nothing on Android, so a missing native key means "no map, Navigate
  /// still works", never a crash. See [probeNativeKey].
  static bool get enabled => debugEnabledOverride ?? (apiKey.isNotEmpty && _nativeKey);

  static bool _nativeKey = false;
  static const MethodChannel _channel = MethodChannel('com.somba/maps');

  /// Asks the platform whether the Maps SDK has a key (`hasNativeKey`). Call once at start-up. Any failure counts as
  /// "no key": the safe answer.
  static Future<void> probeNativeKey() async {
    if (apiKey.isEmpty || kIsWeb) return;
    try {
      _nativeKey = await _channel.invokeMethod<bool>('hasNativeKey') ?? false;
    } catch (e) {
      debugPrint('Maps: could not check the native key, the map stays off: $e');
      _nativeKey = false;
    }
    if (!_nativeKey) debugPrint('Maps: the Dart key is set but the native Maps SDK has none (iOS: ios/Flutter/Secrets.xcconfig, Android: android/local.properties). The route map stays off.');
  }

  /// Tests only: pretend a key is (or is not) configured. The map itself is replaced in tests, never created.
  static bool? debugEnabledOverride;

  /// Default map view when nothing is known yet: Kinshasa, the primary market.
  static const double defaultLat = -4.3224;
  static const double defaultLng = 15.3070;
}
