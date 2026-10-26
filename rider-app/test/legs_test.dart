// The rider's tasks by leg kind (docs/contracts/logistics.md sections 6 and 7): parsing of every kind and of old
// payloads, the card per kind, hub-bound legs that cannot be marked delivered, the delivery code on the customer
// delivery only, no self-accept and no open pool, the home warehouse without zones, and live `task:updated` pushes.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/messages.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/deliveries_screen.dart';
import 'package:somba_rider/screens/profile_screen.dart';
import 'package:somba_rider/services/auth_service.dart' show ApiException;
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/navigation_link.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

import 'button_rules.dart';
import 'task_fixtures.dart';

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
      await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
    }
  });

  final calls = <String>[];
  final sent = <Map<String, dynamic>?>[];
  late List<Map<String, dynamic>> serverTasks;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await Strings.setLang('en', persist: false);
    calls.clear();
    sent.clear();
    serverTasks = [];
    final store = RiderStore.instance;
    store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean', role: 'rider', phone: '+243810000000');
    store.loaded = true;
    store.requireDeliveryCode = false;
    store.myTasks.clear();
    store.transport = (event, body) async {
      calls.add(event);
      sent.add(body);
      switch (event) {
        case 'rider:tasks':
          return serverTasks;
        case 'rider:earnings':
          return {'totalTasks': 3, 'delivered': 1, 'active': 2, 'codCollectedUsd': 0, 'earningsUsd': 2};
        case 'notifications:list':
          return [];
        case 'settings:get':
          return {'requireDeliveryCode': 'true'};
        case 'rider:assignment':
          return {'hub': {'id': 'h2', 'name': 'Entrepôt de Gombe', 'city': 'Kinshasa', 'address': 'Boulevard du 30 Juin 8', 'lat': -4.3, 'lng': 15.3}};
        case 'support:list':
          return [];
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
    store.notifications.clear();
    store.assignment = null;
    store.requireDeliveryCode = false;
    store.focus.value = null;
    resetSupport();
  });

  group('parsing', () {
    test('every leg kind: kind, endpoints, hubs, seller, items, flags', () {
      for (final kind in LegKind.all) {
        final t = leg(kind);
        expect(t.kind, kind);
        expect(t.from, isNotNull, reason: kind);
        expect(t.to, isNotNull, reason: kind);
        expect(t.items.map((i) => i.qty), [2, 1], reason: kind);
        expect(t.endsAtHub, LegKind.hubBound.contains(kind), reason: kind);
        expect(t.needsCode, kind == 'delivery', reason: kind);
        expect(t.collectOld, kind == 'replacement_delivery', reason: kind);
        expect(t.orderFlow, !kind.startsWith('return') && kind != 'replacement_delivery', reason: kind);
      }
      final pickup = leg('pickup');
      expect(pickup.sellerName, 'Boutique Les Merveilles de Kinshasa');
      expect(pickup.sellerId, 's1');
      expect(pickup.from!.isSeller, isTrue);
      expect(pickup.from!.address, '27, avenue Kasa-Vubu, Bandalungwa');
      expect(pickup.from!.pin, (lat: -4.33, lng: 15.29));
      expect(pickup.toHubName, 'Entrepôt de Limete');
      expect(pickup.toHubId, 'h1');
      final transfer = leg('transfer');
      expect((transfer.fromHubName, transfer.toHubName), ('Entrepôt de Limete', 'Entrepôt de Gombe'));
      final delivery = leg('delivery', cod: 12.5);
      expect(delivery.fromHubName, 'Entrepôt de Gombe');
      expect(delivery.to!.isCustomer, isTrue);
      expect(delivery.customerName, 'Aline Kabila Mwamba');
      expect(delivery.phone, '+243812345678');
      expect(delivery.pin, (lat: -4.3101, lng: 15.3125));
      expect(delivery.collectsCash, isTrue);
      expect(leg('return_to_seller').sellerLabel, 'Boutique Les Merveilles de Kinshasa');
      expect(leg('return_pickup').disputeId, 'd1');
      expect(leg('replacement_delivery').replacementId, 'rp1');
    });

    test('an old payload (no kind, no endpoints, zone keys) is a plain delivery read from the order address', () {
      final json = legJson('delivery', legacy: true)
        ..['zoneId'] = 'gombe'
        ..['zoneName'] = 'Gombe'
        ..['preferred'] = true;
      final t = DeliveryTaskDto.fromJson(json);
      expect(t.kind, LegKind.delivery);
      expect(t.endsAtHub, isFalse);
      expect(t.needsCode, isTrue, reason: 'a delivery asks for the code when the server does not say otherwise');
      expect(t.from, isNull);
      expect(t.to, isNull);
      expect(t.collectOld, isFalse);
      expect(t.address, '12, avenue du Commerce, près du marché central, Gombe, Kinshasa');
      expect(t.phone, '+243812345678');
      expect(t.pin, (lat: -4.3101, lng: 15.3125));
      expect(t.items.map((i) => i.name), ['Chaussures de course Air Comfort Pro', 'Écouteurs sans fil']);
      expect(t.pickupAddress, isNotNull);
    });

    test('missing endpoints fall back to the old address fields; a bare minimal row still parses', () {
      final t = DeliveryTaskDto.fromJson({'id': 'x', 'address': '{"line1":"3 Ave Livre","city":"Kinshasa"}', 'kind': 'delivery', 'from': 'oops', 'to': 5});
      expect(t.from, isNull);
      expect(t.address, '3 Ave Livre, Kinshasa');
      final bare = DeliveryTaskDto.fromJson({'id': 'y'});
      expect((bare.kind, bare.status, bare.attempts), ('delivery', 'assigned', 1));
    });

    test('an unknown future kind is kept as is and is never treated as hub-bound or delivered by the rider', () {
      final t = DeliveryTaskDto.fromJson({'id': 'z', 'kind': 'cross_dock', 'status': 'in_transit'});
      expect(t.kind, 'cross_dock');
      expect(t.endsAtHub, isFalse);
    });

    test('a TaskView push (no order snapshot) is completed with what the list knew', () {
      final old = leg('delivery', id: 'a');
      final push = DeliveryTaskDto.fromJson(legJson('delivery', id: 'a', status: 'picked_up', withOrder: false));
      expect(push.hasOrder, isFalse);
      expect(push.customerName, 'Aline Kabila Mwamba', reason: 'from the customer endpoint');
      final merged = push.withOrderFrom(old);
      expect(merged.status, 'picked_up');
      expect(merged.estimatedDeliveryDate, '2026-10-28');
      expect(merged.totalUsd, 87.5);
      expect(merged.items.map((i) => i.qty), [2, 1]);
    });

    test('rider:assignment gives the home warehouse; zone keys are ignored', () {
      final a = RiderAssignment.fromJson({
        'hub': {'id': 'h2', 'name': 'Entrepôt de Gombe', 'city': 'Kinshasa', 'address': 'Boulevard du 30 Juin 8', 'lat': -4.3, 'lng': 15.3},
        'preferredZones': [
          {'name': 'Gombe'}
        ],
        'hubZones': [
          {'name': 'Limete'}
        ],
      });
      expect((a.hubId, a.hubName, a.hubCity, a.hubAddress), ('h2', 'Entrepôt de Gombe', 'Kinshasa', 'Boulevard du 30 Juin 8'));
      expect(a.hasHub, isTrue);
      expect(RiderAssignment.fromJson({'hub': null}).hasHub, isFalse);
      expect(RiderAssignment.fromJson({}).hasHub, isFalse);
    });
  });

  group('actions per leg', () {
    test('a rider never gets "delivered" on a leg that ends at a warehouse', () {
      for (final kind in LegKind.all) {
        for (final status in ['assigned', 'picked_up', 'in_transit']) {
          final next = nextStatusFor(leg(kind, status: status));
          if (LegKind.hubBound.contains(kind)) {
            expect(next?.$1, isNot('delivered'), reason: '$kind $status');
            if (status == 'in_transit') expect(next, isNull, reason: '$kind: staff scan it in');
          } else if (status == 'in_transit') {
            expect(next?.$1, 'delivered', reason: kind);
          }
        }
        expect(nextStatusFor(leg(kind, status: 'delivered')), isNull);
        expect(nextStatusFor(leg(kind, status: 'failed')), isNull);
      }
    });

    test('every action label exists in both languages', () {
      for (final kind in LegKind.all) {
        for (final status in ['assigned', 'picked_up', 'in_transit']) {
          final next = nextStatusFor(leg(kind, status: status));
          if (next != null) expect(kMessages.containsKey(next.$2), isTrue, reason: next.$2);
        }
      }
    });
  });

  group('cards', () {
    Future<void> show(WidgetTester t, String lang, List<DeliveryTaskDto> tasks, {bool code = false}) async {
      await Strings.setLang(lang, persist: false);
      final store = RiderStore.instance;
      store.requireDeliveryCode = code;
      store.myTasks
        ..clear()
        ..addAll(tasks);
      t.view.physicalSize = const Size(360 * 3, 1600 * 3);
      t.view.devicePixelRatio = 3;
      addTearDown(t.view.reset);
      await t.pumpWidget(KeyedSubtree(key: UniqueKey(), child: MaterialApp(
        locale: Locale(lang),
        supportedLocales: const [Locale('en'), Locale('fr')],
        localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
        theme: AppTheme.light(),
        home: const Scaffold(body: DeliveriesScreen()),
      )));
      await t.pump(const Duration(milliseconds: 600));
    }

    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);

      testWidgets('pickup: "pick up at <seller>", the seller address, "bring to <warehouse>", hand over at the warehouse ($lang)', (t) async {
        await show(t, lang, [leg('pickup', id: 'p')]);
        expect(find.text(s.legPickupTitle('Boutique Les Merveilles de Kinshasa')), findsOneWidget);
        expect(find.text('27, avenue Kasa-Vubu, Bandalungwa'), findsOneWidget);
        expect(find.text(s.legBringTo('Entrepôt de Limete, Avenue des Poids Lourds 45, Limete')), findsOneWidget);
        expect(find.text(s.t('kind_pickup')), findsOneWidget);
        expect(find.text(s.handoverAt('Entrepôt de Limete')), findsOneWidget);
        expect(find.byKey(const ValueKey('waiting-scan-p')), findsNothing, reason: 'not on the road yet');
        expect(find.text(s.t('act_picked_up_seller')), findsOneWidget);
        // no customer on a pickup: no code, no cash, no customer name
        expect(find.textContaining('Aline'), findsNothing);
        expectButtonRules(t);
      });

      testWidgets('hub-bound legs on the road: no delivered action, "waiting for the warehouse to scan it in" ($lang)', (t) async {
        for (final kind in ['pickup', 'transfer', 'return_pickup', 'return_transfer']) {
          await show(t, lang, [leg(kind, id: 'h', status: 'in_transit')], code: true);
          expect(find.byKey(const ValueKey('next-h')), findsNothing, reason: '$kind has nothing to mark delivered');
          expect(find.text(s.actDelivered), findsNothing, reason: kind);
          expect(find.byKey(const ValueKey('handover-h')), findsOneWidget, reason: kind);
          expect(find.byKey(const ValueKey('waiting-scan-h')), findsOneWidget, reason: kind);
          expect(find.text(s.waitingScan), findsOneWidget);
          expect(find.byKey(const ValueKey('code-hint-h')), findsNothing, reason: '$kind: the code is for the customer delivery only');
          expect(find.byKey(const ValueKey('fail-h')), findsOneWidget, reason: 'a rider can still report a failure');
        }
      });

      testWidgets('transfer: "transfer to <warehouse>" from the origin warehouse ($lang)', (t) async {
        await show(t, lang, [leg('transfer', id: 'x', status: 'picked_up')]);
        expect(find.text(s.legTransferTitle('Entrepôt de Gombe')), findsOneWidget);
        expect(find.text(s.legTransferFrom('Entrepôt de Limete, Avenue des Poids Lourds 45, Limete')), findsOneWidget);
        expect(find.text(s.handoverAt('Entrepôt de Gombe')), findsOneWidget);
        expect(find.text(s.t('act_in_transit_hub')), findsOneWidget);
      });

      testWidgets('delivery: customer, address, phone, COD, fetch at the warehouse; the code hint once on the road ($lang)', (t) async {
        await show(t, lang, [leg('delivery', id: 'd', cod: 20)], code: true);
        expect(find.text('Aline Kabila Mwamba'), findsOneWidget);
        expect(find.text(s.deliverTo('12, avenue du Commerce, près du marché central, Gombe, Kinshasa')), findsOneWidget);
        expect(find.text('+243812345678'), findsOneWidget);
        expect(find.text(s.collectCash(s.usd(20))), findsOneWidget);
        expect(find.text(s.collectAt('Entrepôt de Gombe, Boulevard du 30 Juin 8, Gombe')), findsOneWidget);
        expect(find.byKey(const ValueKey('handover-d')), findsNothing);
        expect(find.byKey(const ValueKey('code-hint-d')), findsNothing, reason: 'not before the pickup');

        await show(t, lang, [leg('delivery', id: 'd', status: 'in_transit')], code: true);
        expect(find.byKey(const ValueKey('code-hint-d')), findsOneWidget);
        expect(find.text(s.actDelivered), findsOneWidget);
        expect(find.byKey(const ValueKey('handover-d')), findsNothing);
      });

      testWidgets('return pickup: collect from the customer, bring to the warehouse ($lang)', (t) async {
        await show(t, lang, [leg('return_pickup', id: 'r')]);
        expect(find.text(s.legReturnPickupTitle), findsOneWidget);
        expect(find.text('+243812345678'), findsOneWidget);
        expect(find.text(s.legBringTo('Entrepôt de Gombe, Boulevard du 30 Juin 8, Gombe')), findsOneWidget);
        expect(find.text(s.handoverAt('Entrepôt de Gombe')), findsOneWidget);
        expect(find.text(s.t('act_picked_up_customer')), findsOneWidget);
      });

      testWidgets('return transfer: move between warehouses ($lang)', (t) async {
        await show(t, lang, [leg('return_transfer', id: 'rt')]);
        expect(find.text(s.legReturnTransferTitle('Entrepôt de Limete')), findsOneWidget);
        expect(find.text(s.handoverAt('Entrepôt de Limete')), findsOneWidget);
      });

      testWidgets('return to seller: take it back to the seller; the rider finishes it ($lang)', (t) async {
        await show(t, lang, [leg('return_to_seller', id: 's', status: 'in_transit')]);
        expect(find.text(s.legReturnSellerTitle('Boutique Les Merveilles de Kinshasa')), findsOneWidget);
        expect(find.text('27, avenue Kasa-Vubu, Bandalungwa'), findsOneWidget);
        expect(find.byKey(const ValueKey('handover-s')), findsNothing);
        expect(find.text(s.t('act_delivered_seller')), findsOneWidget);
      });

      testWidgets('replacement: deliver the new unit AND collect the old one ($lang)', (t) async {
        await show(t, lang, [leg('replacement_delivery', id: 'rp', status: 'in_transit')], code: true);
        expect(find.text(s.legReplacementTitle), findsOneWidget);
        expect(find.byKey(const ValueKey('collect-old-rp')), findsOneWidget);
        expect(find.text(s.collectOld), findsOneWidget);
        expect(find.text('+243812345678'), findsOneWidget);
        expect(find.byKey(const ValueKey('code-hint-rp')), findsNothing, reason: 'no code on a replacement');
        expect(find.text(s.actDelivered), findsOneWidget);
      });

      testWidgets('a finished pickup says it was scanned in; a failed leg shows why ($lang)', (t) async {
        await show(t, lang, [leg('pickup', id: 'f', status: 'delivered'), leg('delivery', id: 'g', status: 'failed', failure: 'Client injoignable')]);
        await t.tap(find.byKey(const ValueKey('tab-1')));
        await t.pump(const Duration(milliseconds: 300));
        expect(find.text(s.taskScannedIn), findsOneWidget);
        expect(find.byKey(const ValueKey('next-f')), findsNothing);
        expect(find.text(s.failedWithReason('Client injoignable')), findsOneWidget);
      });
    }

    testWidgets('delivery on the road with the code required: the code prompt, then the call carries the code', (t) async {
      await show(t, 'en', [leg('delivery', id: 'd', status: 'in_transit')], code: true);
      await t.tap(find.byKey(const ValueKey('next-d')));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('delivery-code-field')), findsOneWidget);
      await t.enterText(find.byKey(const ValueKey('delivery-code-field')), '4321');
      await t.tap(find.byKey(const ValueKey('delivery-code-submit')));
      await t.pumpAndSettle();
      expect(calls, contains('delivery:updateStatus'));
      expect(sent[calls.indexOf('delivery:updateStatus')], {'taskId': 'd', 'status': 'delivered', 'code': '4321'});
      expect(find.text(Strings('en').doneDelivered), findsOneWidget, reason: 'a completed action says so');
    });

    testWidgets('the code is not asked when the server does not require it, nor on a replacement', (t) async {
      await show(t, 'en', [leg('delivery', id: 'd', status: 'in_transit')]);
      await t.tap(find.byKey(const ValueKey('next-d')));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('delivery-code-field')), findsNothing);
      expect(sent[calls.indexOf('delivery:updateStatus')], {'taskId': 'd', 'status': 'delivered'});

      calls.clear();
      sent.clear();
      await show(t, 'en', [leg('replacement_delivery', id: 'rp', status: 'in_transit')], code: true);
      await t.tap(find.byKey(const ValueKey('next-rp')));
      await t.pumpAndSettle();
      expect(find.text(Strings('en').collectOldTitle), findsOneWidget, reason: 'confirm the old unit first');
      expect(find.byKey(const ValueKey('delivery-code-field')), findsNothing);
      await t.tap(find.byKey(const ValueKey('confirm-dialog')));
      await t.pumpAndSettle();
      expect(sent[calls.indexOf('delivery:updateStatus')], {'taskId': 'rp', 'status': 'delivered'});
    });

    testWidgets('a code the app did not know was needed: the server says so and the prompt opens', (t) async {
      await show(t, 'en', [leg('delivery', id: 'd', status: 'in_transit')]);
      RiderStore.instance.transport = (event, body) async {
        calls.add(event);
        if (event == 'delivery:updateStatus' && body?['code'] == null) throw ApiException('Wrong delivery code. Ask the customer for the 4-digit code shown in their app.');
        return {'ok': true};
      };
      await t.tap(find.byKey(const ValueKey('next-d')));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('delivery-code-field')), findsOneWidget);
    });

    testWidgets('a failed action says why in a snackbar', (t) async {
      await show(t, 'en', [leg('delivery', id: 'd')]);
      RiderStore.instance.transport = (event, body) async => throw ApiException('This delivery was just updated. Refresh and try again.');
      await t.tap(find.byKey(const ValueKey('next-d')));
      await t.pumpAndSettle();
      expect(find.text('This delivery was just updated. Refresh and try again.'), findsOneWidget);
    });

    testWidgets('a completed pickup says so in a snackbar', (t) async {
      await show(t, 'fr', [leg('pickup', id: 'p')]);
      await t.tap(find.byKey(const ValueKey('next-p')));
      await t.pumpAndSettle();
      expect(find.text(const Strings('fr').donePickedUp), findsOneWidget);
    });

    testWidgets('nothing assigned: "Your warehouse assigns your tasks" (both languages), no pool tab, no accept button', (t) async {
      for (final lang in ['en', 'fr']) {
        await show(t, lang, []);
        expect(find.byKey(const ValueKey('empty-tasks')), findsOneWidget);
        expect(find.textContaining(Strings(lang).warehouseAssigns), findsOneWidget);
        expect(find.byKey(const ValueKey('tab-0')), findsOneWidget);
        expect(find.byKey(const ValueKey('tab-1')), findsOneWidget);
        expect(find.byKey(const ValueKey('tab-2')), findsNothing, reason: 'no "Available" tab');
        expect(find.textContaining('ccept'), findsNothing);
        expect(find.textContaining('ccepter'), findsNothing);
      }
    });

    testWidgets('no accept action on any card, in any state', (t) async {
      await show(t, 'en', [for (final k in LegKind.all) for (final st in ['assigned', 'picked_up', 'in_transit']) leg(k, id: '$k-$st', status: st)]);
      expect(find.byWidgetPredicate((w) => w.key is ValueKey && '${(w.key as ValueKey).value}'.startsWith('accept')), findsNothing);
      expect(find.textContaining(RegExp('accept', caseSensitive: false)), findsNothing);
    });
  });

  group('no self-accept', () {
    test('the code has no accept call, no pool and no zone pill', () {
      final offenders = <String>[];
      for (final f in Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
        final src = f.readAsStringSync();
        for (final bad in ['delivery:accept', 'delivery:unassigned', 'store.pool', 'zoneName', 'preferredZones', 'hubZones', 'zone_label', 'your_zone', "'accept_delivery'"]) {
          if (src.contains(bad) && !f.path.endsWith('server_errors.dart')) offenders.add('${f.path}: $bad');
        }
      }
      expect(offenders, isEmpty);
      expect(kMessages.keys.where((k) => k.contains('zone') || k.contains('accept') || k == 'tab_available' || k == 'empty_available'), isEmpty);
    });

    test('a refresh reads only my tasks: it never calls the accept or open-pool events', () async {
      serverTasks = [legJson('pickup', id: 'a'), legJson('delivery', id: 'b', status: 'unassigned'), legJson('transfer', id: 'c', status: 'picked_up')];
      await RiderStore.instance.refresh();
      expect(calls, containsAll(['rider:tasks', 'rider:earnings']));
      expect(calls, isNot(contains('delivery:accept')));
      expect(calls, isNot(contains('delivery:unassigned')));
      expect(RiderStore.instance.myTasks.map((t) => t.id), ['a', 'c'], reason: 'an unassigned row (older server pool) is not mine');
      expect(RiderStore.instance.active, hasLength(2));
    });
  });

  group('live pushes', () {
    test('task:updated for a task assigned to me adds it, updates it in place, and removes it when it leaves me', () {
      final store = RiderStore.instance;
      store.applyTaskPush(legJson('pickup', id: 'a', withOrder: false));
      expect(store.myTasks.map((t) => t.id), ['a']);
      expect(store.myTasks.single.status, 'assigned');

      store.applyTaskPush(legJson('pickup', id: 'a', status: 'in_transit', withOrder: false));
      expect(store.myTasks, hasLength(1));
      expect(store.myTasks.single.status, 'in_transit');

      store.applyTaskPush(legJson('pickup', id: 'a', status: 'assigned', riderId: 'someone-else', withOrder: false));
      expect(store.myTasks, isEmpty, reason: 'reassigned by the warehouse');

      store.applyTaskPush(legJson('transfer', id: 'b', riderId: 'someone-else', withOrder: false));
      expect(store.myTasks, isEmpty, reason: 'not mine');
    });

    test('a push keeps the order snapshot the list already had, and an old payload without riderId changes nothing', () {
      final store = RiderStore.instance;
      store.myTasks.add(leg('delivery', id: 'd'));
      store.applyTaskPush(legJson('delivery', id: 'd', status: 'picked_up', withOrder: false));
      expect(store.myTasks.single.status, 'picked_up');
      expect(store.myTasks.single.estimatedDeliveryDate, '2026-10-28');
      final legacy = legJson('delivery', id: 'd', status: 'in_transit')..remove('riderId');
      store.applyTaskPush(legacy);
      expect(store.myTasks.single.status, 'picked_up', reason: 'the re-read brings it');
      store.applyTaskPush('garbage');
      store.applyTaskPush({'id': 5, 'riderId': 'r'});
      expect(store.myTasks, hasLength(1));
    });
  });

  group('profile', () {
    Future<void> show(WidgetTester t, String lang) async {
      await Strings.setLang(lang, persist: false);
      t.view.physicalSize = const Size(360 * 3, 1400 * 3);
      t.view.devicePixelRatio = 3;
      addTearDown(t.view.reset);
      await t.pumpWidget(KeyedSubtree(key: UniqueKey(), child: MaterialApp(
        locale: Locale(lang),
        supportedLocales: const [Locale('en'), Locale('fr')],
        localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
        theme: AppTheme.light(),
        home: Scaffold(body: ProfileScreen(locale: Locale(lang), onLocaleChanged: (_) {})),
      )));
      await t.pump(const Duration(milliseconds: 600));
    }

    for (final lang in ['en', 'fr']) {
      testWidgets('the home warehouse: name, city, address; no zones ($lang)', (t) async {
        RiderStore.instance.assignment = RiderAssignment.fromJson({
          'hub': {'id': 'h2', 'name': 'Entrepôt de Gombe', 'city': 'Kinshasa', 'address': 'Boulevard du 30 Juin 8'},
          'preferredZones': [
            {'name': 'Gombe'}
          ],
        });
        await show(t, lang);
        expect(find.text('Entrepôt de Gombe · Kinshasa'), findsOneWidget);
        expect(find.byKey(const ValueKey('warehouse-address')), findsOneWidget);
        expect(find.text('Boulevard du 30 Juin 8'), findsOneWidget);
        expect(find.text(Strings(lang).homeWarehouse), findsOneWidget);
        expect(find.textContaining(RegExp('zone', caseSensitive: false)), findsNothing);
        expect(find.text(Strings(lang).support), findsOneWidget, reason: 'support is reachable from the profile');
      });
    }

    testWidgets('a rider without a warehouse is told to ask an administrator', (t) async {
      RiderStore.instance.assignment = RiderAssignment.fromJson({'hub': null});
      await show(t, 'en');
      expect(find.text(Strings('en').noWarehouse), findsOneWidget);
    });
  });

  group('navigation targets', () {
    test('seller, warehouse and customer by leg and status', () {
      expect(navTargetFor(leg('pickup'))!.kind, NavKind.seller);
      expect(navTargetFor(leg('pickup', status: 'picked_up'))!.kind, NavKind.hub);
      expect(navTargetFor(leg('delivery'))!.kind, NavKind.hub);
      expect(navTargetFor(leg('delivery', status: 'in_transit'))!.kind, NavKind.customer);
      expect(navTargetFor(leg('delivery', status: 'in_transit'))!.pin, (lat: -4.3101, lng: 15.3125));
      expect(navTargetFor(leg('return_pickup'))!.kind, NavKind.customer);
      expect(navTargetFor(leg('return_to_seller', status: 'in_transit'))!.kind, NavKind.seller);
      expect(navTargetFor(leg('replacement_delivery', status: 'picked_up'))!.kind, NavKind.customer);
    });

    test('an old payload keeps the old behaviour: pickup text first, then the customer', () {
      final before = navTargetFor(leg('delivery', legacy: true))!;
      expect(before.kind, NavKind.pickup);
      expect(before.addressText, contains('Entrepôt'));
      final after = navTargetFor(leg('delivery', status: 'in_transit', legacy: true))!;
      expect(after.kind, NavKind.customer);
      expect(after.addressText, '12, avenue du Commerce, Gombe, Kinshasa', reason: 'no landmark line');
    });
  });
}
