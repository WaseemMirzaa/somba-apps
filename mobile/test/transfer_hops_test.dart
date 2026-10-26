// Multi-warehouse transfers (docs/contracts/areas.md, "Multi-warehouse transfers"): the customer's tracking shows one
// step per hop with the warehouse names and times, the checkout shows the route and the transit time when the quote has
// them, and payloads from before hops still behave as before.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/server_errors.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/checkout_screen.dart';
import 'package:lipcart/screens/more/order_screens.dart';
import 'package:lipcart/services/delivery_quote.dart';
import 'package:lipcart/services/hub_directory.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/util/delivery_estimate.dart';
import 'package:lipcart/util/journey.dart';

import 'gap_helpers.dart';

Map<String, dynamic> _leg(String kind, String status, {String? pickedUp, String? received, int? hop, int? hops, String? from, String? to}) => {
      'kind': kind,
      'status': status,
      if (pickedUp != null) 'pickedUpAt': pickedUp,
      if (received != null) 'receivedAt': received,
      if (hop != null) 'hop': hop,
      if (hops != null) 'hops': hops,
      if (from != null) 'fromHubName': from,
      if (to != null) 'toHubName': to,
    };

const _pickup = {'kind': 'pickup', 'status': 'delivered', 'pickedUpAt': '2026-10-24T08:00:00Z', 'receivedAt': '2026-10-24T09:00:00Z'};

OrderDto _order(String status, List<Map<String, dynamic>> legs, {Object? routes, String origin = 'hub-limete', String dest = 'hub-kikwit'}) => OrderDto.fromJson({
      'id': 'o1',
      'reference': 'SOM-2077',
      'status': status,
      'paymentMethod': 'wallet',
      'totalUsd': 10,
      'updatedAt': '2026-10-26T09:30:00Z',
      'destinationHubId': dest,
      'originHubIds': [origin],
      if (routes != null) 'routeBySeller': routes,
      'tracking': {'legs': legs},
      'items': [
        {'productId': 'p1', 'productName': 'Item', 'qty': 1, 'priceUsd': 10, 'sellerId': 's1', 'fulfilment': 'received', 'receivedAt': '2026-10-24T09:00:00Z'}
      ],
    });

