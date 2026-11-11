// The app is portrait only: Android locks the activity in the manifest, iOS in code (SystemChrome) at start-up.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Android: the main activity is locked to portrait in the manifest', () {
    final manifest = File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
    expect(manifest, contains('android:screenOrientation="portrait"'));
  });

  test('iOS: main() asks for portrait only, as the first thing after the bindings are ready', () {
    final main = File('lib/main.dart').readAsStringSync();
    expect(
      RegExp(r'ensureInitialized\(\);\s*(//[^\n]*\n\s*)?await SystemChrome\.setPreferredOrientations\(const \[DeviceOrientation\.portraitUp\]\);').hasMatch(main),
      isTrue,
    );
  });
}
