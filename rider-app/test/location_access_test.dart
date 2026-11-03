// The location explanation screen and its place in the ride: why the position is shared, the phone's own prompt, the way
// to the settings when location is refused or off, and what "Not now" does. The reporter is a fake: no sensor is touched.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/deliveries_screen.dart';
import 'package:somba_rider/screens/location_access_screen.dart';
import 'package:somba_rider/services/location_reporter.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

import 'task_fixtures.dart';

MaterialApp _app(Widget home, String lang) => MaterialApp(
      locale: Locale(lang),
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      theme: AppTheme.light(),
      home: home,
    );

/// A host that opens the screen on demand and keeps what it answered.
class _Host extends StatefulWidget {
  const _Host(this.reporter, this.initial);
  final FakeLocationReporter reporter;
  final LocationAccess initial;
  @override
  State<_Host> createState() => _HostState();
}

class _HostState extends State<_Host> {
  bool? answer;
  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('answer: $answer', key: const ValueKey('answer')),
            TextButton(
              key: const ValueKey('open'),
              onPressed: () async {
                final r = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => LocationAccessScreen(reporter: widget.reporter, initial: widget.initial)));
                setState(() => answer = r);
              },
              child: const Text('open'),
            ),
          ]),
        ),
      );
}

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
      await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
    }
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await Strings.setLang('en', persist: false);
  });

  Future<void> open(WidgetTester t, FakeLocationReporter r, LocationAccess initial, {String lang = 'en'}) async {
    await Strings.setLang(lang, persist: false);
    t.view.physicalSize = const Size(360 * 3, 780 * 3);
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    await t.pumpWidget(_app(_Host(r, initial), lang));
    await t.tap(find.byKey(const ValueKey('open')));
    await t.pumpAndSettle();
  }

  group('the screen', () {
    for (final lang in ['en', 'fr']) {
      testWidgets('first time: says why, when it stops and which answer to give; Allow raises the phone prompt and carries on ($lang)', (t) async {
        final s = Strings(lang);
        final r = FakeLocationReporter(LocationAccess.denied);
        await open(t, r, LocationAccess.denied, lang: lang);
        expect(find.text(s.locTitle), findsOneWidget);
        expect(find.text(s.locIntro), findsOneWidget);
        expect(find.text(s.locPointScreen), findsOneWidget);
        expect(find.text(s.locPointStop), findsOneWidget);
        expect(find.text(s.locPointChoice), findsOneWidget, reason: '"While using the app" is what to pick; "Always" is never asked');
        expect(find.text(s.locAllow), findsOneWidget);
        expect(find.text(s.locNotNow), findsOneWidget);
        expect(find.byType(FilledButton), findsOneWidget, reason: 'one filled button per screen');
        expect(r.prompts, 0, reason: 'nothing is asked before the rider taps');
        await t.tap(find.text(s.locAllow));
        await t.pumpAndSettle();
        expect(r.prompts, 1);
        expect(find.text('answer: true'), findsOneWidget);
      });
    }

    testWidgets('the phone refuses for good: the screen becomes "turned off" with Open settings, which opens the app settings', (t) async {
      final s = Strings('en');
      final r = FakeLocationReporter(LocationAccess.denied)..promptAnswer = LocationAccess.deniedForever;
      await open(t, r, LocationAccess.denied);
      await t.tap(find.text(s.locAllow));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('location-access-blocked-body')), findsOneWidget);
      expect(find.text(s.locBlockedTitle), findsOneWidget);
      expect(find.text(s.locAllow), findsNothing);
      await t.tap(find.text(s.openSettings));
      await t.pumpAndSettle();
      expect(r.settingsOpened, [LocationAccess.deniedForever]);
      expect(find.text('answer: null'), findsNothing, reason: 'still on the screen');
    });

    testWidgets('GPS off: says so and opens the location settings, not the app settings', (t) async {
      final s = Strings('en');
      final r = FakeLocationReporter(LocationAccess.serviceOff);
      await open(t, r, LocationAccess.serviceOff);
      expect(find.text(s.locGpsOffBody), findsOneWidget);
      await t.tap(find.text(s.openSettings));
      await t.pumpAndSettle();
      expect(r.settingsOpened, [LocationAccess.serviceOff]);
    });

    testWidgets('a settings page that cannot be opened is reported in a snackbar', (t) async {
      final r = FakeLocationReporter(LocationAccess.deniedForever)..settingsCanOpen = false;
      await open(t, r, LocationAccess.deniedForever);
      await t.tap(find.text(Strings('en').openSettings));
      await t.pump();
      await t.pump(const Duration(milliseconds: 300));
      expect(find.descendant(of: find.byType(SnackBar), matching: find.text(Strings('en').locSettingsFailed)), findsOneWidget);
    });

    testWidgets('coming back from the settings with location allowed carries on by itself', (t) async {
      final r = FakeLocationReporter(LocationAccess.deniedForever);
      await open(t, r, LocationAccess.deniedForever);
      expect(find.text(Strings('en').locBlockedTitle), findsOneWidget);
      r.access = LocationAccess.granted; // the rider switched it on in the phone settings
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await t.pumpAndSettle();
      expect(find.text('answer: true'), findsOneWidget);
    });

    testWidgets('coming back with location still off keeps the screen, with the right reason', (t) async {
      final r = FakeLocationReporter(LocationAccess.deniedForever);
      await open(t, r, LocationAccess.deniedForever);
      r.access = LocationAccess.serviceOff;
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await t.pumpAndSettle();
      expect(find.text(Strings('en').locGpsOffBody), findsOneWidget);
    });

    testWidgets('"Not now" and "Continue without location" answer false', (t) async {
      final s = Strings('en');
      final r = FakeLocationReporter(LocationAccess.denied);
      await open(t, r, LocationAccess.denied);
      await t.tap(find.text(s.locNotNow));
      await t.pumpAndSettle();
      expect(find.text('answer: false'), findsOneWidget);
      expect(r.prompts, 0);

      final r2 = FakeLocationReporter(LocationAccess.deniedForever);
      await open(t, r2, LocationAccess.deniedForever);
      await t.tap(find.text(s.locContinueWithout));
      await t.pumpAndSettle();
      expect(find.text('answer: false'), findsOneWidget);
    });
  });

  group('in the ride', () {
    final sent = <String>[];
    late FakeLocationReporter reporter;

    Future<void> show(WidgetTester t, LocationAccess access) async {
      reporter = FakeLocationReporter(access);
      final store = RiderStore.instance;
      store.location = reporter;
      store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean', role: 'rider', phone: '+243810000000');
      store.loaded = true;
      store.myTasks
        ..clear()
        ..add(leg('delivery', id: 'd', status: 'picked_up'));
      sent.clear();
      store.transport = (event, body) async {
        sent.add(event);
        return switch (event) {
          'rider:tasks' || 'notifications:list' || 'support:list' => <dynamic>[],
          'settings:get' => <String, dynamic>{},
          'rider:workStats' => {'totalTasks': 0, 'completed': 0, 'active': 0, 'failed': 0, 'completedToday': 0, 'completedLast7Days': 0, 'successRate': null, 'byKind': []},
          'cash:mine' => {'collectedUsd': 0, 'handedOverUsd': 0, 'heldUsd': 0, 'openTasks': 0, 'handovers': []},
          _ => {'ok': true},
        };
      };
      t.view.physicalSize = const Size(360 * 3, 1400 * 3);
      t.view.devicePixelRatio = 3;
      addTearDown(t.view.reset);
      await t.pumpWidget(_app(const Scaffold(body: DeliveriesScreen()), 'en'));
      await t.pump(const Duration(milliseconds: 500));
    }

    tearDown(() {
      final store = RiderStore.instance;
      store.transport = null;
      store.user = null;
      store.myTasks.clear();
      store.location = LocationReporter();
    });

    testWidgets('setting off with location not yet allowed: the screen first, then the status moves on', (t) async {
      await show(t, LocationAccess.denied);
      await t.tap(find.byKey(const ValueKey('next-d')));
      await t.pumpAndSettle();
      expect(find.byType(LocationAccessScreen), findsOneWidget);
      expect(sent, isNot(contains('delivery:updateStatus')), reason: 'nothing moves until the rider has answered');
      await t.tap(find.text(Strings('en').locAllow));
      await t.pumpAndSettle();
      expect(find.byType(LocationAccessScreen), findsNothing);
      expect(sent, contains('delivery:updateStatus'));
      expect(reporter.promptsAllowed, isTrue);
    });

    testWidgets('"Not now": the ride goes on, and the phone is not asked again on it', (t) async {
      await show(t, LocationAccess.denied);
      await t.tap(find.byKey(const ValueKey('next-d')));
      await t.pumpAndSettle();
      await t.tap(find.text(Strings('en').locNotNow));
      await t.pumpAndSettle();
      expect(sent, contains('delivery:updateStatus'));
      expect(reporter.promptsAllowed, isFalse);
      expect(reporter.prompts, 0);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getBool('somba.rider.bgLocationExplained'), isTrue, reason: 'shown once per install');
    });

    testWidgets('location already allowed: no screen at all', (t) async {
      await show(t, LocationAccess.granted);
      await t.tap(find.byKey(const ValueKey('next-d')));
      await t.pumpAndSettle();
      expect(find.byType(LocationAccessScreen), findsNothing);
      expect(sent, contains('delivery:updateStatus'));
    });

    testWidgets('shown once per install: the second set-off goes straight through', (t) async {
      SharedPreferences.setMockInitialValues({'somba.rider.bgLocationExplained': true});
      await show(t, LocationAccess.denied);
      await t.tap(find.byKey(const ValueKey('next-d')));
      await t.pumpAndSettle();
      expect(find.byType(LocationAccessScreen), findsNothing);
      expect(sent, contains('delivery:updateStatus'));
    });

    testWidgets('a pickup leg ("On the way to the warehouse") explains it too, so does a transfer run', (t) async {
      await show(t, LocationAccess.denied);
      RiderStore.instance.myTasks
        ..clear()
        ..add(leg('pickup', id: 'p', status: 'picked_up'));
      RiderStore.instance.applySettingsPush({}); // repaint
      await t.pump();
      await t.tap(find.byKey(const ValueKey('next-p')));
      await t.pumpAndSettle();
      expect(find.byType(LocationAccessScreen), findsOneWidget);
    });
  });

  group('the reporter', () {
    test('after "Not now" it checks the permission but never raises the phone prompt', () async {
      final r = FakeLocationReporter(LocationAccess.denied)..promptsAllowed = false;
      final got = await r.start('t', (_, __) async {}, notice: const TrackingNotice(title: 'a', text: 'b', channel: 'c'));
      // The fake overrides check/ensure only; start() chose between them by promptsAllowed.
      expect(got, LocationAccess.denied);
      expect(r.prompts, 0);
      expect(r.checks, 1);
    });

    test('by default it asks once when the permission can still be asked', () async {
      final r = FakeLocationReporter(LocationAccess.denied)..promptAnswer = LocationAccess.deniedForever;
      final got = await r.start('t', (_, __) async {}, notice: const TrackingNotice(title: 'a', text: 'b', channel: 'c'));
      expect(got, LocationAccess.deniedForever);
      expect(r.prompts, 1);
    });
  });
}
