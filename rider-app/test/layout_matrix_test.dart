// The rider screens at two phone widths (360 and 402 pt), in English and French, at text scale 1.0 and 1.3, with
// the app's real fonts. Fails on any overflow or layout error, a button label that wraps or is cut, a price cut
// short, or a button or text drawn over other text.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/deliveries_screen.dart';
import 'package:somba_rider/screens/parcel_scan_screen.dart';
import 'package:somba_rider/services/parcels.dart';
import 'parcel_fakes.dart';
import 'package:somba_rider/screens/delivery_proof_sheet.dart';
import 'package:somba_rider/services/auth_service.dart' show ApiException;
import 'package:somba_rider/screens/work_screen.dart';
import 'package:somba_rider/screens/more/rider_auth.dart';
import 'package:somba_rider/screens/profile_screen.dart';
import 'package:somba_rider/screens/support_screen.dart';
import 'package:somba_rider/screens/location_access_screen.dart';
import 'package:somba_rider/screens/task_route_screen.dart';
import 'package:somba_rider/services/location_reporter.dart';
import 'package:somba_rider/services/maps_config.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/route_line.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/services/support_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

import 'layout_checks.dart';
import 'proof_fakes.dart';
import 'task_fixtures.dart';

/// What a screen is shown with.
enum _Scenario { cards, single, empty, runs, stop, contents }

