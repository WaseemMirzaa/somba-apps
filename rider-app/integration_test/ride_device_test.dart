// Drives one ride on a simulator or emulator against a real API, for the location and route-map checks that a widget test
// cannot make (the phone's own permission state, the background, scripted GPS positions). It writes a line to
// $SYNC_DIR/log.txt at each step and waits for the file $SYNC_DIR/go-<step> before it goes on, so the person (or script)
// running it can take screenshots, change the phone's permission with `simctl privacy` and send positions with
// `simctl location` / `adb emu geo fix` in between.
//
//   flutter test integration_test/ride_device_test.dart -d <device> --dart-define=API_URL=... \
//     --dart-define=GOOGLE_MAPS_API_KEY=... --dart-define=SYNC_DIR=/tmp/ride --dart-define=TASK_PREFIX=e02e297c
//
// The rider is rider@somba.app of a freshly seeded API; TASK_PREFIX starts the id of an `assigned` pickup of that rider.
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/main.dart' as app;

const _sync = String.fromEnvironment('SYNC_DIR', defaultValue: '/tmp/ride');
const _prefix = String.fromEnvironment('TASK_PREFIX');

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;

  Future<String> step(String name) async {
    Directory(_sync).createSync(recursive: true);
    File('$_sync/log.txt').writeAsStringSync('${DateTime.now().toIso8601String()} READY $name\n', mode: FileMode.append);
    final go = File('$_sync/go-$name');
    for (var i = 0; i < 1200 && !go.existsSync(); i++) {
      await Future<void>.delayed(const Duration(milliseconds: 500));
    }
    return go.existsSync() ? go.readAsStringSync().trim() : '';
  }

  Future<void> until(WidgetTester t, Finder f, {int seconds = 40}) async {
    for (var i = 0; i < seconds * 4; i++) {
      await t.pump(const Duration(milliseconds: 250));
      if (f.evaluate().isNotEmpty) return;
    }
    throw TestFailure('never saw $f');
  }

  testWidgets('a ride: explanation, no permission, settings, scripted positions, background', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
    await prefs.setString('somba.rider.lang', 'en');
    await app.main();
    await until(tester, find.byKey(const ValueKey('rider-email')), seconds: 60);
    await tester.enterText(find.byKey(const ValueKey('rider-email')), 'rider@somba.app');
    await tester.enterText(find.byKey(const ValueKey('rider-password')), 'Somba@2026');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump(const Duration(seconds: 1));
    await tester.ensureVisible(find.byKey(const ValueKey('rider-signin')));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.tap(find.byKey(const ValueKey('rider-signin')), warnIfMissed: false);
    final card = find.byWidgetPredicate((w) => w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('task-$_prefix'));
    await until(tester, card, seconds: 60);
    final id = ((card.evaluate().first.widget.key! as ValueKey<String>).value).substring(5);
    await step('listed');

    await tester.tap(find.byKey(ValueKey('next-$id')));
    await until(tester, find.byKey(ValueKey('route-map-$id')));
    await tester.pump(const Duration(seconds: 2));
    await step('picked-up');

    await tester.tap(find.byKey(ValueKey('route-map-$id')));
    await until(tester, find.byKey(const ValueKey('route-navigate')));
    await tester.pump(const Duration(seconds: 6)); // the map draws, the route is asked
    await step('route-map');
    await tester.tap(find.byIcon(Icons.arrow_back_rounded));
    await tester.pump(const Duration(seconds: 1));

    await tester.tap(find.byKey(ValueKey('next-$id')));
    await until(tester, find.byKey(const ValueKey('location-access-title')));
    final choice = await step('explain'); // "allow" taps Allow (the phone's prompt must then be answered by hand), else Not now
    if (choice == 'allow') {
      await tester.tap(find.text('Allow location'));
    } else {
      await tester.tap(find.byKey(const ValueKey('location-access-skip')));
    }
    await until(tester, find.byKey(const ValueKey('gps-status')), seconds: 90);
    await tester.pump(const Duration(seconds: 2));
    await step('after-explain'); // gps-status shows whether it is sharing or why not

    // The rider fixes the permission in the phone settings (the script does it), then comes back.
    await step('back-from-settings');
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 500));
    }
    await step('sharing');
    await step('end'); // keep the app alive while positions are sent, in the foreground and the background
  }, timeout: const Timeout(Duration(minutes: 60)));
}
