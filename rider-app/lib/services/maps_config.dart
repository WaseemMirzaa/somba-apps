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
  static bool get enabled => debugEnabledOverride ?? apiKey.isNotEmpty;

  /// Tests only: pretend a key is (or is not) configured. The map itself is replaced in tests, never created.
  static bool? debugEnabledOverride;

  /// Default map view when nothing is known yet: Kinshasa, the primary market.
  static const double defaultLat = -4.3224;
  static const double defaultLng = 15.3070;
}
