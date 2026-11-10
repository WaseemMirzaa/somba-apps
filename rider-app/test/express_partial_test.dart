// The delivery model's two new things for the rider (docs/contracts/logistics.md sections 15-16 and the express leg):
// the `express` kind (seller -> customer: meets the customer, asks the code, collects the cash, takes the proof, no warehouse),
// a customer leg that carries only part of the order (the leg's own lines and a "Part of the order" badge), "Task updated"
// when parcels are merged into a task, and the status errors that now read "An express delivery that is ...".
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/messages.dart';
import 'package:somba_rider/l10n/notification_text.dart';
import 'package:somba_rider/l10n/server_errors.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/deliveries_screen.dart';
import 'package:somba_rider/services/delivery_proof.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/navigation_link.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

import 'button_rules.dart';
import 'proof_helpers.dart';
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

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await Strings.setLang('en', persist: false);
    calls.clear();
    sent.clear();
    final store = RiderStore.instance;
    store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean', role: 'rider', phone: '+243810000000');
    store.loaded = true;
    store.requireDeliveryCode = false;
    store.codEnabled = true;
    store.myTasks.clear();
    store.notifications.clear();
    store.transport = (event, body) async {
      calls.add(event);
      sent.add(body);
      switch (event) {
        case 'rider:tasks':
          return <dynamic>[];
        case 'rider:workStats':
          return {'totalTasks': 0, 'completed': 0, 'active': 0, 'failed': 0, 'completedToday': 0, 'completedLast7Days': 0, 'successRate': null, 'codCollectedUsd': 0, 'byKind': []};
        case 'notifications:list':
          return <dynamic>[];
        default:
          return {'ok': true};
      }
    };
  });

  group('the express kind', () {
    test('it is a customer leg: meets the customer, asks the code, takes the proof, never ends at a warehouse', () {
      final t = leg('express', id: 'e', cod: 14);
      expect(t.kind, LegKind.express);
      expect(LegKind.all, contains('express'));
      expect(t.isExpress, isTrue);
      expect(t.isCustomerLeg, isTrue);
      expect(t.meetsCustomer, isTrue);
      expect(t.needsCode, isTrue);
      expect(t.takesProof, isTrue);
      expect(t.endsAtHub, isFalse);
      expect(t.collectsCash, isTrue);
      expect(t.codAmountUsd, 14);
    });

    test('its pickup is at the store and its drop-off at the customer; no warehouse at either end', () {
      final t = leg('express', id: 'e');
      expect(t.fromHub, isNull);
      expect(t.toHub, isNull);
      expect(t.from!.isSeller, isTrue);
      expect(t.to!.isCustomer, isTrue);
      expect(t.sellerLabel, 'Boutique Les Merveilles de Kinshasa');
      // Before the parcel is collected the map goes to the store, afterwards to the customer.
      final before = navTargetFor(leg('express', id: 'e', status: 'assigned'))!;
      expect(before.kind, NavKind.seller);
      expect(before.pin, (lat: -4.33, lng: 15.29));
      for (final st in ['picked_up', 'in_transit']) {
        final after = navTargetFor(leg('express', id: 'e', status: st))!;
        expect(after.kind, NavKind.customer, reason: st);
        expect(after.pin, (lat: -4.3101, lng: 15.3125), reason: st);
      }
    });

    test('the rider moves it assigned -> picked up -> in transit -> delivered, and can fail it', () {
      expect(nextStatusFor(leg('express', status: 'assigned')), ('picked_up', 'act_picked_up_seller'));
      expect(nextStatusFor(leg('express', status: 'picked_up')), ('in_transit', 'act_in_transit'));
      expect(nextStatusFor(leg('express', status: 'in_transit')), ('delivered', 'act_delivered'));
      expect(nextStatusFor(leg('express', status: 'delivered')), isNull);
      expect(nextStatusFor(leg('express', status: 'failed')), isNull);
      for (final k in ['act_picked_up_seller', 'act_in_transit', 'act_delivered', 'kind_express', 'part_of_order', 'leg_express_title']) {
        expect(kMessages.containsKey(k), isTrue, reason: k);
      }
    });

    test('the server may say it needs no code (the setting is off); an older rider payload still defaults per kind', () {
      expect(DeliveryTaskDto.fromJson({...legJson('express'), 'needsCode': false}).needsCode, isFalse);
      expect(DeliveryTaskDto.fromJson({'id': 'x', 'kind': 'express'}).needsCode, isTrue);
      expect(DeliveryTaskDto.fromJson({'id': 'x', 'kind': 'pickup'}).needsCode, isFalse);
    });

    test('the prepaid note and the cash rules follow a customer leg, standard or express', () {
      expect(leg('express', id: 'e', status: 'picked_up').isActive, isTrue);
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
      t.view.physicalSize = const Size(360 * 3, 1800 * 3);
      t.view.devicePixelRatio = 3;
      addTearDown(t.view.reset);
      await t.pumpWidget(KeyedSubtree(
          key: UniqueKey(),
          child: MaterialApp(
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

      testWidgets('express before pickup: collect at the store, then the customer; cash; no warehouse hand-over ($lang)', (t) async {
        await show(t, lang, [leg('express', id: 'e', cod: 20)], code: true);
        expect(find.text(s.legExpressTitle('Boutique Les Merveilles de Kinshasa')), findsOneWidget);
        expect(find.text(s.t('kind_express')), findsWidgets, reason: 'the kind pill');
        expect(find.text(s.collectAt('27, avenue Kasa-Vubu, Bandalungwa')), findsOneWidget, reason: 'the pickup is at the store');
        expect(find.text('Aline Kabila Mwamba'), findsOneWidget);
        expect(find.text(s.deliverTo('12, avenue du Commerce, près du marché central, Gombe, Kinshasa')), findsOneWidget);
        expect(find.text('+243812345678'), findsOneWidget);
        expect(find.text(s.collectCash(s.usd(20))), findsOneWidget);
        expect(find.byKey(const ValueKey('handover-e')), findsNothing, reason: 'no warehouse on an express run');
        expect(find.text(s.theWarehouse), findsNothing);
        expect(find.text(s.t('act_picked_up_seller')), findsOneWidget);
        expect(find.byKey(const ValueKey('code-hint-e')), findsNothing, reason: 'not before the pickup');
        expectButtonRules(t);
      });

      testWidgets('express on the road: the code hint, "delivered", the cash; a failure can still be reported ($lang)', (t) async {
        await show(t, lang, [leg('express', id: 'e', status: 'in_transit', cod: 20)], code: true);
        expect(find.byKey(const ValueKey('code-hint-e')), findsOneWidget);
        expect(find.text(s.actDelivered), findsOneWidget);
        expect(find.text(s.collectCash(s.usd(20))), findsOneWidget);
        expect(find.byKey(const ValueKey('fail-e')), findsOneWidget);
        expect(find.byKey(const ValueKey('handover-e')), findsNothing);
        expect(find.text(s.collectAt('27, avenue Kasa-Vubu, Bandalungwa')), findsNothing, reason: 'the parcel is already with the rider');
      });

      testWidgets('a prepaid express order says so instead of asking for cash ($lang)', (t) async {
        await show(t, lang, [leg('express', id: 'e', status: 'in_transit')]);
        expect(find.text(s.alreadyPaid), findsOneWidget);
      });

      testWidgets('a part of the order: only the leg\'s lines and the "Part of the order" badge ($lang)', (t) async {
        final part = DeliveryTaskDto.fromJson(legJson('delivery', id: 'p', partial: true, orderItems: [
          {'productName': 'Écouteurs sans fil', 'qty': 1},
        ]));
        final whole = leg('delivery', id: 'w');
        await show(t, lang, [part, whole]);
        expect(part.partial, isTrue);
        expect(part.items.map((i) => i.name), ['Écouteurs sans fil']);
        expect(find.byKey(const ValueKey('partial-p')), findsOneWidget);
        expect(find.text(s.partOfOrder), findsOneWidget);
        expect(find.byKey(const ValueKey('partial-w')), findsNothing, reason: 'a leg that completes the order has no badge');
        expect(find.text('1× Écouteurs sans fil'), findsOneWidget, reason: 'the partial leg lists only its own line');
        expect(find.textContaining('Chaussures de course Air Comfort Pro'), findsOneWidget, reason: 'only the whole leg lists them (not the partial one)');
      });
    }

    testWidgets('express delivered: the cash dialog, the proof sheet, the code, then the call carries all of it', (t) async {
      await show(t, 'en', [leg('express', id: 'e', status: 'in_transit', cod: 20)], code: true);
      await t.tap(find.byKey(const ValueKey('next-e')));
      await t.pumpAndSettle();
      // cash first
      expect(find.byType(CashCollectDialog), findsOneWidget);
      final field = find.descendant(of: find.byType(CashCollectDialog), matching: find.byType(TextField));
      if (field.evaluate().isNotEmpty) await t.enterText(field.first, '20');
      await t.tap(find.descendant(of: find.byType(CashCollectDialog), matching: find.byType(FilledButton)).first);
      await t.pumpAndSettle();
      await continueWithoutProof(t);
      expect(find.byKey(const ValueKey('delivery-code-field')), findsOneWidget, reason: 'express asks the customer\'s code');
      await t.enterText(find.byKey(const ValueKey('delivery-code-field')), '4321');
      await t.tap(find.byKey(const ValueKey('delivery-code-submit')));
      await t.pumpAndSettle();
      final i = calls.indexOf('delivery:updateStatus');
      expect(i, isNonNegative);
      expect(sent[i]?['taskId'], 'e');
      expect(sent[i]?['status'], 'delivered');
      expect(sent[i]?['code'], '4321');
    });
  });

  group('partial legs and "Task updated"', () {
    test('order.partial and the leg\'s completesOrder both mark a partial leg; a whole leg is not partial', () {
      expect(DeliveryTaskDto.fromJson(legJson('delivery', partial: true)).partial, isTrue);
      expect(DeliveryTaskDto.fromJson({...legJson('delivery'), 'completesOrder': false}).partial, isTrue);
      expect(DeliveryTaskDto.fromJson(legJson('delivery')).partial, isFalse);
      expect(DeliveryTaskDto.fromJson({'id': 'old', 'kind': 'delivery'}).partial, isFalse, reason: 'an older server says nothing');
      expect(DeliveryTaskDto.fromJson({...legJson('express'), 'completesOrder': false}).partial, isTrue, reason: 'an express leg is a customer leg');
    });

    test('"Part of the order" never shows on a seller pickup, transfer or return, even when the order is split', () {
      for (final kind in ['pickup', 'transfer', 'return_pickup', 'return_transfer', 'return_to_seller']) {
        expect(DeliveryTaskDto.fromJson({...legJson(kind), 'completesOrder': false}).partial, isFalse, reason: kind);
        expect(DeliveryTaskDto.fromJson(legJson(kind, partial: true)).partial, isFalse, reason: '$kind with order.partial');
      }
    });

    test('a push without the order snapshot keeps what the list knew, unless it says whether the leg completes the order', () {
      final old = DeliveryTaskDto.fromJson(legJson('delivery', id: 'a', partial: true));
      final silent = DeliveryTaskDto.fromJson(legJson('delivery', id: 'a', status: 'picked_up', withOrder: false));
      expect(silent.withOrderFrom(old).partial, isTrue);
      // The rest of the order merged into the leg: the push says it now completes the order.
      final merged = DeliveryTaskDto.fromJson({...legJson('delivery', id: 'a', withOrder: false), 'completesOrder': true});
      expect(merged.withOrderFrom(old).partial, isFalse);
    });

    test('a merge: the push brings the new cash and lines at once, the order snapshot is kept', () {
      final store = RiderStore.instance;
      store.myTasks.add(DeliveryTaskDto.fromJson(legJson('delivery', id: 'a', cod: 10, partial: true, orderItems: [
        {'productName': 'Écouteurs sans fil', 'qty': 1},
      ])));
      store.applyTaskPush({
        ...legJson('delivery', id: 'a', cod: 32.5, withOrder: false),
        'items': [
          {'orderItemId': 'i1', 'productId': 'p1', 'name': 'Chaussures de course Air Comfort Pro', 'qty': 2},
          {'orderItemId': 'i2', 'productId': 'p2', 'name': 'Écouteurs sans fil', 'qty': 1},
        ],
        'completesOrder': true,
      });
      final t = store.myTasks.single;
      expect(t.codAmountUsd, 32.5);
      expect(t.items.map((i) => i.qty), [2, 1]);
      expect(t.partial, isFalse);
      expect(t.customerName, 'Aline Kabila Mwamba');
    });

    test('"Task updated" re-reads the tasks (items and cash); other notices do not', () async {
      final store = RiderStore.instance;
      expect(RiderStore.isTaskUpdatedNotice('Task updated'), isTrue);
      expect(RiderStore.isTaskUpdatedNotice('New task assigned to you'), isFalse);

      store.applyNotificationPush({'id': 'n0', 'title': 'Order update', 'body': 'x', 'type': 'order'});
      await Future<void>.delayed(const Duration(milliseconds: 500));
      expect(calls, isNot(contains('rider:tasks')));

      store.applyNotificationPush({'id': 'n1', 'title': 'Task updated', 'body': 'SOM-1042: more parcels were added to it.', 'type': 'task', 'entityId': 'a'});
      expect(store.notifications.first.title, 'Task updated');
      await Future<void>.delayed(const Duration(milliseconds: 900));
      expect(calls, contains('rider:tasks'));
      expect(calls, contains('rider:workStats'));
    });

    test('"Task updated" is shown in French', () {
      expect(localizeNotification(const Strings('fr'), 'Task updated', 'SOM-1042: x').$1, 'Tâche mise à jour');
      expect(localizeNotification(const Strings('en'), 'Task updated', 'x').$1, 'Task updated');
    });
  });

  group('status errors', () {
    const fr = Strings('fr');

    test('"A ..." and "An ..." are both read: the article follows the leg kind', () {
      expect(translateServerError('A pickup that is picked up cannot become assigned.', fr), 'Une collecte « récupérée » ne peut pas passer à « assignée ».');
      expect(translateServerError('An express delivery that is in transit cannot become picked up.', fr),
          'Une livraison express « en route » ne peut pas passer à « récupérée ».');
      expect(translateServerError('A delivery that is delivered cannot become failed.', fr), 'Une livraison « livrée » ne peut pas passer à « échouée ».');
      expect(translateServerError('An express delivery that is delivered cannot become failed.', const Strings('en')), 'An express delivery that is delivered cannot become failed.');
    });

    test('the older wording still works, with either article', () {
      expect(translateServerError('A picked up delivery cannot become delivered.', fr), contains('récupérée'));
      expect(translateServerError('An in transit delivery cannot become failed.', fr), contains('en route'));
    });

    test('the cancel guard after a partial delivery is French', () {
      expect(translateServerError('Part of this order was already delivered. Contact support to stop the rest.', fr), startsWith('Une partie de cette commande'));
    });
  });
}
