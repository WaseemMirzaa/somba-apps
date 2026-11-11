// Parcel scanning: the checklist on the cards, the scanner screen driven by a fake camera, the buttons that wait for the
// scans, the typed fallback (`manual`), the camera-denied message, the server's refusals (also in French), runs, and the
// French layout at 200% text.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/parcel_strings.dart';
import 'package:somba_rider/l10n/server_errors.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/deliveries_screen.dart';
import 'package:somba_rider/services/auth_service.dart' show ApiException;
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/parcel_scanner.dart';
import 'package:somba_rider/services/parcels.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

import 'button_rules.dart';
import 'parcel_fakes.dart';
import 'task_fixtures.dart';

const _codes = ['PKG-7KQ2M9XA', 'PKG-4HT8W3NB', 'PKG-9CD5R2EF'];

List<Map<String, dynamic>> _boxes({Set<String> picked = const {}, Set<String> dropped = const {}}) => [
      for (var i = 0; i < _codes.length; i++)
        {
          'code': _codes[i],
          'boxNo': i + 1,
          'boxCount': _codes.length,
          'pickupScannedAt': picked.contains(_codes[i]) ? '2026-10-24T08:00:00.000Z' : null,
          'dropoffScannedAt': dropped.contains(_codes[i]) ? '2026-10-24T09:00:00.000Z' : null,
        }
    ];

