import Flutter
import UIKit
import GoogleMaps

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  /// True once the Google Maps SDK was given a key. Creating a map without one aborts the app, so the Dart side asks
  /// (channel `com.somba/maps`, method `hasNativeKey`) before it ever shows a map and falls back to typing the address.
  private var mapsKeyProvided = false

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Google Maps SDK key comes from Info.plist (GMSApiKey <- GOOGLE_MAPS_API_KEY in ios/Flutter/Secrets.xcconfig).
    // Without a key the SDK is simply not started and the app never shows the map.
    if let key = Bundle.main.object(forInfoDictionaryKey: "GMSApiKey") as? String,
       !key.isEmpty, !key.hasPrefix("$(") {
      GMSServices.provideAPIKey(key)
      mapsKeyProvided = true
    }
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    let maps = FlutterMethodChannel(name: "com.somba/maps", binaryMessenger: engineBridge.applicationRegistrar.messenger())
    maps.setMethodCallHandler { [weak self] call, result in
      if call.method == "hasNativeKey" {
        result(self?.mapsKeyProvided ?? false)
      } else {
        result(FlutterMethodNotImplemented)
      }
    }
  }
}
