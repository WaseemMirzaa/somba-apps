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
import 'package:somba_rider/services/support_models.dart';
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
      for (final st in ['assigned', 'picked_up', 'in_transit', 'delivered', 'failed']) {
        expect(s.has('task_$st'), isTrue, reason: 'task_$st');
      }
      for (final r in kFailReasonIds) {
        expect(s.has('fail_$r'), isTrue, reason: 'fail_$r');
      }
      for (final a in ['act_picked_up', 'act_in_transit', 'act_delivered', 'act_picked_up_seller', 'act_picked_up_customer', 'act_in_transit_hub', 'act_in_transit_seller', 'act_delivered_seller']) {
        expect(s.has(a), isTrue, reason: a);
      }
      for (final k in LegKind.all) {
        expect(s.has('kind_$k'), isTrue, reason: 'kind_$k');
      }
      for (final st in ['open', 'pending', 'resolved', 'closed']) {
        expect(s.has('ticket_$st'), isTrue, reason: 'ticket_$st');
      }
      for (final c in kSupportCategories) {
        expect(s.has('cat_$c'), isTrue, reason: 'cat_$c');
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

    // docs/contracts/logistics.md section 10, after-sale.md sections 6 and 11, and the photo upload.
    const newErrors = [
      'Your warehouse assigns your tasks. You cannot accept a task yourself.',
      'Your account is not linked to a warehouse. Ask an administrator.',
      'Only supervisors and managers can assign riders.',
      'Only managers can change staff tiers.',
      'Only managers can see the staff list.',
      'Only an administrator can make someone a manager.',
      'You cannot change your own tier.',
      'This person works at another warehouse.',
      'Only warehouse staff have a tier.',
      'This task belongs to another warehouse.',
      'This rider works at another warehouse.',
      'Choose an active rider.',
      'This delivery is no longer available.',
      'This parcel is not due at your warehouse.',
      'This parcel was already scanned in.',
      'A failed task cannot be scanned in.',
      'This task is finished by the rider, not scanned in.',
      'This leg ends at the warehouse: warehouse staff scan the parcel in.',
      'This parcel does not leave from your warehouse.',
      'Assign a rider before handing the parcel over.',
      'Pin your delivery address on the map.',
      'Delivery is not available right now: no warehouse is open.',
      'Place the warehouse on the map: latitude and longitude are required.',
      'Enter a valid latitude (-90 to 90) and longitude (-180 to 180).',
      'Enter a valid pickup location: latitude -90 to 90 and longitude -180 to 180.',
      'Pin your pickup location on the map (Store settings) before listing products.',
      'Riders and warehouse staff must belong to a warehouse. Pick one from the list.',
      'Pick an active warehouse from the list.',
      'This order has no destination warehouse.',
      'One of the returned items is not on this order.',
      'Delivery task not found.',
      'This delivery was just updated. Refresh and try again.',
      'Wrong delivery code. Ask the customer for the 4-digit code shown in their app.',
      'Subject and message are required.',
      'Write a message first.',
      'Ticket not found.',
      'Order not found.',
      'Photos must be a list of uploaded images.',
      'Photos must be images uploaded through the app.',
      'Only JPEG, PNG or WebP images are allowed.',
      'No file uploaded (field name "file").',
      'File too large',
    ];

    test('every new server error of the logistics and support contracts has a French text', () {
      final known = knownServerErrors.toSet();
      for (final m in newErrors) {
        expect(known, contains(m), reason: 'not in the known errors: $m');
        expect(translateServerError(m, fr), isNot(equals(m)), reason: m);
      }
      expect(translateServerError('You can attach up to 6 photos.', fr), 'Vous pouvez joindre jusqu’à 6 photos.');
      expect(translateServerError('Ticket not found.', fr), 'Ticket introuvable.');
      expect(translateServerError('Ticket not found.', const Strings('en')), 'Ticket not found.');
    });

    // docs/contracts/areas.md, "Errors (English on the wire -> French in clients)": EVERY string of the section.
    const areasLiteralErrors = [
      // geography and coverage
      'Choose where this warehouse is.',
      'Area not found.',
      'Hub not found.',
      'Choose at least one area.',
      'Flat delivery fee must be a number between 0 and 500.',
      'An area with this name already exists here.',
      'An area with this code already exists.',
      'Level must be one of: country, province, city, district, commune, quartier.',
      'Active must be true or false.',
      'Not allowed.',
      'A warehouse cannot cover an area it is not allowed to serve.',
      // routing and checkout
      'Delivery between cities is not available right now.',
      'One seller in your cart cannot ship from their area yet.',
      'Your pickup area is not served yet. You can prepare your store; sales open when we deliver there.',
      'Pin your delivery address on the map.',
      'Delivery is not available right now: no warehouse is open.',
      // lanes and runs
      'These warehouses are not connected by any lane.',
      'A lane connects two different warehouses.',
      'Lane not found.',
      'Transit time (hours) must be a number between 0 and 720.',
      'Lane cost must be a number between 0 and 1000.',
      'Bidirectional must be true or false.',
      'This run has already left.',
      'This run has not left yet.',
      'This run is already closed.',
      'Run not found.',
      'Only parcels waiting at this warehouse can join this run.',
      'Choose at least one parcel.',
      'Choose parcels of this run.',
      'Choose some of the parcels of this run, not all of them.',
      'That parcel is not in this run.',
      'Choose a driver for this run first.',
      'This run has no parcels left to send.',
      'Choose an active rider.',
      'This rider works at another warehouse.',
      'This parcel is part of a transfer run. Manage it from the run.',
      'Only supervisors and managers can assign riders.',
      'This task belongs to another warehouse.',
      'This parcel is not due at your warehouse.',
      'Your account is not linked to a warehouse. Ask an administrator.',
      'Choose a warehouse.',
      'Staff only.',
      'Riders only.',
      'Status must be in_transit.',
    ];
    // The ones with a placeholder, as the server fills them in.
    const areasPatternErrors = {
      'This area is already covered by Entrepôt Limete.': 'Cette zone est déjà couverte par Entrepôt Limete.',
      'A commune cannot be added under a province.': 'Le niveau « commune » ne peut pas être ajouté sous le niveau « province ».',
      'A city cannot be added under a country.': 'Le niveau « ville » ne peut pas être ajouté sous le niveau « pays ».',
      'A quartier cannot be added under a district.': 'Le niveau « quartier » ne peut pas être ajouté sous le niveau « district ».',
      'We don\'t deliver to Goma yet.': 'Nous ne livrons pas encore à Goma.',
      'We don’t deliver to Limete yet.': 'Nous ne livrons pas encore à Limete.',
      'We don\'t deliver to this area yet.': 'Nous ne livrons pas encore dans cette zone.',
      'Parcel missing from run TR-0042.': 'Colis manquant dans la tournée TR-0042.',
    };

    test('every error string of the areas contract has a French text; English stays English', () {
      const en = Strings('en');
      final known = knownServerErrors.toSet();
      for (final m in areasLiteralErrors) {
        expect(known, contains(m), reason: 'not in the known errors: $m');
        final text = translateServerError(m, fr);
        expect(text, isNot(equals(m)), reason: m);
        expect(text, isNot(contains('{')), reason: m);
        expect(translateServerError(m, en), m, reason: m);
      }
      areasPatternErrors.forEach((m, expected) {
        expect(translateServerError(m, fr), expected, reason: m);
        expect(translateServerError(m, en), m, reason: m);
      });
    });

    test('the server may add a trailing space or a new sentence: a text we do not know is shown as received', () {
      expect(translateServerError('  Run not found.  ', fr), 'Tournée introuvable.');
      expect(translateServerError('Run not found. Try later.', fr), 'Run not found. Try later.');
    });

    test('rider notices are French: task, support and attention notices', () {
      expect(localizeNotification(fr, 'New task assigned to you', 'SOM-1: pickup is now in your tasks.'), ('Nouvelle tâche qui vous est assignée', 'SOM-1 : la collecte est maintenant dans vos tâches.'));
      expect(localizeNotification(fr, 'New task assigned to you', 'SOM-1: return to seller is now in your tasks.').$2, 'SOM-1 : le retour au vendeur est maintenant dans vos tâches.');
      expect(localizeNotification(fr, 'Support reply', 'TKT-1: Merci').$1, 'Réponse de l’assistance');
      expect(localizeNotification(fr, 'Task needs attention', 'SOM-1: transfer failed after 3 attempts (Customer unreachable).'),
          ('Tâche à vérifier', 'SOM-1 : le transfert a échoué après 3 tentatives (Customer unreachable).'));
      expect(localizeNotification(fr, 'Ticket resolved', 'TKT-1 · x').$1, 'Ticket résolu');
      expect(localizeNotification(const Strings('en'), 'Support reply', 'TKT-1: Merci').$1, 'Support reply');
    });

    test('ApiException prints in the current language; notifications are translated', () async {
      expect(ApiException('Not allowed.').toString(), 'Not allowed.');
      await Strings.setLang('fr', persist: false);
      expect(ApiException('Not allowed.').toString(), 'Action non autorisée.');
      expect(ApiException.local('err_offline').toString(), contains('Impossible de joindre le serveur'));
      expect(Strings.current.errorText(StateError('boom')), Strings.current.errUnexpected);
      expect(localizeNotification(Strings.current, 'Parcel ready for pickup', 'SOM-7 is packed and ready.'), ('Colis prêt à récupérer', 'SOM-7 est emballé et prêt.'));
      expect(localizeNotification(Strings.current, 'New delivery available', r'SOM-7 · collect $12.50 cash. Open the app to accept it.'),
          ('Nouvelle livraison disponible', 'SOM-7 · 12,50\u00a0\$ à encaisser. Ouvrez l’application pour l’accepter.'));
      expect(localizeNotification(Strings.current, 'New delivery available', 'SOM-8. Open the app to accept it.').$2, 'SOM-8. Ouvrez l’application pour l’accepter.');
      expect(localizeNotification(Strings.current, '3 deliveries assigned to you', 'SOM-1, SOM-2, SOM-3 — collect them at the warehouse.'),
          ('3 livraisons pour vous', 'SOM-1, SOM-2, SOM-3 — à récupérer à l’entrepôt.'));
      expect(localizeNotification(Strings.current, 'New delivery assigned to you', 'SOM-9 is now in your deliveries.'),
          ('Nouvelle livraison pour vous', 'SOM-9 est maintenant dans vos livraisons.'));
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