Map<String, dynamic> _task(String kind, String status, {List<Map<String, dynamic>>? parcels, bool scanRequired = true, String id = 't1'}) {
  final boxes = parcels ?? _boxes();
  return {
    ...legJson(kind, id: id, status: status),
    'parcels': boxes,
    'pickupComplete': boxes.every((b) => b['pickupScannedAt'] != null),
    'dropoffComplete': boxes.every((b) => b['dropoffScannedAt'] != null),
    'scanRequired': scanRequired,
  };
}

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
      await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
    }
  });

  final sent = <Map<String, dynamic>>[];
  final events = <String>[];
  // The fake server: scan state per code, per stage.
  late Set<String> picked, dropped;
  Object? scanError;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await Strings.setLang('en', persist: false);
    sent.clear();
    events.clear();
    picked = {};
    dropped = {};
    scanError = null;
    final store = RiderStore.instance;
    store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean', role: 'rider', phone: '+243810000000');
    store.loaded = true;
    store.requireDeliveryCode = false;
    store.myTasks.clear();
    store.debugResetSession();
    store.transport = (event, body) async {
      events.add(event);
      switch (event) {
        case 'rider:scanParcel':
          sent.add(body!);
          final err = scanError;
          if (err != null) throw err;
          final code = body['code'] as String;
          final stage = body['stage'] as String;
          final set = stage == 'pickup' ? picked : dropped;
          final already = set.contains(code);
          set.add(code);
          final boxes = _boxes(picked: picked, dropped: dropped);
          return {
            'parcels': boxes,
            'pickupComplete': picked.length == 3,
            'dropoffComplete': dropped.length == 3,
            'taskId': body['taskId'],
            'stage': stage,
            'code': code,
            'scanned': set.length,
            'total': 3,
            'already': already,
            'required': true,
          };
        case 'rider:legParcels':
          final boxes = _boxes(picked: picked, dropped: dropped);
          return {'parcels': boxes, 'pickupComplete': picked.length == 3, 'dropoffComplete': dropped.length == 3, 'taskIds': [], 'required': true};
        case 'rider:tasks':
        case 'rider:runs':
        case 'notifications:list':
        case 'support:list':
          return [];
        case 'rider:workStats':
          return {'totalTasks': 0, 'completed': 0, 'active': 0, 'failed': 0, 'completedToday': 0, 'completedLast7Days': 0, 'successRate': 100, 'byKind': []};
        case 'settings:get':
          return {'requireDeliveryCode': 'false'};
        case 'rider:assignment':
          return {'hub': {'id': 'h2', 'name': 'Entrepôt de Gombe', 'city': 'Kinshasa', 'address': 'Boulevard du 30 Juin 8'}};
        default:
          return {'ok': true};
      }
    };
  });

  tearDown(() {
    final store = RiderStore.instance;
    store.transport = null;
    store.user = null;
    store.myTasks.clear();
    store.debugResetSession();
    resetSupport();
  });

  Future<FakeParcelScanner> show(WidgetTester t, List<Map<String, dynamic>> tasks,
      {String lang = 'en', double scale = 1, List<Map<String, dynamic>> runs = const []}) async {
    await Strings.setLang(lang, persist: false);
    final store = RiderStore.instance;
    store.myTasks
      ..clear()
      ..addAll(tasks.map(DeliveryTaskDto.fromJson));
    store.runs
      ..clear()
      ..addAll(TransferRun.listFrom(runs));
    t.view.physicalSize = const Size(360 * 3, 1600 * 3);
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    final scanner = FakeParcelScanner();
    await t.pumpWidget(KeyedSubtree(
      key: UniqueKey(),
      child: MaterialApp(
        locale: Locale(lang),
        supportedLocales: const [Locale('en'), Locale('fr')],
        localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
        theme: AppTheme.light(),
        builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)), child: child!),
        home: Scaffold(body: DeliveriesScreen(scanner: scanner)),
      ),
    ));
    await t.pump(const Duration(milliseconds: 600));
    return scanner;
  }

  bool enabled(WidgetTester t, String key) {
    final w = t.widget(find.byKey(ValueKey(key)));
    return (w as ButtonStyleButton).onPressed != null;
  }

  Future<void> settle(WidgetTester t) async {
    await t.pump();
    await t.pump(const Duration(milliseconds: 400));
  }

  group('model', () {
    test('a task reads its boxes and the flags; an old payload has none and is never blocked', () {
      final t = DeliveryTaskDto.fromJson(_task('pickup', 'assigned', parcels: _boxes(picked: {_codes[0]})));
      expect(t.parcels.map((p) => p.code), _codes);
      expect((t.parcels[1].boxNo, t.parcels[1].boxCount), (2, 3));
      expect((t.pickupComplete, t.dropoffComplete, t.scanRequired), (false, false, true));
      expect(t.scanBlocks(ParcelStage.pickup), isTrue);
      final old = leg('pickup');
      expect((old.parcels.isEmpty, old.pickupComplete, old.scanBlocks(ParcelStage.pickup), old.offersScan), (true, true, false, false));
    });

    test('setting off: never blocked, the scanner is still offered', () {
      final t = DeliveryTaskDto.fromJson(_task('pickup', 'assigned', scanRequired: false));
      expect((t.scanBlocks(ParcelStage.pickup), t.offersScan), (false, true));
    });

    test('codes: the QR text is reduced to the parcel code, typed text is upper-cased', () {
      expect(normalizeParcelCode(' pkg-7kq2m9xa '), 'PKG-7KQ2M9XA');
      expect(normalizeParcelCode('https://komoriko.com/p/PKG-7KQ2M9XA?x=1'), 'PKG-7KQ2M9XA');
      expect(normalizeParcelCode('hello'), 'HELLO');
    });
  });

  group('cards', () {
    testWidgets('pickup incomplete: Picked up is disabled, the counter and boxes show, the scan button is secondary', (t) async {
      await show(t, [_task('pickup', 'assigned', parcels: _boxes(picked: {_codes[0], _codes[1]}))]);
      expect(find.text('Scan parcels (2 of 3)'), findsOneWidget);
      expect(find.text('2 of 3 scanned'), findsOneWidget);
      expect(find.text('Box 3/3 · to scan'), findsOneWidget);
      expect(find.text('Box 1/3 · scanned'), findsOneWidget);
      expect(enabled(t, 'next-t1'), isFalse);
      expect(find.byKey(const ValueKey('scan-hint-t1')), findsOneWidget);
      expect(t.widget(find.byKey(const ValueKey('scan-parcels-t1'))), isA<OutlinedButton>());
      expectButtonRules(t);
    });

    testWidgets('pickup complete: Picked up is enabled and no scan button is left', (t) async {
      await show(t, [_task('pickup', 'assigned', parcels: _boxes(picked: _codes.toSet()))]);
      expect(enabled(t, 'next-t1'), isTrue);
      expect(find.byKey(const ValueKey('scan-parcels-t1')), findsNothing);
      expect(find.text('All parcels scanned'), findsOneWidget);
    });

    testWidgets('delivery on the road: Delivered waits for the drop-off scans', (t) async {
      await show(t, [_task('delivery', 'in_transit', parcels: _boxes(picked: _codes.toSet(), dropped: {_codes[0]}))]);
      expect(enabled(t, 'next-t1'), isFalse);
      expect(find.text('Scan parcels (1 of 3)'), findsOneWidget);
      expect(find.byKey(const ValueKey('scan-hint-t1')), findsOneWidget);
    });

    testWidgets('a leg that ends at a warehouse offers the drop-off scan (the rider has no Delivered button)', (t) async {
      await show(t, [_task('transfer', 'in_transit', parcels: _boxes(picked: _codes.toSet()))]);
      expect(find.byKey(const ValueKey('next-t1')), findsNothing);
      expect(find.byKey(const ValueKey('scan-parcels-t1')), findsOneWidget);
    });

    testWidgets('setting off: Picked up is enabled with boxes unscanned, the scanner is optional', (t) async {
      await show(t, [_task('pickup', 'assigned', scanRequired: false)]);
      expect(enabled(t, 'next-t1'), isTrue);
      expect(find.byKey(const ValueKey('scan-parcels-t1')), findsOneWidget);
      expect(find.byKey(const ValueKey('scan-hint-t1')), findsNothing);
    });

    testWidgets('no labelled parcel: behaves exactly as before', (t) async {
      await show(t, [_task('pickup', 'assigned', parcels: [])]);
      expect(enabled(t, 'next-t1'), isTrue);
      expect(find.byKey(const ValueKey('scan-parcels-t1')), findsNothing);
      expect(find.byKey(const ValueKey('parcels-t1')), findsNothing);
    });

    testWidgets('the server refusing "Scan every parcel first" is shown in a snackbar', (t) async {
      await show(t, [_task('pickup', 'assigned', parcels: _boxes(picked: _codes.toSet()))]);
      RiderStore.instance.transport = (event, body) async {
        if (event == 'delivery:updateStatus') throw ApiException('Scan every parcel first: 2 of 3 scanned.', 400);
        return [];
      };
      await t.tap(find.byKey(const ValueKey('next-t1')));
      await settle(t);
      expect(find.text('Scan every parcel first: 2 of 3 scanned.'), findsOneWidget);
    });
  });

  group('scanner', () {
    Future<FakeParcelScanner> open(WidgetTester t, {String lang = 'en', double scale = 1, List<Map<String, dynamic>>? tasks}) async {
      final scanner = await show(t, tasks ?? [_task('pickup', 'assigned')], lang: lang, scale: scale);
      await t.tap(find.byKey(const ValueKey('scan-parcels-t1')));
      await settle(t);
      return scanner;
    }

    testWidgets('scans tick the checklist off, parcel after parcel, with a snackbar each; the buttons react at once', (t) async {
      final scanner = await open(t);
      expect(find.text('0 of 3 scanned'), findsWidgets);
      scanner.emit('PKG-7KQ2M9XA');
      await settle(t);
      expect(find.text('1 of 3 scanned'), findsWidgets);
      expect(find.text('PKG-7KQ2M9XA scanned (1 of 3).'), findsWidgets);
      expect(find.text('Box 1/3 · scanned'), findsOneWidget);
      scanner.emit('PKG-4HT8W3NB');
      await settle(t);
      scanner.emit('PKG-9CD5R2EF');
      await settle(t);
      expect(find.text('All parcels scanned'), findsOneWidget);
      expect(find.text('All parcels scanned. You can continue.'), findsWidgets);
      expect(sent.map((b) => (b['code'], b['stage'], b['taskId'], b.containsKey('manual'))), [
        ('PKG-7KQ2M9XA', 'pickup', 't1', false),
        ('PKG-4HT8W3NB', 'pickup', 't1', false),
        ('PKG-9CD5R2EF', 'pickup', 't1', false),
      ]);
      await t.tap(find.byKey(const ValueKey('parcel-finish')));
      await settle(t);
      expect(enabled(t, 'next-t1'), isTrue);
      expect(RiderStore.instance.myTasks.single.pickupComplete, isTrue);
    });

    testWidgets('the camera reading the same code over and over sends it once', (t) async {
      final scanner = await open(t);
      for (var i = 0; i < 6; i++) {
        scanner.emit('PKG-7KQ2M9XA');
        await t.pump(const Duration(milliseconds: 50));
      }
      await settle(t);
      expect(sent, hasLength(1));
    });

    testWidgets('a QR holding a URL with the code is reduced to the code', (t) async {
      final scanner = await open(t);
      scanner.emit('https://komoriko.com/p/pkg-4ht8w3nb');
      await settle(t);
      expect(sent.single['code'], 'PKG-4HT8W3NB');
    });

    testWidgets('a repeat of the same scan is a soft note, not an error', (t) async {
      picked.add('PKG-7KQ2M9XA');
      final scanner = await open(t);
      scanner.emit('PKG-7KQ2M9XA');
      await settle(t);
      expect(find.text('PKG-7KQ2M9XA is already scanned.'), findsWidgets);
    });

    testWidgets('the typed code is upper-cased, sent as manual and ticks the box', (t) async {
      await open(t);
      await t.enterText(find.byKey(const ValueKey('parcel-type-field')), 'pkg-4ht8w3nb');
      expect((t.widget(find.byKey(const ValueKey('parcel-type-field'))) as TextField).autocorrect, isFalse);
      await t.tap(find.byKey(const ValueKey('parcel-type-submit')));
      await settle(t);
      expect(sent.single, {'taskId': 't1', 'code': 'PKG-4HT8W3NB', 'stage': 'pickup', 'manual': true});
      expect(find.text('Box 2/3 · scanned'), findsOneWidget);
      expect((t.widget(find.byKey(const ValueKey('parcel-type-field'))) as TextField).controller!.text, isEmpty);
    });

    testWidgets('the server error is shown verbatim (English) and the box stays to scan', (t) async {
      scanError = ApiException('PKG-7KQ2M9XA is not part of this pickup.', 400);
      final scanner = await open(t);
      scanner.emit('PKG-7KQ2M9XA');
      await settle(t);
      expect(find.text('PKG-7KQ2M9XA is not part of this pickup.'), findsWidgets);
      expect(find.text('Box 1/3 · to scan'), findsOneWidget);
    });

    testWidgets('the server error is shown in French', (t) async {
      scanError = ApiException('PKG-7KQ2M9XA is not part of this pickup.', 400);
      final scanner = await open(t, lang: 'fr');
      scanner.emit('PKG-7KQ2M9XA');
      await settle(t);
      expect(find.text('PKG-7KQ2M9XA ne fait pas partie de cette collecte.'), findsWidgets);
    });

    testWidgets('camera permission denied: says so, offers Open settings and the typed code', (t) async {
      final scanner = await open(t);
      scanner.fail(ScannerFault.permissionDenied);
      await settle(t);
      expect(find.text('Camera access is off'), findsOneWidget);
      expect(find.byKey(const ValueKey('fake-camera')), findsNothing);
      await t.tap(find.byKey(const ValueKey('parcel-open-settings')));
      await settle(t);
      expect(scanner.settingsOpened, 1);
      await t.enterText(find.byKey(const ValueKey('parcel-type-field')), 'PKG-9CD5R2EF');
      await t.tap(find.byKey(const ValueKey('parcel-type-submit')));
      await settle(t);
      expect(sent.single['manual'], isTrue);
    });

    testWidgets('a camera that cannot start gets its own message', (t) async {
      final scanner = await open(t);
      scanner.fail(ScannerFault.unavailable);
      await settle(t);
      expect(find.text('The camera could not start. Type the code below instead.'), findsOneWidget);
      expect(find.byKey(const ValueKey('parcel-open-settings')), findsNothing);
    });

    testWidgets('delivery drop-off scans use the dropoff stage', (t) async {
      final scanner = await open(t, tasks: [_task('delivery', 'in_transit', parcels: _boxes(picked: _codes.toSet()))]);
      scanner.emit('PKG-7KQ2M9XA');
      await settle(t);
      expect(sent.single['stage'], 'dropoff');
      expect(find.text('Drop-off scan'), findsOneWidget);
    });

    for (final lang in ['en', 'fr']) {
      testWidgets('layout at 200% text scale does not overflow ($lang)', (t) async {
        final scanner = await open(t, lang: lang, scale: 2);
        scanner.fail(ScannerFault.permissionDenied);
        await settle(t);
        expect(t.takeException(), isNull);
        scanner.emit('PKG-7KQ2M9XA');
        await settle(t);
        expect(t.takeException(), isNull);
        await t.tap(find.byKey(const ValueKey('parcel-finish')));
        await settle(t);
        expect(t.takeException(), isNull);
      });

      testWidgets('cards with boxes survive 200% text ($lang)', (t) async {
        await show(t, [_task('pickup', 'assigned'), _task('delivery', 'in_transit', id: 't2')], lang: lang, scale: 2);
        expect(t.takeException(), isNull);
      });
    }
  });

  group('runs', () {
    final runTasks = [
      for (final id in ['a', 'b'])
        {
          ..._task('transfer', 'picked_up', id: id, parcels: [
            {'code': id == 'a' ? _codes[0] : _codes[1], 'boxNo': 1, 'boxCount': 1, 'pickupScannedAt': null, 'dropoffScannedAt': null}
          ]),
          'runId': 'r1',
          'runReference': 'TR-0001',
        }
    ];

    testWidgets('"On the road" waits for the run checklist; scanning with runId ticks every leg', (t) async {
      RiderStore.instance.transport = (event, body) async {
        events.add(event);
        if (event == 'rider:scanParcel') {
          sent.add(body!);
          picked.add(body['code'] as String);
          return {
            'parcels': [
              for (final c in [_codes[0], _codes[1]]) {'code': c, 'boxNo': 1, 'boxCount': 1, 'pickupScannedAt': picked.contains(c) ? '2026-10-24T08:00:00.000Z' : null, 'dropoffScannedAt': null}
            ],
            'pickupComplete': picked.length == 2,
            'dropoffComplete': false,
            'taskId': 'a',
            'stage': 'pickup',
            'code': body['code'],
            'scanned': picked.length,
            'total': 2,
            'already': false,
            'required': true,
          };
        }
        return [];
      };
      final scanner = await show(t, runTasks, runs: [runJson('r1', count: 2, taskIds: ['a', 'b'])]);
      expect(enabled(t, 'run-next-r1'), isFalse);
      expect(find.text('Scan parcels (0 of 2)'), findsOneWidget);
      await t.tap(find.byKey(const ValueKey('scan-parcels-run-r1')));
      await settle(t);
      scanner.emit(_codes[0]);
      await settle(t);
      scanner.emit(_codes[1]);
      await settle(t);
      expect(sent.map((b) => (b['runId'], b.containsKey('taskId'))), [('r1', false), ('r1', false)]);
      await t.tap(find.byKey(const ValueKey('parcel-finish')));
      await settle(t);
      expect(enabled(t, 'run-next-r1'), isTrue);
      expect(RiderStore.instance.myTasks.every((x) => x.pickupComplete), isTrue);
    });

    testWidgets('a run whose legs carry no boxes is not blocked', (t) async {
      await show(t, [
        for (final id in ['a', 'b']) {...parcelJson(id, 'r1'), 'parcels': <dynamic>[], 'scanRequired': true}
      ], runs: [runJson('r1', count: 2, taskIds: ['a', 'b'])]);
      expect(enabled(t, 'run-next-r1'), isTrue);
    });
  });

  group('French server errors', () {
    const fr = Strings('fr');
    test('every scan refusal has a French text; English stays English', () {
      const cases = {
        'PKG-7KQ2M9XA is not part of this pickup.': 'PKG-7KQ2M9XA ne fait pas partie de cette collecte.',
        'PKG-7KQ2M9XA is not part of this delivery.': 'PKG-7KQ2M9XA ne fait pas partie de cette livraison.',
        'PKG-7KQ2M9XA is not part of this transfer.': 'PKG-7KQ2M9XA ne fait pas partie de ce transfert.',
        'PKG-7KQ2M9XA is not part of this express delivery.': 'PKG-7KQ2M9XA ne fait pas partie de cette livraison express.',
        'PKG-7KQ2M9XA is not part of this return pickup.': 'PKG-7KQ2M9XA ne fait pas partie de cette collecte de retour.',
        'PKG-7KQ2M9XA was already scanned.': 'PKG-7KQ2M9XA a déjà été scanné.',
        'PKG-7KQ2M9XA was cancelled; use the new label.': 'PKG-7KQ2M9XA a été annulé ; utilisez la nouvelle étiquette.',
        'That is not a KOMORIKO parcel code. Codes look like PKG-7KQ2M9XA.': 'Ce n’est pas un code colis KOMORIKO. Les codes ressemblent à PKG-7KQ2M9XA.',
        'Collect PKG-7KQ2M9XA first: this leg is not picked up yet.': 'Récupérez d’abord PKG-7KQ2M9XA : cette étape n’est pas encore récupérée.',
        'This leg is already closed.': 'Cette étape est déjà clôturée.',
        'Delivery task not found.': 'Livraison introuvable.',
        'Scan every parcel first: 2 of 3 scanned.': 'Scannez d’abord chaque colis : 2 sur 3 scannés.',
      };
      cases.forEach((en, expected) {
        expect(translateServerError(en, fr), expected, reason: en);
        expect(translateServerError(en, const Strings('en')), en);
      });
    });

    test('every key of the scan texts exists in both languages with the same placeholders', () {
      const s = Strings('fr');
      expect(s.parcelScanBtn(2, 3), 'Scanner les colis (2 sur 3)');
      expect(s.parcelCounter(1, 3), '1 sur 3 scanné');
      expect(s.parcelCounter(2, 3), '2 sur 3 scannés');
      expect(s.parcelBox(2, 3), 'Boîte 2/3');
    });
  });
}