Map<String, JourneyStep> _byKey(List<JourneyStep> steps) => {for (final s in steps) '${s.key}${s.hop ?? ''}': s};

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  tearDown(() {
    HubDirectory.instance.debugSet(const []);
    gapTearDown();
  });

  group('the journey of a relayed parcel (2 hops)', () {
    test('hop 1 on the road: a step per hop, the first one current; the rest wait', () {
      final steps = orderJourney(_order('shipped', [
        _pickup,
        _leg('transfer', 'in_transit', pickedUp: '2026-10-24T11:00:00Z', hop: 1, hops: 2, from: 'Entrepôt Limete', to: 'Entrepôt Kinshasa'),
      ]));
      expect(steps.map((s) => s.key), ['picked_up', 'at_origin', 'in_transfer', 'at_hub', 'in_transfer', 'at_destination', 'out_for_delivery', 'delivered']);
      final hop1 = steps[2];
      expect((hop1.hop, hop1.hops), (1, 2));
      expect(hop1.hubNames, ['Entrepôt Kinshasa']);
      expect(hop1.current, isTrue);
      expect(hop1.done, isFalse);
      expect(hop1.at, DateTime.parse('2026-10-24T11:00:00Z').toLocal());
      expect(steps[3].key, 'at_hub');
      expect(steps[3].done, isFalse);
      expect(steps[4].hop, 2);
      expect(steps[4].hubNames, isEmpty, reason: 'the second hop does not exist yet: nothing to name');
      expect(steps[4].done, isFalse);
      expect(steps.where((s) => s.current), hasLength(1));
      expect(steps[1].done, isTrue);
    });

    test('hop 1 received, hop 2 on the road: the relay warehouse is done with its time, hop 2 is current', () {
      final steps = orderJourney(_order('shipped', [
        _pickup,
        _leg('transfer', 'delivered', pickedUp: '2026-10-24T11:00:00Z', received: '2026-10-24T15:00:00Z', hop: 1, hops: 2, from: 'Entrepôt Limete', to: 'Entrepôt Kinshasa'),
        _leg('transfer', 'in_transit', pickedUp: '2026-10-25T07:00:00Z', hop: 2, hops: 2, from: 'Entrepôt Kinshasa', to: 'Entrepôt Kikwit'),
      ]));
      final m = _byKey(steps);
      expect(m['in_transfer1']!.done, isTrue);
      expect(m['at_hub1']!.done, isTrue);
      expect(m['at_hub1']!.at, DateTime.parse('2026-10-24T15:00:00Z').toLocal());
      expect(m['at_hub1']!.hubNames, ['Entrepôt Kinshasa']);
      expect(m['in_transfer2']!.current, isTrue);
      expect(m['in_transfer2']!.hubNames, ['Entrepôt Kikwit']);
      expect(m['in_transfer2']!.at, DateTime.parse('2026-10-25T07:00:00Z').toLocal());
      expect(m['at_destination']!.done, isFalse);
    });

    test('hop 1 scanned in and the next hop not created yet: not at the destination', () {
      final steps = orderJourney(_order('shipped', [
        _pickup,
        _leg('transfer', 'delivered', pickedUp: '2026-10-24T11:00:00Z', received: '2026-10-24T15:00:00Z', hop: 1, hops: 2, from: 'Entrepôt Limete', to: 'Entrepôt Kinshasa'),
      ]));
      final m = _byKey(steps);
      expect(m['at_hub1']!.done, isTrue);
      expect(m['at_destination']!.done, isFalse, reason: 'the parcel still has to travel to the delivering warehouse');
      expect(m['in_transfer2']!.current, isTrue);
    });

    test('both hops done: at the destination with the last scan time, then out for delivery', () {
      final steps = orderJourney(_order('out_for_delivery', [
        _pickup,
        _leg('transfer', 'delivered', pickedUp: '2026-10-24T11:00:00Z', received: '2026-10-24T15:00:00Z', hop: 1, hops: 2, to: 'Entrepôt Kinshasa'),
        _leg('transfer', 'delivered', pickedUp: '2026-10-25T07:00:00Z', received: '2026-10-25T19:00:00Z', hop: 2, hops: 2, to: 'Entrepôt Kikwit'),
        {'kind': 'delivery', 'status': 'in_transit', 'pickedUpAt': '2026-10-26T08:00:00Z'},
      ]));
      final m = _byKey(steps);
      expect(m['at_destination']!.done, isTrue);
      expect(m['at_destination']!.at, DateTime.parse('2026-10-25T19:00:00Z').toLocal());
      expect(m['out_for_delivery']!.done, isTrue);
      expect(m['delivered']!.current, isTrue);
      expect(steps.where((s) => s.key != 'delivered').every((s) => s.done), isTrue);
    });

    test('the planned route names the warehouses before any leg exists (ids, resolved by the screen)', () {
      final steps = orderJourney(_order('shipped', [_pickup], routes: {
        's1': ['hub-limete', 'hub-kin', 'hub-kikwit']
      }));
      final m = _byKey(steps);
      expect(m['in_transfer1']!.hubIds, ['hub-kin']);
      expect(m['in_transfer2']!.hubIds, ['hub-kikwit']);
      expect(m['at_hub1']!.hubIds, ['hub-kin']);
      expect(steps.map((s) => s.key).where((k) => k == 'in_transfer'), hasLength(2));
    });

    test('three hops give three transfer steps and two relay steps', () {
      final steps = orderJourney(_order('shipped', [_pickup], routes: {
        's1': ['a', 'b', 'c', 'd']
      }));
      expect(steps.where((s) => s.key == 'in_transfer'), hasLength(3));
      expect(steps.where((s) => s.key == 'at_hub'), hasLength(2));
    });

    test('route payloads in odd shapes are ignored; the routes may arrive as JSON text', () {
      expect(OrderDto.fromJson({'id': 'o', 'routeBySeller': 'nope'}).routeBySeller, isEmpty);
      expect(OrderDto.fromJson({'id': 'o', 'routeBySeller': {'s1': 'x'}}).routeBySeller, isEmpty);
      expect(OrderDto.fromJson({'id': 'o', 'routeBySeller': '{"s1":["a","b"]}'}).routeBySeller, {'s1': ['a', 'b']});
    });
  });

  group('each hop has its own driver', () {
    final legs = [
      _pickup,
      {..._leg('transfer', 'delivered', pickedUp: '2026-10-24T11:00:00Z', received: '2026-10-24T15:00:00Z', hop: 1, hops: 2, to: 'Entrepôt Kinshasa'), 'riderFirstName': 'Jean'},
      {..._leg('transfer', 'in_transit', pickedUp: '2026-10-25T07:00:00Z', hop: 2, hops: 2, to: 'Entrepôt Kikwit'), 'riderFirstName': 'Marie'},
    ];

    test('the steps carry the first name of the driver of their own hop', () {
      final m = _byKey(orderJourney(_order('shipped', legs)));
      expect(m['in_transfer1']!.drivers, ['Jean']);
      expect(m['in_transfer2']!.drivers, ['Marie']);
      expect(m['at_hub1']!.drivers, isEmpty, reason: 'the relay warehouse step is about the place, not the driver');
    });

    test('a full name is cut to the first name; other field names the server may use are read', () {
      final l = OrderLeg.fromJson({'kind': 'transfer', 'status': 'delivered', 'riderName': 'Jean-Pierre Mukendi'});
      expect(l.driverFirstName, 'Jean-Pierre');
      expect(OrderLeg.fromJson({'kind': 'transfer', 'status': 'x', 'driverFirstName': 'Awa'}).driverFirstName, 'Awa');
      expect(OrderLeg.fromJson({'kind': 'transfer', 'status': 'x'}).driverFirstName, isNull);
    });

    test('warehouses sent as objects ({id, name}) are read like the flat names', () {
      final l = OrderLeg.fromJson({
        'kind': 'transfer',
        'status': 'x',
        'hop': 1,
        'hops': 2,
        'fromHub': {'id': 'h1', 'name': 'Entrepôt Limete', 'city': 'Kinshasa'},
        'toHub': {'id': 'h2', 'name': 'Entrepôt Kinshasa'},
      });
      expect((l.fromHubId, l.fromHubName, l.toHubId, l.toHubName), ('h1', 'Entrepôt Limete', 'h2', 'Entrepôt Kinshasa'));
    });

    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);
      testWidgets('two hops by two drivers: the tracking names Jean on hop 1 and Marie on hop 2 ($lang)', (t) async {
        await gapReset(lang: lang);
        gapTallViewport(t);
        await Strings.setLang(lang, persist: false);
        final o = _order('shipped', legs);
        RealtimeStore.instance.orders
          ..clear()
          ..add(o);
        await t.pumpWidget(gapApp(OrderTrackingScreen(locale: Locale(lang), orderId: o.id), lang: lang));
        await t.pump(const Duration(milliseconds: 300));
        final left1 = s.when(DateTime.parse('2026-10-24T11:00:00Z').toLocal());
        final left2 = s.when(DateTime.parse('2026-10-25T07:00:00Z').toLocal());
        expect(find.text('${s.journeyDriver('Jean')} · $left1'), findsOneWidget);
        expect(find.text('${s.journeyDriver('Marie')} · $left2'), findsOneWidget);
        expect(find.text(lang == 'en' ? 'Driver: Jean · $left1' : 'Livreur : Jean · $left1'), findsOneWidget);
      });
    }

    testWidgets('without driver names the steps are unchanged', (t) async {
      await gapReset();
      gapTallViewport(t);
      final o = _order('shipped', [
        _pickup,
        _leg('transfer', 'in_transit', pickedUp: '2026-10-24T11:00:00Z', hop: 1, hops: 2, to: 'Entrepôt Kinshasa'),
      ]);
      RealtimeStore.instance.orders
        ..clear()
        ..add(o);
      await t.pumpWidget(gapApp(OrderTrackingScreen(locale: const Locale('en'), orderId: o.id), lang: 'en'));
      await t.pump(const Duration(milliseconds: 300));
      expect(find.textContaining('Driver:'), findsNothing);
    });
  });

  group('payloads without hops', () {
    test('a single transfer leg with no hop numbers is the one transfer step, as before', () {
      final steps = orderJourney(_order('shipped', [
        _pickup,
        _leg('transfer', 'in_transit', pickedUp: '2026-10-24T11:00:00Z'),
      ]));
      expect(steps.map((s) => s.key), ['picked_up', 'at_origin', 'in_transfer', 'at_destination', 'out_for_delivery', 'delivered']);
      expect(steps[2].hop, isNull);
      expect(steps[2].current, isTrue);
    });

    test('a one-hop route (hops: 1) is the one transfer step too', () {
      final steps = orderJourney(_order('shipped', [
        _pickup,
        _leg('transfer', 'in_transit', pickedUp: '2026-10-24T11:00:00Z', hop: 1, hops: 1, to: 'Entrepôt Kinshasa'),
      ], routes: {
        's1': ['hub-limete', 'hub-kikwit']
      }));
      expect(steps.where((s) => s.key == 'in_transfer'), hasLength(1));
      expect(steps.any((s) => s.key == 'at_hub'), isFalse);
    });

    test('a quote without hops has no route and no transit', () {
      final q = DeliveryQuote.fromJson(gapQuoteJson());
      expect(q.routes, isEmpty);
      expect((q.relayed, q.transitHours), (false, 0));
    });
  });

  group('the tracking screen', () {
    Future<void> open(WidgetTester t, String lang, OrderDto o) async {
      gapTallViewport(t);
      await Strings.setLang(lang, persist: false);
      final store = RealtimeStore.instance;
      store.orders
        ..clear()
        ..add(o);
      await t.pumpWidget(gapApp(OrderTrackingScreen(locale: Locale(lang), orderId: o.id), lang: lang));
      await t.pump(const Duration(milliseconds: 300));
    }

    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);
      testWidgets('two hops: "$lang" shows a step per hop with the warehouse and the time', (t) async {
        await gapReset(lang: lang);
        final order = _order('shipped', [
          _pickup,
          _leg('transfer', 'delivered', pickedUp: '2026-10-24T11:00:00Z', received: '2026-10-24T15:00:00Z', hop: 1, hops: 2, from: 'Entrepôt Limete', to: 'Entrepôt Kinshasa'),
          _leg('transfer', 'in_transit', pickedUp: '2026-10-25T07:00:00Z', hop: 2, hops: 2, from: 'Entrepôt Kinshasa', to: 'Entrepôt Kikwit'),
        ]);
        await open(t, lang, order);
        expect(find.text(s.journeyHopTransfer('Entrepôt Kinshasa')), findsOneWidget);
        expect(find.text(lang == 'en' ? 'In transfer to Entrepôt Kinshasa' : 'En transfert vers Entrepôt Kinshasa'), findsOneWidget);
        expect(find.text(s.journeyHopAt('Entrepôt Kinshasa')), findsOneWidget);
        expect(find.text(lang == 'en' ? 'At Entrepôt Kinshasa' : 'À Entrepôt Kinshasa'), findsOneWidget);
        expect(find.text(s.journeyHopTransfer('Entrepôt Kikwit')), findsOneWidget);
        expect(find.text(s.journeyAtDestination), findsOneWidget);
        // the relay warehouse shows when the parcel was scanned in; the hop on the road, when it left
        expect(find.text(s.when(DateTime.parse('2026-10-24T15:00:00Z').toLocal())), findsOneWidget);
        expect(find.text(s.when(DateTime.parse('2026-10-25T07:00:00Z').toLocal())), findsOneWidget);
        expect(find.text(s.trackCurrent), findsNothing, reason: 'the current step has a time to show instead');
      });

      testWidgets('a transfer on the road is ticked; the step after it waits; "Up next" marks the next step with nothing to show ($lang)', (t) async {
        await gapReset(lang: lang);
        await open(t, lang, _order('shipped', [
          _pickup,
          _leg('transfer', 'in_transit', pickedUp: '2026-10-24T11:00:00Z', from: 'Entrepôt Limete', to: 'Entrepôt Kikwit'),
        ]));
        // placed, picked up, at the origin warehouse and the transfer under way
        expect(find.byIcon(Icons.check_rounded), findsNWidgets(4));
        expect(find.text(s.trackCurrent), findsNothing);
        await open(t, lang, _order('shipped', [
          _pickup,
          _leg('transfer', 'delivered', pickedUp: '2026-10-24T11:00:00Z', received: '2026-10-24T15:00:00Z', from: 'Entrepôt Limete', to: 'Entrepôt Kikwit'),
        ]));
        expect(find.byIcon(Icons.check_rounded), findsNWidgets(5), reason: 'at your warehouse now');
        expect(find.text(s.journeyNext), findsOneWidget, reason: 'out for delivery is next and has no time yet');
        expect(find.text(lang == 'en' ? 'Up next' : 'Prochaine étape'), findsOneWidget);
      });

      testWidgets('planned route names (ids) are resolved from the warehouse directory ($lang)', (t) async {
        await gapReset(lang: lang);
        HubDirectory.instance.debugSet(const [
          HubInfo(id: 'hub-limete', name: 'Entrepôt Limete'),
          HubInfo(id: 'hub-kin', name: 'Entrepôt Kinshasa'),
          HubInfo(id: 'hub-kikwit', name: 'Entrepôt Kikwit'),
        ]);
        await open(t, lang, _order('shipped', [_pickup], routes: {
          's1': ['hub-limete', 'hub-kin', 'hub-kikwit']
        }));
        expect(find.text(s.journeyHopTransfer('Entrepôt Kinshasa')), findsOneWidget);
        expect(find.text(s.journeyHopAt('Entrepôt Kinshasa')), findsOneWidget);
        expect(find.text(s.journeyHopTransfer('Entrepôt Kikwit')), findsOneWidget);
      });

      testWidgets('an older order (one transfer, no hops) reads as before ($lang)', (t) async {
        await gapReset(lang: lang);
        await open(t, lang, _order('shipped', [_pickup, _leg('transfer', 'in_transit', pickedUp: '2026-10-24T11:00:00Z')]));
        expect(find.text(s.journeyInTransfer), findsOneWidget);
        expect(find.textContaining('Entrepôt'), findsNothing);
        expect(find.text(s.journeyHopRelay), findsNothing);
      });

      testWidgets('without names a middle hop is "the next warehouse" and the relay is a relay warehouse ($lang)', (t) async {
        await gapReset(lang: lang);
        await open(t, lang, _order('shipped', [
          _pickup,
          _leg('transfer', 'in_transit', pickedUp: '2026-10-24T11:00:00Z', hop: 1, hops: 2),
        ]));
        expect(find.text(s.journeyHopNext), findsOneWidget);
        expect(find.text(s.journeyHopRelay), findsOneWidget);
        expect(find.text(s.journeyInTransfer), findsOneWidget, reason: 'the last hop goes to the customer\'s warehouse');
      });
    }
  });

  group('the quote with hops at checkout', () {
    Map<String, dynamic> hops({double transit = 28, bool two = true}) => {
          ...gapQuoteJson(fee: 7, transfer: 2),
          'transitHours': transit,
          'origins': [
            {
              'sellerId': 's1',
              'hubId': 'hub-limete',
              'hubName': 'Entrepôt Limete',
              'areaName': 'Limete',
              'hops': [
                {'fromHubId': 'hub-limete', 'fromHubName': 'Entrepôt Limete', 'toHubId': 'hub-kin', 'toHubName': 'Entrepôt Kinshasa'},
                if (two) {'fromHubId': 'hub-kin', 'fromHubName': 'Entrepôt Kinshasa', 'toHubId': 'hub-kikwit', 'toHubName': 'Entrepôt Kikwit'},
              ],
            },
            {
              'sellerId': 's2',
              'hubId': 'hub-limete',
              'hubName': 'Entrepôt Limete',
              'hops': [
                {'fromHubId': 'hub-limete', 'fromHubName': 'Entrepôt Limete', 'toHubId': 'hub-kin', 'toHubName': 'Entrepôt Kinshasa'},
                if (two) {'fromHubId': 'hub-kin', 'fromHubName': 'Entrepôt Kinshasa', 'toHubId': 'hub-kikwit', 'toHubName': 'Entrepôt Kikwit'},
              ],
            },
          ],
        };

    test('the routes are the distinct chains of names', () {
      final q = DeliveryQuote.fromJson(hops());
      expect(q.routes, [
        ['Entrepôt Limete', 'Entrepôt Kinshasa', 'Entrepôt Kikwit']
      ]);
      expect(q.relayed, isTrue);
      expect(q.transitHours, 28);
      expect(DeliveryQuote.fromJson(hops(two: false)).relayed, isFalse, reason: 'one hop is a plain transfer');
    });

    test('the estimate grows by the server\'s extra days, else by the transit time in whole days', () {
      expect(DeliveryQuote.fromJson({...hops(transit: 52), 'extraDays': 5}).estimateExtraDays, 5);
      expect(DeliveryQuote.fromJson(hops(transit: 52)).estimateExtraDays, 3);
      expect(DeliveryQuote.fromJson(gapQuoteJson()).estimateExtraDays, 0);
    });

    test('transit time is worded in hours, or in days from two days', () {
      const en = Strings('en'), fr = Strings('fr');
      expect(en.checkoutTransit(28), 'About 28 h in transit between warehouses');
      expect(fr.checkoutTransit(4.2), 'Environ 5 h de transit entre les entrepôts');
      expect(en.checkoutTransit(72), 'About 3 days in transit between warehouses');
      expect(fr.checkoutTransit(60), 'Environ 3 jours de transit entre les entrepôts');
    });

    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);

      testWidgets('shows the route and the transit time, and the estimate grows by the transit days ($lang)', (t) async {
        await gapReset(lang: lang);
        final store = RealtimeStore.instance;
        store.addresses.add(AddressDto(id: 'a1', label: 'Home', line1: '12 Avenue de la Paix', city: 'Kikwit', isDefault: true, geo: (lat: -5.04, lng: 18.8, placeId: null, formatted: null)));
        store.debugCallRequest = gapCalls(quote: (_) => hops(transit: 52));
        ShopState.instance.addToCart(productByUuid('p1')!);
        gapTallViewport(t);
        await t.pumpWidget(gapApp(CheckoutScreen(locale: Locale(lang)), lang: lang));
        await t.pump(const Duration(milliseconds: 300));
        expect(find.byKey(const ValueKey('checkout-route-0')), findsOneWidget);
        expect(find.text(s.checkoutRoute('Entrepôt Limete → Entrepôt Kinshasa → Entrepôt Kikwit')), findsOneWidget);
        expect(find.byKey(const ValueKey('checkout-route-1')), findsNothing, reason: 'two sellers, one route: shown once');
        expect(find.text(s.checkoutTransit(52)), findsOneWidget);
        final shown = t.widget<Text>(find.byKey(const ValueKey('delivery-estimate'))).data;
        expect(shown, dayLabel(estimateFor([p1Days()], null, deliveryTotalDaysMax, 3), lang), reason: '52 h of transit = 3 more days');
      });

      testWidgets('no route lines for a quote without hops ($lang)', (t) async {
        await gapReset(lang: lang);
        final store = RealtimeStore.instance;
        store.addresses.add(AddressDto(id: 'a1', label: 'Home', line1: '12 Avenue de la Paix', city: 'Kinshasa', isDefault: true, geo: (lat: -4.3, lng: 15.3, placeId: null, formatted: null)));
        ShopState.instance.addToCart(productByUuid('p1')!);
        gapTallViewport(t);
        await t.pumpWidget(gapApp(CheckoutScreen(locale: Locale(lang)), lang: lang));
        await t.pump(const Duration(milliseconds: 300));
        expect(find.byKey(const ValueKey('checkout-route-0')), findsNothing);
        expect(find.byKey(const ValueKey('checkout-transit')), findsNothing);
        expect(find.text(s.checkoutFromHub('Kinshasa Hub')), findsOneWidget);
      });
    }
  });

  group('transfer errors in French', () {
    const fr = Strings('fr');
    test('every error of the contract has a French text', () {
      expect(translateServerError('This run has already left.', fr), 'Cette tournée est déjà partie.');
      expect(translateServerError('Only parcels waiting at this warehouse can join this run.', fr), contains('rejoindre cette tournée'));
      expect(translateServerError('Choose a driver for this run first.', fr), 'Choisissez d’abord un livreur pour cette tournée.');
      expect(translateServerError('Parcel missing from run TR-0042.', fr), 'Colis manquant dans la tournée TR-0042.');
      expect(translateServerError('These warehouses are not connected by any lane.', fr), 'Ces entrepôts ne sont reliés par aucune ligne.');
      expect(translateServerError('Parcel missing from run TR-0042.', const Strings('en')), 'Parcel missing from run TR-0042.');
    });
  });
}

/// The delivery days of the shared fixture's product p1 (the checkout estimates from them).
int p1Days() => productByUuid('p1')!.shipDays;
