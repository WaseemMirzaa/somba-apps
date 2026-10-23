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
  static bool get enabled => debugEnabledOverride ?? apiKey.isNotEmpty;

  /// Tests only: pretend a key is (or is not) configured. The map itself is replaced in tests, never created.
  static bool? debugEnabledOverride;

  /// Default map view when the customer has no pin yet: Kinshasa, the primary market.
  static const double defaultLat = -4.3224;
  static const double defaultLng = 15.3070;

  /// Place search is limited to the countries the marketplace delivers in.
  static const List<String> regionCodes = ['cd', 'fr'];
}
