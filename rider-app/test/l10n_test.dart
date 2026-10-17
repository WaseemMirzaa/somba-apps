// Language coverage for the rider app: every text exists in French and English,
// the phone's language is the default, the choice persists, and the GPS runs
// (also in the background) only while a delivery is in transit.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/messages.dart';
import 'package:somba_rider/l10n/notification_text.dart';
import 'package:somba_rider/l10n/server_errors.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/main.dart';
import 'package:somba_rider/screens/deliveries_screen.dart';
import 'package:somba_rider/services/auth_service.dart';
import 'package:somba_rider/services/location_reporter.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/rider_store.dart';

/// Texts that are the same word in both languages.
const _sameInBothLanguages = {'notifications'};

Set<String> _placeholders(String text) => RegExp(r'\{(\w+)\}').allMatches(text).map((m) => m.group(1)!).toSet();

/// Records what the store asks of the GPS, without touching a real sensor.
class _FakeReporter extends LocationReporter {
  final started = <String>[];
  final notices = <TrackingNotice>[];
  var stops = 0;
  String? _task;

  @override
  bool get running => _task != null;
  @override
  String? get taskId => _task;

  @override
  Future<LocationAccess> start(String taskId, Future<void> Function(double lat, double lng) send, {required TrackingNotice notice}) async {
    started.add(taskId);
    notices.add(notice);
    _task = taskId;
    return LocationAccess.granted;
  }

  @override
  Future<void> stop() async {
    stops++;
    _task = null;
  }
}