Future<void> _seed(String lang, {_Scenario scenario = _Scenario.cards}) async {
  SharedPreferences.setMockInitialValues({});
  await Strings.setLang(lang, persist: false);
  final store = RiderStore.instance;
  store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean-Pierre Mukendi', role: 'rider', phone: '+243810000000');
  store.loaded = true;
  store.requireDeliveryCode = true;
  MapsConfig.debugEnabledOverride = true; // the "Route map" button is on every active card
  store.stats = const WorkStatsDto(
    totalTasks: 128,
    completed: 117,
    active: 2,
    failed: 9,
    completedToday: 14,
    completedLast7Days: 86,
    successRate: 93,
    byKind: [
      WorkStatsKind(kind: 'delivery', count: 60),
      WorkStatsKind(kind: 'pickup', count: 31),
      WorkStatsKind(kind: 'transfer', count: 12),
      WorkStatsKind(kind: 'return_pickup', count: 5),
      WorkStatsKind(kind: 'return_transfer', count: 4),
      WorkStatsKind(kind: 'return_to_seller', count: 3),
      WorkStatsKind(kind: 'replacement_delivery', count: 2),
    ]);
  store.assignment = const RiderAssignment(
      hubId: 'h2', hubName: 'Entrepôt de Gombe', hubCity: 'Kinshasa', hubAddress: 'Boulevard du 30 Juin 8, près de la place de la Gare Centrale, Gombe');
  store.myTasks.clear();
  store.debugResetSession();
  switch (scenario) {
    case _Scenario.cards:
      store.myTasks.addAll([
        leg('pickup', id: 'a1'),
        leg('transfer', id: 'a2', status: 'picked_up'),
        leg('delivery', id: 'a3', status: 'in_transit'),
        leg('return_pickup', id: 'a4'),
        leg('return_transfer', id: 'a5', status: 'in_transit'),
        leg('return_to_seller', id: 'a6', status: 'picked_up'),
        leg('replacement_delivery', id: 'a7', status: 'in_transit'),
        leg('delivery', id: 'a8', attempts: 2),
        leg('delivery', id: 'd1', status: 'failed', failure: 'Client injoignable après trois appels'),
        leg('delivery', id: 'd2', status: 'delivered'),
        leg('pickup', id: 'd3', status: 'delivered'),
      ]);
    case _Scenario.single:
      store.myTasks.add(leg('delivery', id: 'a3', status: 'in_transit'));
    case _Scenario.empty:
      break;
    case _Scenario.stop:
      // Two orders of one box set met at one address, on the road with the customer's code to ask, and a set of two orders to collect.
      store.myTasks.addAll([
        DeliveryTaskDto.fromJson(siblingLegJson('delivery', id: 's1', orderId: 'o-a', reference: 'SOM-1042', status: 'in_transit', picked: {'PKG-7KQ2M9XA', 'PKG-4HT8W3NB'}, dropped: {'PKG-7KQ2M9XA'})),
        DeliveryTaskDto.fromJson(siblingLegJson('delivery', id: 's2', orderId: 'o-b', reference: 'SOM-1043', status: 'in_transit', picked: {'PKG-7KQ2M9XA', 'PKG-4HT8W3NB'}, dropped: {'PKG-7KQ2M9XA'})),
        DeliveryTaskDto.fromJson(siblingLegJson('pickup', id: 'p1', orderId: 'o-a', reference: 'SOM-1042')),
        DeliveryTaskDto.fromJson(siblingLegJson('pickup', id: 'p2', orderId: 'o-b', reference: 'SOM-1043')),
      ]);
    case _Scenario.contents:
      // A lone leg whose box holds products with options, and an older leg whose payload carries no contents at all.
      store.myTasks.addAll([
        DeliveryTaskDto.fromJson({
          ...legJson('delivery', id: 'c1', status: 'in_transit'),
          'parcels': setBoxes(picked: {'PKG-7KQ2M9XA', 'PKG-4HT8W3NB'}),
          'parcelContents': setContents,
          'parcelOrders': [
            {'orderId': 'o-a', 'reference': 'SOM-1042'}
          ],
        }),
        DeliveryTaskDto.fromJson(legJson('pickup', id: 'c2', orderItems: [
          {'productName': 'Running shoes', 'productNameFr': 'Chaussures de course', 'variant': 'Size 42 / Black', 'variantFr': 'Pointure 42 / Noir', 'qty': 2}
        ])),
      ]);
    case _Scenario.runs:
      // Transfer runs in every state, one of them a hop of a two-hop route, with long warehouse names.
      const kin = 'Entrepôt de Kinshasa – Gombe, Boulevard du 30 Juin';
      const lim = 'Entrepôt de Limete – Avenue des Poids Lourds';
      store.runs
        ..clear()
        ..addAll([
          TransferRun.fromJson(runJson('a1', count: 18, taskIds: ['p1', 'p2'], from: kin, to: lim)),
          TransferRun.fromJson(runJson('a2', status: 'planned', count: 1, from: lim, to: kin)),
          TransferRun.fromJson(runJson('a3', status: 'arrived', count: 18, received: 15, missing: 2, from: kin, to: lim)),
          TransferRun.fromJson(runJson('a4', status: 'closed', count: 18, received: 17, missing: 1, from: kin, to: lim)),
        ]);
      store.myTasks.addAll([
        DeliveryTaskDto.fromJson(parcelJson('p1', 'a1', hop: 1, hops: 2)),
        DeliveryTaskDto.fromJson(parcelJson('p2', 'a1', hop: 1, hops: 2, reference: 'SOM-1043')),
        DeliveryTaskDto.fromJson({...legJson('transfer', id: 'x', status: 'assigned'), 'hop': 2, 'hops': 3}),
      ]);
      store.assignment = RiderAssignment.fromJson({
        'hub': {
          'id': 'h2',
          'name': 'Entrepôt de Gombe',
          'city': 'Kinshasa',
          'address': 'Boulevard du 30 Juin 8',
          'coverage': [
            {'id': 'p', 'level': 'province', 'name': 'Nord-Kivu', 'nameEn': 'North Kivu'},
            {'id': 'c1', 'level': 'city', 'name': 'Kinshasa'},
            {'id': 'd1', 'level': 'district', 'name': 'Mont-Amba'},
            for (var i = 1; i <= 9; i++) {'id': 'm$i', 'level': 'commune', 'name': 'Commune de démonstration numéro $i'},
          ],
        }
      });
  }
  store.notifications
    ..clear()
    ..addAll([
      NotificationDto(id: 'n', title: 'New task assigned to you', body: 'SOM-1042: pickup is now in your tasks.', type: 'task', read: false),
      NotificationDto(id: 'n2', title: 'Support reply', body: 'TKT-1: Merci, nous le contactons.', type: 'support', read: false),
    ]);
  fakeSupport(tickets: [
    ticket('1', unread: 2),
    ticket('2', status: 'resolved', subject: 'Paiement en espèces non reconnu par l’entrepôt, montant différent'),
    ticket('3', status: 'pending', messages: [
      {'id': 'x', 'from': 'Jean-Pierre Mukendi', 'fromId': 'r', 'role': 'rider', 'text': '', 'at': '2026-10-25T09:00:00.000Z', 'attachments': ['http://localhost:3001/uploads/11111111-1111-1111-1111-111111111111.jpg']}
    ]),
  ]);
}

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
      await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
    }
  });

  tearDown(() {
    final store = RiderStore.instance;
    store.user = null;
    store.myTasks.clear();
    store.debugResetSession();
    store.notifications.clear();
    store.assignment = null;
    store.requireDeliveryCode = false;
    MapsConfig.debugEnabledOverride = null;
    store.stats = const WorkStatsDto();
    resetSupport();
  });

  Future<void> Function()? tab(WidgetTester tester, int i) =>
      i == 0 ? null : () async {
            await tester.tap(find.byKey(ValueKey('tab-$i')));
            await tester.pump(const Duration(milliseconds: 300));
          };

  final scanCamera = FakeParcelScanner();

  // name -> (screen, interaction after the first pump, scenario)
  final screens = <String, (Widget Function(Locale l), Future<void> Function(WidgetTester)?, _Scenario)>{
    'deliveries: active cards, every leg kind': ((l) => const Scaffold(body: DeliveriesScreen()), null, _Scenario.cards),
    'deliveries: done cards': ((l) => const Scaffold(body: DeliveriesScreen()), (t) => tab(t, 1)!(), _Scenario.cards),
    'deliveries: one card (filled action)': ((l) => const Scaffold(body: DeliveriesScreen()), null, _Scenario.single),
    'deliveries: transfer runs, hops and parcels': ((l) => const Scaffold(body: DeliveriesScreen()), null, _Scenario.runs),
    'deliveries: a run\'s parcel list open': ((l) => const Scaffold(body: DeliveriesScreen()), (t) async {
          await t.tap(find.byKey(const ValueKey('run-parcels-a1')));
          await t.pump(const Duration(milliseconds: 300));
        }, _Scenario.runs),
    'deliveries: done runs': ((l) => const Scaffold(body: DeliveriesScreen()), (t) => tab(t, 1)!(), _Scenario.runs),
    'profile: covered areas': ((l) => Scaffold(body: ProfileScreen(locale: l, onLocaleChanged: (_) {})), null, _Scenario.runs),
    'deliveries: one stop for two orders (shared contents, one code)': ((l) => const Scaffold(body: DeliveriesScreen()), null, _Scenario.stop),
    'deliveries: contents with options on a leg': ((l) => const Scaffold(body: DeliveriesScreen()), null, _Scenario.contents),
    'delivery code dialog: one code for a stop': ((l) => Scaffold(body: Center(child: DeliveryCodeDialog(legCount: 2, onSubmit: (_) async {}))), null, _Scenario.stop),
    'parcel scanner: contents and the box resolved': ((l) => ParcelScanScreen(
          title: 'SOM-1042 · SOM-1043',
          stage: ParcelStage.dropoff,
          parcels: () => [for (final b in setBoxes(picked: {'PKG-7KQ2M9XA', 'PKG-4HT8W3NB'})) ParcelDto.tryParse(b)!],
          contents: () => [for (final c in setContents) ParcelContent.tryParse(c)!],
          showOrders: true,
          refresh: ValueNotifier(0),
          scanner: scanCamera,
          onScan: (code, manual) async => ParcelScan.fromJson({'parcels': setBoxes(picked: {'PKG-7KQ2M9XA', 'PKG-4HT8W3NB'}, dropped: {code}), 'code': code, 'scanned': 1, 'total': 2}),
          onResolve: (code) async => ParcelResolution.fromJson({
            'code': code,
            'boxNo': 1,
            'boxCount': 2,
            'storeName': 'Boutique Les Merveilles de Kinshasa',
            'destinationArea': 'Gombe',
            'destination': {'area': 'Gombe', 'address': '12, avenue du Commerce, près du marché central, Gombe, Kinshasa', 'phone': '+243812345678', 'recipient': 'Aline Kabila Mwamba'},
            'contents': setContents,
            'orders': [
              {'orderId': 'o-a', 'reference': 'SOM-1042'},
              {'orderId': 'o-b', 'reference': 'SOM-1043'}
            ],
            'legs': [
              {'id': 's1', 'orderId': 'o-a', 'orderReference': 'SOM-1042', 'kind': 'delivery', 'status': 'in_transit'},
              {'id': 's2', 'orderId': 'o-b', 'orderReference': 'SOM-1043', 'kind': 'delivery', 'status': 'in_transit'},
            ],
          }),
        ), (t) async {
          scanCamera.emit('PKG-7KQ2M9XA');
          await t.pump();
          await t.pump(const Duration(milliseconds: 300));
          // The scan's snackbar floats over the page for a few seconds: the layout of the page itself is what is checked.
          t.state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger).first).hideCurrentSnackBar();
          await t.pump(const Duration(milliseconds: 400));
          await t.pump(const Duration(milliseconds: 400));
        }, _Scenario.stop),
    'deliveries: nothing assigned': ((l) => const Scaffold(body: DeliveriesScreen()), null, _Scenario.empty),
    'profile': ((l) => Scaffold(body: ProfileScreen(locale: l, onLocaleChanged: (_) {})), null, _Scenario.cards),
    'my work': ((l) => const Scaffold(body: WorkScreen()), null, _Scenario.cards),
    'location access: why we ask': ((l) => LocationAccessScreen(reporter: FakeLocationReporter(LocationAccess.denied), initial: LocationAccess.denied), null, _Scenario.cards),
    'location access: turned off, open settings': ((l) => LocationAccessScreen(reporter: FakeLocationReporter(LocationAccess.deniedForever), initial: LocationAccess.deniedForever), null, _Scenario.cards),
    'location access: GPS off': ((l) => LocationAccessScreen(reporter: FakeLocationReporter(LocationAccess.serviceOff), initial: LocationAccess.serviceOff), null, _Scenario.cards),
    'route map: stop, distance and straight-line note': ((l) => TaskRouteScreen(task: leg('delivery', id: 'a3', status: 'in_transit'), mapBuilder: (c, d) => const ColoredBox(color: Color(0xFFDDE6F5)), routes: RouteService(apiKey: ''), positionOnce: () async => (lat: -4.3217, lng: 15.3125)), null, _Scenario.cards),
    'route map: no pin and no position': ((l) => TaskRouteScreen(task: leg('delivery', id: 'a3', status: 'in_transit', legacy: true), mapBuilder: (c, d) => const ColoredBox(color: Color(0xFFDDE6F5)), routes: RouteService(apiKey: ''), positionOnce: () async => null), null, _Scenario.cards),
    'sign in': ((l) => const RiderLoginScreen(), null, _Scenario.cards),
    'forgot password': ((l) => const ForgotPasswordScreen(), null, _Scenario.cards),
    'failure sheet': ((l) => const Scaffold(body: SingleChildScrollView(child: FailReasonSheet())), null, _Scenario.cards),
    'proof of delivery sheet': ((l) => Scaffold(body: SingleChildScrollView(child: DeliveryProofSheet(taskId: 'd', camera: FakeProofCamera(), uploader: FakeProofUploader()))), null, _Scenario.cards),
    'proof of delivery sheet: photo taken, save failed': ((l) => Scaffold(body: SingleChildScrollView(child: DeliveryProofSheet(taskId: 'd', camera: FakeProofCamera(), uploader: FakeProofUploader(error: ApiException.local('err_offline'))))), (t) async {
          await t.tap(find.byKey(const ValueKey('proof-photo')));
          await t.pump(const Duration(milliseconds: 300));
          await t.tap(find.byKey(const ValueKey('proof-continue')));
          await t.pump(const Duration(milliseconds: 300));
        }, _Scenario.cards),
    'delivery code dialog': ((l) => Scaffold(body: Center(child: DeliveryCodeDialog(onSubmit: (_) async {}))), null, _Scenario.cards),
    'support: ticket list': ((l) => const SupportScreen(), null, _Scenario.cards),
    'support: no ticket yet': ((l) => const SupportScreen(), (t) async {
          SupportStore.instance.api = FakeSupportApi();
          await SupportStore.instance.load();
          await t.pump(const Duration(milliseconds: 300));
        }, _Scenario.cards),
    'support: new ticket form': ((l) => const NewTicketScreen(), null, _Scenario.cards),
    'support: new ticket form, photos and errors': ((l) => const NewTicketScreen(), (t) async {
          final fake = SupportStore.instance.picker as FakePicker;
          fake.result = [const PickedPhoto('/tmp/a.jpg'), const PickedPhoto('/tmp/b.jpg'), const PickedPhoto('/tmp/c.jpg'), const PickedPhoto('/tmp/d.jpg')];
          await t.tap(find.byKey(const ValueKey('ticket-add-photos')));
          await t.pumpAndSettle();
          await t.tap(find.byKey(const ValueKey('photo-gallery')));
          await t.pumpAndSettle();
          await t.tap(find.byKey(const ValueKey('ticket-submit')));
          await t.pump(const Duration(milliseconds: 300));
        }, _Scenario.cards),
    'support: open thread with photos': ((l) => const SupportThreadScreen(ticketId: '1'), null, _Scenario.cards),
    'support: thread with chosen photos': ((l) => const SupportThreadScreen(ticketId: '1'), (t) async {
          final fake = SupportStore.instance.picker as FakePicker;
          fake.result = [const PickedPhoto('/tmp/a.jpg'), const PickedPhoto('/tmp/b.jpg'), const PickedPhoto('/tmp/c.jpg')];
          await t.tap(find.byKey(const ValueKey('attach-photo')));
          await t.pumpAndSettle();
          await t.tap(find.byKey(const ValueKey('photo-gallery')));
          await t.pumpAndSettle();
        }, _Scenario.cards),
    'support: closed thread': ((l) => const SupportThreadScreen(ticketId: '2'), null, _Scenario.cards),
  };

  // The screens that list products or group legs are also run at the narrowest phone and the largest text.
  const stressed = {
    'deliveries: one stop for two orders (shared contents, one code)',
    'deliveries: contents with options on a leg',
    'delivery code dialog: one code for a stop',
    'parcel scanner: contents and the box resolved',
  };

  for (final e in screens.entries) {
    testWidgets('layout matrix: ${e.key}', (tester) async {
      addTearDown(tester.view.reset);
      final found = <String>[];
      for (final c in [...layoutConfigs, if (stressed.contains(e.key)) ...stressConfigs]) {
        await _seed(c.lang, scenario: e.value.$3);
        final locale = Locale(c.lang);
        final app = MaterialApp(
          theme: AppTheme.light(),
          locale: locale,
          supportedLocales: const [Locale('en'), Locale('fr')],
          localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
          builder: scaleText(c),
          home: e.value.$1(locale),
        );
        final after = e.value.$2;
        for (final p in await layoutProblems(tester, c, app, interact: after == null ? null : () => after(tester))) {
          found.add('[$c] $p');
        }
      }
      expect(found, isEmpty, reason: found.join('\n'));
    });
  }
}
