import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// Firebase settings given at build time, so push works without committing
/// `google-services.json` / `GoogleService-Info.plist`:
///
///   flutter run --dart-define=FIREBASE_API_KEY=… --dart-define=FIREBASE_PROJECT_ID=… \
///     --dart-define=FIREBASE_SENDER_ID=… --dart-define=FIREBASE_ANDROID_APP_ID=… \
///     --dart-define=FIREBASE_IOS_APP_ID=…
///
/// Returns null when a value this platform needs is missing; Firebase then reads
/// the native config files, and without those push simply stays off.
FirebaseOptions? firebaseOptionsFromDefines({TargetPlatform? platform}) {
  const apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  const projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  const senderId = String.fromEnvironment('FIREBASE_SENDER_ID');
  const androidAppId = String.fromEnvironment('FIREBASE_ANDROID_APP_ID');
  const iosAppId = String.fromEnvironment('FIREBASE_IOS_APP_ID');
  const iosBundleId = String.fromEnvironment('FIREBASE_IOS_BUNDLE_ID');
  return firebaseOptionsFrom(
    apiKey: apiKey,
    projectId: projectId,
    senderId: senderId,
    androidAppId: androidAppId,
    iosAppId: iosAppId,
    iosBundleId: iosBundleId,
    platform: platform ?? defaultTargetPlatform,
  );
}

/// The options for [platform] from raw values (split out so it can be tested).
FirebaseOptions? firebaseOptionsFrom({
  required String apiKey,
  required String projectId,
  required String senderId,
  required String androidAppId,
  required String iosAppId,
  String iosBundleId = '',
  required TargetPlatform platform,
}) {
  final appId = platform == TargetPlatform.iOS ? iosAppId : androidAppId;
  if ([apiKey, projectId, senderId, appId].any((v) => v.trim().isEmpty)) return null;
  return FirebaseOptions(
    apiKey: apiKey,
    appId: appId,
    messagingSenderId: senderId,
    projectId: projectId,
    iosBundleId: platform == TargetPlatform.iOS && iosBundleId.isNotEmpty ? iosBundleId : null,
  );
}