DeliveryTaskDto _task(String id, String status) => DeliveryTaskDto(id: id, orderId: 'o-$id', orderReference: 'SOM-$id', status: status, codAmountUsd: 0);

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await Strings.setLang('en', persist: false);
  });

  group('translations', () {
    test('every key has a non-empty English and French text', () {
      expect(kMessages, isNotEmpty);
      final missing = <String>[];
      kMessages.forEach((key, v) {
        if (v.$1.trim().isEmpty) missing.add('$key (en)');
        if (v.$2.trim().isEmpty) missing.add('$key (fr)');
      });
      expect(missing, isEmpty);
    });

    test('both languages use the same {placeholders}', () {
      final bad = kMessages.entries.where((e) {
        final a = _placeholders(e.value.$1), b = _placeholders(e.value.$2);
        return a.length != b.length || !a.containsAll(b);
      }).map((e) => e.key);
      expect(bad, isEmpty);
    });

    test('French is really translated', () {
      final same = kMessages.entries.where((e) => e.value.$1 == e.value.$2).map((e) => e.key).toSet();
      expect(same.difference(_sameInBothLanguages), isEmpty);
    });

    test('every key used from the code exists, and the families are complete', () {
      final used = <String>{};
      final call = RegExp(r"""\bt\(\s*'(\w+)'""");
      for (final f in Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
        if (f.path.contains('messages.dart') || f.path.endsWith('strings_keys.dart')) continue;
        used.addAll(call.allMatches(f.readAsStringSync()).map((m) => m.group(1)!));
      }
      expect(kMessages.keys.toSet().containsAll(used), isTrue, reason: '${used.difference(kMessages.keys.toSet())}');
      const s = Strings('fr');
      for (final st in ['assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'unassigned']) {
        expect(s.has('task_$st'), isTrue, reason: 'task_$st');
      }
      for (final r in kFailReasonIds) {
        expect(s.has('fail_$r'), isTrue, reason: 'fail_$r');
      }
      for (final a in ['act_picked_up', 'act_in_transit', 'act_delivered']) {
        expect(s.has(a), isTrue);
      }
    });

    test('no user-visible English is hard-coded in lib/', () {
      final pattern = RegExp(
          r"""(?:(?:Text|SelectableText)\(\s*(?:const\s+)?|(?:hintText|labelText|helperText|errorText|tooltip|semanticLabel|applicationName):\s*)'((?:[^'\\]|\\.)*)'""");
      const brand = {'Somba&Teka', 'EN', 'FR'};
      final offenders = <String>[];
      for (final f in Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
        if (f.path.contains('/l10n/')) continue;
        final source = f.readAsStringSync().replaceAll(RegExp(r'\$\{[^{}]*\}'), '');
        for (final m in pattern.allMatches(source)) {
          final text = m.group(1)!.replaceAll(RegExp(r'\$\w+'), '');
          if (brand.contains(text)) continue;
          if (RegExp(r'[A-Za-zÀ-ÿ]{3,}').hasMatch(text)) offenders.add('${f.path}: $text');
        }
      }
      expect(offenders, isEmpty);
    });
  });

  group('server messages', () {
    const fr = Strings('fr');
    test('known English errors are translated, unknown ones pass through', () {
      expect(translateServerError('Invalid email or password.', fr), 'E-mail ou mot de passe incorrect.');
      expect(translateServerError('Wrong delivery code. Ask the customer for the 4-digit code shown in their app.', fr), startsWith('Code de livraison incorrect'));
      expect(translateServerError('This delivery is no longer available.', fr), 'Cette livraison n’est plus disponible.');
      expect(translateServerError('Not allowed.', fr), 'Action non autorisée.');
      expect(translateServerError('A picked up delivery cannot become delivered.', fr), contains('récupérée'));
      expect(translateServerError('Something new.', fr), 'Something new.');
      expect(translateServerError('Not allowed.', const Strings('en')), 'Not allowed.');
      for (final m in knownServerErrors) {
        expect(translateServerError(m, fr), isNot(equals(m)), reason: m);
      }
    });

    test('ApiException prints in the current language; notifications are translated', () async {
      expect(ApiException('Not allowed.').toString(), 'Not allowed.');
      await Strings.setLang('fr', persist: false);
      expect(ApiException('Not allowed.').toString(), 'Action non autorisée.');
      expect(ApiException.local('err_offline').toString(), contains('Impossible de joindre le serveur'));
      expect(Strings.current.errorText(StateError('boom')), Strings.current.errUnexpected);
      expect(localizeNotification(Strings.current, 'Parcel ready for pickup', 'SOM-7 is packed and ready.'), ('Colis prêt à récupérer', 'SOM-7 est emballé et prêt.'));
      expect(Strings.current.usd(12.5).replaceAll(RegExp(r'[  ]'), ' '), '12,50 \$');
      await Strings.setLang('en', persist: false);
      expect(Strings.current.usd(12.5), '\$12.50');
    });
  });

  group('language choice', () {
    testWidgets('defaults to the phone language: French phone -> French, anything else -> English', (tester) async {
      tester.platformDispatcher.localesTestValue = const [Locale('fr', 'CD')];
      tester.platformDispatcher.localeTestValue = const Locale('fr', 'CD');
      addTearDown(tester.platformDispatcher.clearAllTestValues);
      await Strings.restore();
      expect(Strings.current.lang, 'fr');

      tester.platformDispatcher.localesTestValue = const [Locale('en', 'US')];
      tester.platformDispatcher.localeTestValue = const Locale('en', 'US');
      await Strings.restore();
      expect(Strings.current.lang, 'en');

      tester.platformDispatcher.localesTestValue = const [Locale('sw', 'KE')];
      tester.platformDispatcher.localeTestValue = const Locale('sw', 'KE');
      await Strings.restore();
      expect(Strings.current.lang, 'en');
    });

    testWidgets('a saved choice beats the phone language and survives a restart', (tester) async {
      tester.platformDispatcher.localeTestValue = const Locale('fr', 'CD');
      addTearDown(tester.platformDispatcher.clearAllTestValues);
      await Strings.setLang('en');
      expect((await SharedPreferences.getInstance()).getString('somba.rider.lang'), 'en');
      await Strings.setLang('fr', persist: false); // pretend the process restarted…
      SharedPreferences.setMockInitialValues({'somba.rider.lang': 'en'});
      await Strings.restore(); // …and read the choice back
      expect(Strings.current.lang, 'en');
    });

    testWidgets('switching the language changes the visible sign-in texts', (tester) async {
      SharedPreferences.setMockInitialValues({'somba.rider.lang': 'fr'});
      await Strings.restore();
      await tester.pumpWidget(const SombaRiderApp());
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      expect(find.text('Bon retour'), findsOneWidget);
      expect(find.text(const Strings('fr').forgotPassword), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('lang-toggle')));
      await tester.pumpAndSettle();
      expect(find.text('Welcome back'), findsOneWidget);
      expect(find.text('Forgot password?'), findsOneWidget);
      expect(find.text('Bon retour'), findsNothing);

      // Validation error follows the language.
      await tester.tap(find.byKey(const ValueKey('rider-signin')));
      await tester.pump();
      expect(find.text('Enter your email and password'), findsOneWidget);
      expect(Strings.current.lang, 'en');
    });

    testWidgets('delivery sheets render in French', (tester) async {
      await Strings.setLang('fr', persist: false);
      await tester.pumpWidget(const MaterialApp(
        locale: Locale('fr'),
        supportedLocales: [Locale('en'), Locale('fr')],
        localizationsDelegates: [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
        home: Scaffold(body: FailReasonSheet()),
      ));
      expect(find.text(const Strings('fr').failTitle), findsOneWidget);
      expect(find.text('Client injoignable'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('reason-wrong_address')));
      await tester.pump();
      await tester.enterText(find.byKey(const ValueKey('reason-text')), 'rue fermée');
      await tester.pump();
      final submit = tester.widget<FilledButton>(find.byKey(const ValueKey('reason-submit')));
      expect(submit.onPressed, isNotNull);
    });
  });

  group('background location', () {
    const notice = TrackingNotice(title: 'Livraison en cours', text: 'Partage de votre position avec le client', channel: 'Suivi de livraison');

    test('Android: foreground service with a localised ongoing notification', () {
      final s = trackingSettings(notice, platform: TargetPlatform.android, web: false);
      expect(s, isA<AndroidSettings>());
      final cfg = (s as AndroidSettings).foregroundNotificationConfig!;
      expect(cfg.notificationTitle, 'Livraison en cours');
      expect(cfg.notificationText, 'Partage de votre position avec le client');
      expect(cfg.notificationChannelName, 'Suivi de livraison');
      expect(cfg.setOngoing, isTrue);
      expect(cfg.enableWakeLock, isTrue);
    });

    test('iOS: background location updates enabled, never paused', () {
      final s = trackingSettings(notice, platform: TargetPlatform.iOS, web: false);
      expect(s, isA<AppleSettings>());
      final a = s as AppleSettings;
      expect(a.allowBackgroundLocationUpdates, isTrue);
      expect(a.pauseLocationUpdatesAutomatically, isFalse);
      expect(a.showBackgroundLocationIndicator, isTrue);
    });

    test('web / desktop: a plain foreground stream', () {
      expect(trackingSettings(notice, platform: TargetPlatform.android, web: true), isNot(isA<AndroidSettings>()));
      expect(trackingSettings(notice, platform: TargetPlatform.linux, web: false), isNot(isA<AppleSettings>()));
    });

    test('the store tracks only in_transit and stops on delivered / failed / sign-out', () async {
      final store = RiderStore.instance;
      final fake = _FakeReporter();
      store.location = fake;
      await Strings.setLang('fr', persist: false);
      void load(List<DeliveryTaskDto> tasks) => store.myTasks
        ..clear()
        ..addAll(tasks);

      load([_task('1', 'assigned')]);
      store.syncLocationNow();
      load([_task('1', 'picked_up')]);
      store.syncLocationNow();
      expect(fake.started, isEmpty, reason: 'not on the road yet');

      load([_task('1', 'in_transit')]);
      store.syncLocationNow();
      await Future<void>.delayed(Duration.zero);
      expect(fake.started, ['1']);
      expect(fake.notices.single.title, 'Livraison en cours', reason: 'the foreground notification is in the rider\'s language');
      store.syncLocationNow();
      expect(fake.started, ['1'], reason: 'already tracking this delivery: no restart');

      load([_task('1', 'delivered')]);
      store.syncLocationNow();
      await Future<void>.delayed(Duration.zero);
      expect(fake.running, isFalse);
      expect(fake.stops, 1);

      load([_task('2', 'in_transit')]);
      store.syncLocationNow();
      await Future<void>.delayed(Duration.zero);
      expect(fake.started, ['1', '2']);
      load([_task('2', 'failed')]);
      store.syncLocationNow();
      await Future<void>.delayed(Duration.zero);
      expect(fake.running, isFalse);

      load([_task('3', 'in_transit')]);
      store.syncLocationNow();
      await Future<void>.delayed(Duration.zero);
      expect(fake.running, isTrue);
      await store.logout();
      expect(fake.running, isFalse, reason: 'sign-out stops the GPS');
      store.location = LocationReporter();
    });
  });
}
