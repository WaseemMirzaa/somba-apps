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
import 'package:somba_rider/screens/parcel_checklist.dart';
import 'package:somba_rider/screens/parcel_scan_screen.dart';
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


  group('contents of a leg', () {
    test('an order line reads its options; French when asked; an older payload has none', () {
      final t = DeliveryTaskDto.fromJson(legJson('delivery', id: 'c', orderItems: [
        {'productName': 'Running shoes', 'productNameFr': 'Chaussures de course', 'variant': 'Size 42 / Black', 'variantFr': 'Pointure 42 / Noir', 'qty': 2},
        {'productName': 'Earphones', 'variant': 'Blue', 'qty': 1}, // no French twin: the stored one stands in
        {'productName': 'Phone case', 'qty': 3}, // no options
      ]));
      expect(t.items.map((i) => i.text('en')), ['2× Running shoes (Size 42 / Black)', '1× Earphones (Blue)', '3× Phone case']);
      expect(t.items.map((i) => i.text('fr')), ['2× Chaussures de course (Pointure 42 / Noir)', '1× Earphones (Blue)', '3× Phone case']);
      // The legacy shape: no `variant` key at all.
      expect(leg('delivery').items.map((i) => i.text('en')), ['1× Chaussures de course Air Comfort Pro'.replaceFirst('1×', '2×'), '1× Écouteurs sans fil']);
    });

    test('a leg reads the box set contents and orders; a leg without them has empty lists (an older server)', () {
      final t = DeliveryTaskDto.fromJson(siblingLegJson('delivery', id: 's1', orderId: 'o-a', reference: 'SOM-1042'));
      expect(t.parcelContents.map((c) => c.text('en')), [
        '2× Running shoes Air Comfort Pro (Size 42 / Black)',
        '1× Wireless earphones',
        '3× Phone case (Blue)',
      ]);
      expect(t.parcelContents.map((c) => c.text('fr')), [
        '2× Chaussures de course Air Comfort Pro (Pointure 42 / Noir)',
        '1× Écouteurs sans fil',
        '3× Coque de téléphone (Bleu)',
      ]);
      expect(t.parcelContents.map((c) => c.orderReference), ['SOM-1042', 'SOM-1042', 'SOM-1043']);
      expect(t.parcelOrders.map((o) => (o.orderId, o.reference)), [('o-a', 'SOM-1042'), ('o-b', 'SOM-1043')]);
      expect(t.parcels.every((p) => p.groupId == 'g1'), isTrue);
      final old = leg('delivery');
      expect(old.parcelContents, isEmpty);
      expect(old.parcelOrders, isEmpty);
    });

    test('a push (no order snapshot) keeps the contents the list knew when it carries none', () {
      final old = DeliveryTaskDto.fromJson(siblingLegJson('delivery', id: 's1', orderId: 'o-a', reference: 'SOM-1042'));
      final push = DeliveryTaskDto.fromJson({...legJson('delivery', id: 's1', withOrder: false), 'orderId': 'o-a'});
      expect(push.withOrderFrom(old).parcelContents, hasLength(3));
      expect(push.withOrderFrom(old).parcelOrders, hasLength(2));
    });

    testWidgets('a lone leg with boxes lists what is in them, with options, in the rider\'s language', (t) async {
      await show(t, [
        {..._task('pickup', 'assigned'), 'parcelContents': setContents, 'parcelOrders': [{'orderId': 'o-a', 'reference': 'SOM-1042'}]}
      ]);
      expect(find.text('In the parcels'), findsOneWidget);
      expect(find.textContaining('2× Running shoes Air Comfort Pro (Size 42 / Black)', findRichText: true), findsOneWidget);
      expect(find.textContaining('3× Phone case (Blue)', findRichText: true), findsOneWidget);
      expect(find.byKey(const ValueKey('t1-contents-line-0')), findsOneWidget);
    });

    testWidgets('in French the contents use the French name and options', (t) async {
      await show(t, [
        {..._task('pickup', 'assigned'), 'parcelContents': setContents}
      ], lang: 'fr');
      expect(find.text('Dans les colis'), findsOneWidget);
      expect(find.textContaining('2× Chaussures de course Air Comfort Pro (Pointure 42 / Noir)', findRichText: true), findsOneWidget);
    });

    testWidgets('a leg without box contents (an older server) still lists its own lines, with their options', (t) async {
      await show(t, [
        {
          ..._task('pickup', 'assigned', parcels: []),
          'order': {
            ...legJson('pickup', id: 't1')['order'] as Map<String, dynamic>,
            'items': [
              {'productName': 'Running shoes', 'variant': 'Size 42 / Black', 'qty': 2}
            ],
          },
        }
      ]);
      expect(find.textContaining('2× Running shoes (Size 42 / Black)'), findsOneWidget);
      expect(find.text('In the parcels'), findsNothing);
    });
  });

  group('sibling legs, one stop', () {
    List<Map<String, dynamic>> pair(String kind, String status, {Set<String> picked = const {}, Set<String> dropped = const {}}) => [
          siblingLegJson(kind, id: 's1', orderId: 'o-a', reference: 'SOM-1042', status: status, picked: picked, dropped: dropped),
          siblingLegJson(kind, id: 's2', orderId: 'o-b', reference: 'SOM-1043', status: status, picked: picked, dropped: dropped),
        ];

    List<DeliveryTaskDto> dtos(List<Map<String, dynamic>> rows) => rows.map(DeliveryTaskDto.fromJson).toList();

    test('legs with the same box set, kind and status are one stop, whatever the order of their orders', () {
      final rows = dtos(pair('delivery', 'in_transit'));
      rows[1].parcelOrders = rows[1].parcelOrders.reversed.toList();
      final stops = groupStops(rows);
      expect(stops, hasLength(1));
      expect(stops.single.legs.map((l) => l.id), ['s1', 's2']);
      expect(stops.single.references, ['SOM-1042', 'SOM-1043']);
      expect(stops.single.isGroup, isTrue);
    });

    test('a different status or kind, a set of one order, a finished leg and a legacy leg stand alone', () {
      final a = DeliveryTaskDto.fromJson(siblingLegJson('delivery', id: 's1', orderId: 'o-a', reference: 'SOM-1042', status: 'in_transit'));
      final b = DeliveryTaskDto.fromJson(siblingLegJson('delivery', id: 's2', orderId: 'o-b', reference: 'SOM-1043', status: 'assigned'));
      final pickup = DeliveryTaskDto.fromJson(siblingLegJson('pickup', id: 'p1', orderId: 'o-a', reference: 'SOM-1042', status: 'in_transit'));
      final done1 = DeliveryTaskDto.fromJson(siblingLegJson('delivery', id: 'd1', orderId: 'o-a', reference: 'SOM-1042', status: 'delivered'));
      final done2 = DeliveryTaskDto.fromJson(siblingLegJson('delivery', id: 'd2', orderId: 'o-b', reference: 'SOM-1043', status: 'delivered'));
      final lone = DeliveryTaskDto.fromJson({...siblingLegJson('delivery', id: 'l1', orderId: 'o-c', reference: 'SOM-1050', status: 'in_transit'), 'parcelOrders': [{'orderId': 'o-c', 'reference': 'SOM-1050'}]});
      final legacy = leg('delivery', id: 'old', status: 'in_transit');
      final stops = groupStops([a, b, pickup, done1, done2, lone, legacy]);
      expect(stops.map((s) => s.legs.map((l) => l.id).toList()), [['s1'], ['s2'], ['p1'], ['d1'], ['d2'], ['l1'], ['old']]);
      expect(stops.every((s) => !s.isGroup), isTrue);
    });

    test('a box both legs hold counts once, and is scanned only when every leg has it', () {
      final rows = dtos([
        siblingLegJson('delivery', id: 's1', orderId: 'o-a', reference: 'SOM-1042', status: 'in_transit', picked: {'PKG-7KQ2M9XA', 'PKG-4HT8W3NB'}, dropped: {'PKG-7KQ2M9XA'}),
        siblingLegJson('delivery', id: 's2', orderId: 'o-b', reference: 'SOM-1043', status: 'in_transit', picked: {'PKG-7KQ2M9XA', 'PKG-4HT8W3NB'}),
      ]);
      final stop = groupStops(rows).single;
      expect(stop.parcels.map((p) => p.code), ['PKG-7KQ2M9XA', 'PKG-4HT8W3NB']);
      expect(scanCount(stop.parcels, ParcelStage.pickup), (scanned: 2, total: 2));
      expect(scanCount(stop.parcels, ParcelStage.dropoff), (scanned: 0, total: 2), reason: 'only one of the two legs has it');
      expect(stop.scanBlocks(ParcelStage.dropoff), isTrue);
    });

    testWidgets('the list shows ONE card for the two orders: both references, the combined contents, the boxes counted once', (t) async {
      await show(t, pair('delivery', 'in_transit', picked: {'PKG-7KQ2M9XA', 'PKG-4HT8W3NB'}));
      expect(find.byKey(const ValueKey('task-s1')), findsOneWidget);
      expect(find.byKey(const ValueKey('task-s2')), findsNothing);
      expect(find.text('SOM-1042 · SOM-1043'), findsOneWidget);
      expect(find.text('2 orders'), findsOneWidget);
      expect(find.text('Same address: SOM-1042, SOM-1043'), findsOneWidget);
      expect(find.text('Active · 1'), findsOneWidget);
      // The whole box set, each line with its order.
      expect(find.textContaining('2× Running shoes Air Comfort Pro (Size 42 / Black) · SOM-1042', findRichText: true), findsOneWidget);
      expect(find.textContaining('3× Phone case (Blue) · SOM-1043', findRichText: true), findsOneWidget);
      // Two boxes, not four; both legs' scans are one count.
      expect(find.text('0 of 2 scanned'), findsOneWidget);
      expect(find.text('Scan parcels (0 of 2)'), findsOneWidget);
      expect(find.byKey(const ValueKey('scan-parcels-s1')), findsOneWidget);
      expect(find.byKey(const ValueKey('scan-parcels-s2')), findsNothing);
      expectButtonRules(t);
    });

    testWidgets('in French', (t) async {
      await show(t, pair('delivery', 'in_transit', picked: {'PKG-7KQ2M9XA', 'PKG-4HT8W3NB'}), lang: 'fr');
      expect(find.text('2 commandes'), findsOneWidget);
      expect(find.text('Même adresse : SOM-1042, SOM-1043'), findsOneWidget);
      expect(find.textContaining('3× Coque de téléphone (Bleu) · SOM-1043', findRichText: true), findsOneWidget);
      expect(find.text('0 sur 2 scanné'), findsOneWidget);
    });

    testWidgets('legacy single-order legs are untouched: one card each', (t) async {
      await show(t, [_task('pickup', 'assigned', id: 'a'), _task('pickup', 'assigned', id: 'b')]);
      expect(find.byKey(const ValueKey('task-a')), findsOneWidget);
      expect(find.byKey(const ValueKey('task-b')), findsOneWidget);
      expect(find.text('2 orders'), findsNothing);
    });

    // The fake server of a two-order box set: a scan is recorded for both legs and answered as one line per box.
    late Set<String> pk, dr;
    late List<Map<String, dynamic>> updates;
    Object? Function(Map<String, dynamic> body)? refuse;
    Object? resolveAnswer;
    late List<String> resolved;

    Map<String, dynamic> scanAnswer(Map<String, dynamic> body) {
      final stage = body['stage'] as String;
      final set = stage == 'pickup' ? pk : dr;
      final code = body['code'] as String;
      final already = !set.add(code);
      return {
        'parcels': setBoxes(picked: pk, dropped: dr),
        'pickupComplete': pk.length == 2,
        'dropoffComplete': dr.length == 2,
        'taskId': body['taskId'],
        'stage': stage,
        'code': code,
        'scanned': set.length,
        'total': 2,
        'already': already,
        'required': true,
        'contents': setContents,
        'orders': [
          {'orderId': 'o-a', 'reference': 'SOM-1042'},
          {'orderId': 'o-b', 'reference': 'SOM-1043'}
        ],
      };
    }

    Future<FakeParcelScanner> showSet(WidgetTester t, String kind, String status, {Set<String> picked = const {}, Set<String> dropped = const {}, String lang = 'en', bool code = false}) async {
      pk = {...picked};
      dr = {...dropped};
      updates = [];
      resolved = [];
      refuse = null;
      resolveAnswer = null;
      RiderStore.instance.requireDeliveryCode = code;
      final scanner = await show(t, pair(kind, status, picked: picked, dropped: dropped), lang: lang);
      final base = RiderStore.instance.transport!;
      RiderStore.instance.transport = (event, body) async {
        switch (event) {
          case 'rider:scanParcel':
            sent.add(body!);
            return scanAnswer(body);
          case 'rider:legParcels':
            return {'parcels': setBoxes(picked: pk, dropped: dr), 'pickupComplete': pk.length == 2, 'dropoffComplete': dr.length == 2, 'required': true, 'contents': setContents};
          case 'parcels:resolve':
            resolved.add(body!['code'] as String);
            final a = resolveAnswer;
            if (a is Exception) throw a;
            return a ?? {'code': body['code']};
          case 'delivery:updateStatus':
            updates.add(body!);
            final err = refuse?.call(body);
            if (err != null) throw err;
            return {'ok': true};
        }
        return base(event, body);
      };
      return scanner;
    }

    testWidgets('one scan on the stop ticks the box on BOTH legs and counts it once; the stop then moves as one', (t) async {
      final scanner = await showSet(t, 'pickup', 'assigned');
      expect(enabled(t, 'next-s1'), isFalse);
      await t.tap(find.byKey(const ValueKey('scan-parcels-s1')));
      await settle(t);
      scanner.emit('PKG-7KQ2M9XA');
      await settle(t);
      // One request, for the first leg; both legs now show the box as scanned and the answer counts it once.
      expect(sent.map((b) => b['taskId']), ['s1']);
      expect(find.text('PKG-7KQ2M9XA scanned (1 of 2).'), findsWidgets);
      expect(find.text('1 of 2 scanned'), findsWidgets);
      final tasks = RiderStore.instance.myTasks;
      expect(tasks.map((x) => x.parcels.where((p) => p.pickupScannedAt != null).length), [1, 1]);
      scanner.emit('PKG-4HT8W3NB');
      await settle(t);
      expect(tasks.map((x) => x.pickupComplete), [true, true]);
      expect(find.text('All parcels scanned. You can continue.'), findsWidgets);
      await t.tap(find.byKey(const ValueKey('parcel-finish')));
      await settle(t);
      expect(enabled(t, 'next-s1'), isTrue);
      // "Picked up" moves BOTH legs; the outcome says how many orders.
      await t.tap(find.byKey(const ValueKey('next-s1')));
      await settle(t);
      await t.pump(const Duration(milliseconds: 400));
      expect(updates.map((u) => (u['taskId'], u['status'])), [('s1', 'picked_up'), ('s2', 'picked_up')]);
      expect(find.text('${Strings.current.donePickedUp} (2 orders)'), findsOneWidget);
    });

    testWidgets('the scanner of a stop names both orders and lists the whole box set', (t) async {
      final scanner = await showSet(t, 'pickup', 'assigned');
      await t.tap(find.byKey(const ValueKey('scan-parcels-s1')));
      await settle(t);
      expect(find.descendant(of: find.byType(AppBar), matching: find.text('SOM-1042 · SOM-1043')), findsOneWidget);
      final onScanner = find.byType(ParcelScanScreen);
      expect(find.descendant(of: onScanner, matching: find.byType(ParcelContentsList)), findsOneWidget);
      expect(find.descendant(of: onScanner, matching: find.textContaining('3× Phone case (Blue) · SOM-1043', findRichText: true)), findsOneWidget);
      scanner.emit('PKG-7KQ2M9XA');
      await settle(t);
    });

    testWidgets('one handover code is asked ONCE and sent with each leg', (t) async {
      await showSet(t, 'delivery', 'in_transit', picked: {'PKG-7KQ2M9XA', 'PKG-4HT8W3NB'}, dropped: {'PKG-7KQ2M9XA', 'PKG-4HT8W3NB'}, code: true);
      expect(find.byKey(const ValueKey('code-hint-s1')), findsOneWidget);
      expect(find.textContaining('One delivery code for all 2 orders.'), findsOneWidget);
      await t.tap(find.byKey(const ValueKey('next-s1')));
      await settle(t);
      // The proof sheet comes once for the stop; with nothing captured "Continue" just closes it.
      expect(find.byKey(const ValueKey('proof-continue')), findsOneWidget);
      await t.tap(find.byKey(const ValueKey('proof-continue')));
      await settle(t);
      expect(find.byKey(const ValueKey('delivery-code-field')), findsOneWidget);
      expect(find.byKey(const ValueKey('delivery-code-shared')), findsOneWidget);
      await t.enterText(find.byKey(const ValueKey('delivery-code-field')), '4821');
      await t.tap(find.byKey(const ValueKey('delivery-code-submit')));
      await settle(t);
      await t.pump(const Duration(milliseconds: 400));
      expect(updates.map((u) => (u['taskId'], u['status'], u['code'])), [('s1', 'delivered', '4821'), ('s2', 'delivered', '4821')]);
      expect(find.byKey(const ValueKey('delivery-code-field')), findsNothing);
      expect(find.text('${Strings.current.doneDelivered} (2 orders)'), findsOneWidget);
    });

    testWidgets('a wrong code keeps the dialog open and spends ONE attempt (the second leg is not tried); the right one then goes through', (t) async {
      await showSet(t, 'delivery', 'in_transit', picked: {'PKG-7KQ2M9XA', 'PKG-4HT8W3NB'}, dropped: {'PKG-7KQ2M9XA', 'PKG-4HT8W3NB'}, code: true);
      refuse = (b) => b['code'] == '1111' ? ApiException('Wrong delivery code. Ask the customer for the 4-digit code shown in their app.', 400) : null;
      await t.tap(find.byKey(const ValueKey('next-s1')));
      await settle(t);
      await t.tap(find.byKey(const ValueKey('proof-continue')));
      await settle(t);
      await t.enterText(find.byKey(const ValueKey('delivery-code-field')), '1111');
      await t.tap(find.byKey(const ValueKey('delivery-code-submit')));
      await settle(t);
      expect(updates.map((u) => u['taskId']), ['s1']);
      expect(find.byKey(const ValueKey('delivery-code-error')), findsOneWidget);
      await t.enterText(find.byKey(const ValueKey('delivery-code-field')), '4821');
      await t.tap(find.byKey(const ValueKey('delivery-code-submit')));
      await settle(t);
      await t.pump(const Duration(milliseconds: 400));
      expect(updates.map((u) => (u['taskId'], u['code'])), [('s1', '1111'), ('s1', '4821'), ('s2', '4821')]);
    });

    testWidgets('a leg the server refuses is named in the snackbar, with the others done (English)', (t) async {
      await showSet(t, 'pickup', 'assigned', picked: {'PKG-7KQ2M9XA', 'PKG-4HT8W3NB'});
      refuse = (b) => b['taskId'] == 's2' ? ApiException('This delivery was just updated. Refresh and try again.', 409) : null;
      await t.tap(find.byKey(const ValueKey('next-s1')));
      await settle(t);
      await t.pump(const Duration(milliseconds: 400));
      expect(updates.map((u) => u['taskId']), ['s1', 's2']);
      expect(find.text('Done for 1 of 2 orders. Not done: SOM-1043: This delivery was just updated. Refresh and try again.'), findsOneWidget);
    });

    testWidgets('and in French', (t) async {
      await showSet(t, 'pickup', 'assigned', picked: {'PKG-7KQ2M9XA', 'PKG-4HT8W3NB'}, lang: 'fr');
      refuse = (b) => b['taskId'] == 's2' ? ApiException('This delivery was just updated. Refresh and try again.', 409) : null;
      await t.tap(find.byKey(const ValueKey('next-s1')));
      await settle(t);
      await t.pump(const Duration(milliseconds: 400));
      expect(find.text('Fait pour 1 sur 2 commandes. Non fait : SOM-1043 : Cette livraison vient d’être mise à jour. Actualisez et réessayez.'), findsOneWidget);
    });

    testWidgets('the first leg refused (nothing changed): its refusal is shown and the second leg is not touched', (t) async {
      await showSet(t, 'pickup', 'assigned', picked: {'PKG-7KQ2M9XA', 'PKG-4HT8W3NB'});
      refuse = (b) => ApiException('This delivery is no longer available.', 400);
      await t.tap(find.byKey(const ValueKey('next-s1')));
      await settle(t);
      await t.pump(const Duration(milliseconds: 400));
      expect(updates.map((u) => u['taskId']), ['s1']);
      expect(find.text('This delivery is no longer available.'), findsOneWidget);
    });

    testWidgets('could-not-deliver on the stop fails every order with one reason', (t) async {
      await showSet(t, 'delivery', 'in_transit', picked: {'PKG-7KQ2M9XA', 'PKG-4HT8W3NB'}, dropped: {'PKG-7KQ2M9XA', 'PKG-4HT8W3NB'});
      await t.tap(find.byKey(const ValueKey('fail-s1')));
      await settle(t);
      await t.tap(find.byKey(const ValueKey('reason-unreachable')));
      await t.pump();
      await t.tap(find.byKey(const ValueKey('reason-submit')));
      await settle(t);
      await t.pump(const Duration(milliseconds: 400));
      expect(updates.map((u) => (u['taskId'], u['status'])), [('s1', 'failed'), ('s2', 'failed')]);
      expect(updates[0]['reason'], updates[1]['reason']);
    });

    Map<String, dynamic> resolveJson({bool priv = true, bool voided = false}) => {
          'code': 'PKG-7KQ2M9XA',
          'boxNo': 1,
          'boxCount': 2,
          'voided': voided,
          'storeName': 'Boutique Les Merveilles de Kinshasa',
          'destinationArea': 'Gombe',
          'destination': {'area': 'Gombe', 'address': priv ? '12, avenue du Commerce, Gombe' : null, 'phone': priv ? '+243812345678' : null, 'recipient': priv ? 'Aline Kabila Mwamba' : null},
          'contents': setContents,
          'orders': [
            {'orderId': 'o-a', 'reference': 'SOM-1042'},
            {'orderId': 'o-b', 'reference': 'SOM-1043'}
          ],
          'group': {'id': 'g1', 'orders': 2, 'locked': true, 'contentsRev': 1},
          'legs': [
            {'id': 's1', 'orderId': 'o-a', 'orderReference': 'SOM-1042', 'kind': 'delivery', 'status': 'in_transit'},
            {'id': 's2', 'orderId': 'o-b', 'orderReference': 'SOM-1043', 'kind': 'delivery', 'status': 'in_transit'},
          ],
        };

    Future<void> scanOne(WidgetTester t, FakeParcelScanner scanner) async {
      await t.tap(find.byKey(const ValueKey('scan-parcels-s1')));
      await settle(t);
      scanner.emit('PKG-7KQ2M9XA');
      await settle(t);
    }

    testWidgets('after a scan the box is resolved: contents, orders, legs, and the street, phone and recipient the server sent', (t) async {
      final scanner = await showSet(t, 'delivery', 'in_transit', picked: {'PKG-7KQ2M9XA', 'PKG-4HT8W3NB'});
      resolveAnswer = resolveJson();
      await scanOne(t, scanner);
      expect(resolved, ['PKG-7KQ2M9XA']);
      expect(find.byKey(const ValueKey('parcel-resolved-PKG-7KQ2M9XA')), findsOneWidget);
      expect(find.text('Box 1/2 · PKG-7KQ2M9XA'), findsOneWidget);
      expect(find.text('Store: Boutique Les Merveilles de Kinshasa'), findsOneWidget);
      expect(find.text('To: Gombe'), findsOneWidget);
      expect(find.text('Aline Kabila Mwamba'), findsOneWidget);
      expect(find.text('12, avenue du Commerce, Gombe'), findsOneWidget);
      expect(find.text('+243812345678'), findsOneWidget);
      expect(find.text('SOM-1042 · SOM-1043'), findsWidgets);
      expect(find.byKey(const ValueKey('resolved-contents-line-2')), findsOneWidget);
      expect(find.text('SOM-1043 · Delivery · In transit'), findsOneWidget);
    });

    testWidgets('no street, phone or recipient from the server (a pickup, a box that is not yours): none is drawn', (t) async {
      final scanner = await showSet(t, 'pickup', 'assigned');
      resolveAnswer = resolveJson(priv: false);
      await scanOne(t, scanner);
      expect(find.byKey(const ValueKey('parcel-resolved-PKG-7KQ2M9XA')), findsOneWidget);
      expect(find.byKey(const ValueKey('parcel-resolved-area')), findsOneWidget);
      expect(find.byKey(const ValueKey('parcel-resolved-address')), findsNothing);
      expect(find.byKey(const ValueKey('parcel-resolved-phone')), findsNothing);
      expect(find.byKey(const ValueKey('parcel-resolved-recipient')), findsNothing);
      expect(find.textContaining('avenue du Commerce'), findsNothing);
    });

    testWidgets('a cancelled label says so', (t) async {
      final scanner = await showSet(t, 'pickup', 'assigned');
      resolveAnswer = resolveJson(voided: true);
      await scanOne(t, scanner);
      expect(find.text('This label was cancelled. Use the new one.'), findsOneWidget);
    });

    for (final (lang, scanMsg, notFound) in [
      ('en', 'PKG-7KQ2M9XA is not part of this pickup.', 'Parcel not found.'),
      ('fr', 'PKG-7KQ2M9XA ne fait pas partie de cette collecte.', 'Colis introuvable.'),
    ]) {
      testWidgets('a box the server does not know: "Parcel not found." ($lang)', (t) async {
        final scanner = await showSet(t, 'pickup', 'assigned', lang: lang);
        resolveAnswer = ApiException('Parcel not found.', 404);
        RiderStore.instance.transport = (event, body) async {
          if (event == 'rider:scanParcel') throw ApiException('PKG-7KQ2M9XA is not part of this pickup.', 400);
          if (event == 'parcels:resolve') throw ApiException('Parcel not found.', 404);
          return [];
        };
        await scanOne(t, scanner);
        expect(find.text(scanMsg), findsWidgets);
        expect(find.byKey(const ValueKey('parcel-resolve-error')), findsOneWidget);
        expect(find.text(notFound), findsOneWidget);
      });
    }

    testWidgets('a lookup that fails for another reason stays quiet: the scan\'s own answer already said what happened', (t) async {
      final scanner = await showSet(t, 'pickup', 'assigned');
      resolveAnswer = ApiException('Socket not connected.', 0);
      await scanOne(t, scanner);
      expect(find.text('PKG-7KQ2M9XA scanned (1 of 2).'), findsWidgets);
      expect(find.byKey(const ValueKey('parcel-resolved-PKG-7KQ2M9XA')), findsNothing);
    });

    test('a resolve answer with only a code is still read (older or narrower answers)', () {
      final r = ParcelResolution.fromJson({'code': 'PKG-7KQ2M9XA'});
      expect(r.contents, isEmpty);
      expect(r.orders, isEmpty);
      expect(r.legs, isEmpty);
      expect((r.destination.hasPrivate, r.voided), (false, false));
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
        // docs/contracts/logistics.md section 19 (same-day parcel groups)
        'Parcel not found.': 'Colis introuvable.',
        'Choose at least one order to pack.': 'Choisissez au moins une commande à préparer.',
        'Pack at most 30 orders at once.': 'Préparez au plus 30 commandes à la fois.',
        'These orders cannot share a label: they differ in customer, day, delivery address or delivery mode.':
            'Ces commandes ne peuvent pas partager une étiquette : le client, le jour, l’adresse de livraison ou le mode de livraison diffèrent.',
        'A rider already collected these boxes. The orders in them cannot change; pack the other orders in a new set.':
            'Un livreur a déjà récupéré ces boîtes. Les commandes qu’elles contiennent ne peuvent plus changer ; préparez les autres commandes dans un nouvel ensemble.',
        'SOM-1042: A rider already collected these boxes. The orders in them cannot change; pack the other orders in a new set.':
            'SOM-1042 : un livreur a déjà récupéré ces boîtes. Les commandes qu’elles contiennent ne peuvent plus changer ; préparez les autres commandes dans un nouvel ensemble.',
        'Orders with several sellers keep their own labels: they cannot be packed together.':
            'Les commandes de plusieurs vendeurs gardent leurs propres étiquettes : elles ne peuvent pas être préparées ensemble.',
        'A label set needs at least one order.': 'Un ensemble d’étiquettes doit contenir au moins une commande.',
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
      expect(s.stopOrdersPill(2), '2 commandes');
      expect(s.stopOneCode(2), 'Un seul code de livraison pour les 2 commandes.');
      expect(s.parcelContentsTitle, 'Dans les colis');
    });
  });
}
