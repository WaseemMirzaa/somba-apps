import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Google Maps configuration for the address picker.
///
/// The map and place search are enabled only when a key is supplied at build/run time:
///   flutter run --dart-define=GOOGLE_MAPS_API_KEY=AIza...
/// The SAME key must also reach the native Maps SDKs:
///   iOS:     GOOGLE_MAPS_API_KEY=AIza...  in ios/Flutter/Secrets.xcconfig (git-ignored)
///   Android: GOOGLE_MAPS_API_KEY=AIza...  in android/local.properties (git-ignored)
/// Enable in Google Cloud: Maps SDK for Android, Maps SDK for iOS, Places API (New), Geocoding API.
/// Without a key the address form works exactly as before (manual entry only).
///
/// Note: the Places/Geocoding calls are plain HTTPS requests made by the app. If you restrict the key to this
/// app's bundle id / package name, those calls are rejected; restrict it by API instead, or use a second
/// unrestricted-by-app key for the web-service calls.
class MapsConfig {
  static const String apiKey = String.fromEnvironment('GOOGLE_MAPS_API_KEY');

  /// The map is offered only when BOTH sides have the key: the Dart define (place search, address lookup) and the
  /// native Maps SDK (the map itself). A map created without the native key aborts the app on iOS and draws nothing on
  /// Android, so a missing native key means "typed address only", never a crash. See [probeNativeKey].
  static bool get enabled => debugEnabledOverride ?? (apiKey.isNotEmpty && _nativeKey);

  static bool _nativeKey = false;
  static const MethodChannel _channel = MethodChannel('com.somba/maps');

  /// Asks the platform whether the Maps SDK has a key (`hasNativeKey`). Call once at start-up, before any screen. Any
  /// failure (no such channel, web) counts as "no key": the safe answer.
  static Future<void> probeNativeKey() async {
    if (apiKey.isEmpty || kIsWeb) return;
    try {
      _nativeKey = await _channel.invokeMethod<bool>('hasNativeKey') ?? false;
    } catch (e) {
      debugPrint('Maps: could not check the native key, the map stays off: $e');
      _nativeKey = false;
    }
    if (!_nativeKey) debugPrint('Maps: the Dart key is set but the native Maps SDK has none (iOS: ios/Flutter/Secrets.xcconfig, Android: android/local.properties). Address entry stays manual.');
  }

  /// Tests only: pretend a key is (or is not) configured. The map itself is replaced in tests, never created.
  static bool? debugEnabledOverride;

  /// Default map view when the customer has no pin yet: Kinshasa, the primary market.
  static const double defaultLat = -4.3224;
  static const double defaultLng = 15.3070;

  /// Place search is limited to the countries the marketplace delivers in.
  static const List<String> regionCodes = ['cd', 'fr'];
}
