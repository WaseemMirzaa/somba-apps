// The delivery model on the customer's side (docs/contracts/logistics.md sections 15-16, and the express leg):
// delivery time = the seller's preparation + the platform's transit (the quote's own `estimatedDeliveryDate` is what checkout
// shows), split delivery (part of the order delivered, the rest still coming, one open leg at a time, a new code per leg),
// and express (straight from the store to the customer, no warehouse).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/notification_text.dart';
import 'package:lipcart/l10n/server_errors.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/checkout_screen.dart';
import 'package:lipcart/screens/more/order_screens.dart';
import 'package:lipcart/services/delivery_quote.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/widgets/delivery_legs.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/util/delivery_estimate.dart';
import 'package:lipcart/util/format.dart';
import 'package:lipcart/util/journey.dart';

import 'gap_helpers.dart';

Map<String, dynamic> _item(String id, String productId, String name, {String seller = 's1', String? deliveredAt, String fulfilment = 'received', int qty = 1}) => {
      'id': id,
      'productId': productId,
      'productName': name,
      'variant': 'Default',
      'qty': qty,
      'priceUsd': 10,
      'sellerId': seller,
      'sellerName': seller == 's1' ? 'Boutique Kin' : 'Mama Tech',
      'fulfilment': fulfilment,
      if (deliveredAt != null) 'deliveredAt': deliveredAt,
    };

Map<String, dynamic> _leg(String kind, String status,
        {List<Map<String, dynamic>> items = const [], bool? completes, List<String?>? sellerIds, String? pickedUpAt, String? deliveredAt}) =>
    {
      'id': 'leg-$kind-$status-${items.length}',
      'kind': kind,
      'status': status,
      if (items.isNotEmpty) 'items': items,
      if (completes != null) 'completesOrder': completes,
      if (sellerIds != null) 'sellerIds': sellerIds,
      if (pickedUpAt != null) 'pickedUpAt': pickedUpAt,
      if (deliveredAt != null) 'deliveredAt': deliveredAt,
    };

Map<String, dynamic> _orderJson({
  String status = 'processing',
  List<Map<String, dynamic>>? items,
  List<Map<String, dynamic>>? legs,
  Map<String, dynamic> extra = const {},
}) =>
    {
      'id': 'o1',
      'reference': 'SOM-1',
      'customerName': 'Aline',
      'status': status,
      'paymentMethod': 'wallet',
      'subtotalUsd': 20,
      'deliveryFeeUsd': 3,
      'totalUsd': 23,
      'createdAt': '2026-10-01T09:30:00Z',
      'destinationHubId': 'hub-a',
      'originHubIds': ['hub-a'],
      'items': items ?? [_item('i1', 'p1', 'Phone case'), _item('i2', 'p2', 'Charger', seller: 's2')],
      if (legs != null) 'tracking': {'legs': legs},
      ...extra,
    };

OrderDto _order({String status = 'processing', List<Map<String, dynamic>>? items, List<Map<String, dynamic>>? legs, Map<String, dynamic> extra = const {}}) =>
    OrderDto.fromJson(_orderJson(status: status, items: items, legs: legs, extra: extra));

/// A split order: the phone case reached the customer, the charger is still coming.
OrderDto _split({bool? flag, List<Map<String, dynamic>>? legs}) => _order(
      extra: {if (flag != null) 'partiallyDelivered': flag},
      items: [
        _item('i1', 'p1', 'Phone case', deliveredAt: '2026-10-02T10:00:00Z'),
        _item('i2', 'p2', 'Charger', seller: 's2'),
      ],
      legs: legs ??
          [
            _leg('delivery', 'delivered', items: [
              {'orderItemId': 'i1', 'qty': 1}
            ], completes: false, sellerIds: ['s1'], deliveredAt: '2026-10-02T10:00:00Z'),
            _leg('delivery', 'assigned', items: [
              {'orderItemId': 'i2', 'qty': 1}
            ], completes: true, sellerIds: ['s2']),
          ],
    );

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  tearDown(gapTearDown);

  group('models', () {
    test('a product carries prepDays next to the total; an older server has none', () {
      final p = ProductDto.fromJson({'id': 'p', 'name': 'X', 'price': 1, 'prepDays': 2, 'sellerHandlingDays': 1, 'totalDeliveryDays': 4, 'deliveryDays': 3});
      expect(p.prepDays, 2);
      expect(p.totalDeliveryDays, 4);
      expect(p.deliveryDays, 3, reason: 'the legacy field (prep + local) is kept as the fallback');
      expect(ProductDto.fromJson({'id': 'p', 'name': 'X', 'price': 1, 'prepDays': 0}).prepDays, 0, reason: 'no preparation is a real value');
      expect(ProductDto.fromJson({'id': 'p', 'name': 'X', 'price': 1}).prepDays, isNull);
      expect(ProductDto.fromJson({'id': 'p', 'name': 'X', 'price': 1, 'prepDays': -3}).prepDays, isNull);
      expect(productFromDto(p).prepDays, 2);
      expect(productFromDto(p).shipDays, 4);
    });

    test('the quote carries the server estimate, the mode and the split limit', () {
      final q = DeliveryQuote.fromJson({
        ...gapQuoteJson(fee: 5),
        'estimatedDeliveryDate': '2026-12-24',
        'prepDays': 2,
        'routeDays': 1,
        'estimateDays': 3,
        'deliveryMode': 'express',
        'express': true,
        'splitAfterHours': 24,
        'origins': [
          {'sellerId': 's1', 'prepDays': 2, 'routeDays': 1, 'estimatedDeliveryDate': '2026-12-24'}
        ],
      });
      expect((q.prepDays, q.routeDays, q.estimateDays), (2, 1, 3));
      expect(q.serverEstimateDay, '2026-12-24');
      expect(q.isExpress, isTrue);
      expect(q.deliveryMode, 'express');
      expect(q.splitAfterHours, 24);
      expect(q.origins.single.prepDays, 2);
      expect(q.origins.single.estimatedDeliveryDate, '2026-12-24');
    });

    test('an older quote has none of it: the old fields (extraDays, transit) still give the days', () {
      final q = DeliveryQuote.fromJson({...gapQuoteJson(), 'extraDays': 2});
      expect((q.prepDays, q.estimateDays, q.estimatedDeliveryDate, q.splitAfterHours), (null, null, null, null));
      expect(q.serverEstimateDay, isNull);
      expect(q.isExpress, isFalse);
      expect(q.estimateExtraDays, 2);
    });

    test('a malformed server date is not trusted', () {
      for (final bad in ['soon', '2026-12-4', '24/12/2026']) {
        expect(DeliveryQuote.fromJson({...gapQuoteJson(), 'estimatedDeliveryDate': bad}).serverEstimateDay, isNull, reason: bad);
      }
      expect(DeliveryQuote.fromJson({...gapQuoteJson(), 'express': false, 'deliveryMode': 'standard'}).isExpress, isFalse);
      expect(DeliveryQuote.fromJson({...gapQuoteJson(), 'deliveryMode': 'express'}).isExpress, isTrue, reason: 'either field says it');
    });

    test('order lines carry id and deliveredAt; a line is delivered only when live and stamped', () {
      final i = OrderItemDto.fromJson(_item('i1', 'p1', 'Phone case', deliveredAt: '2026-10-02T10:00:00Z'));
      expect(i.id, 'i1');
      expect(i.deliveredAt, isNotNull);
      expect(i.isDelivered, isTrue);
      expect(i.fulfilment, 'received', reason: 'fulfilment stays received for old clients');
      final cancelled = OrderItemDto.fromJson(_item('i2', 'p2', 'X', fulfilment: 'cancelled', deliveredAt: '2026-10-02T10:00:00Z'));
      expect(cancelled.isDelivered, isFalse);
      final plain = OrderItemDto.fromJson({'productId': 'p', 'productName': 'X', 'qty': 1, 'priceUsd': 1});
      expect((plain.id, plain.deliveredAt, plain.isDelivered), ('', null, false));
    });

    test('partiallyDelivered: the server flag wins; without it it is worked out from the lines', () {
      expect(_split(flag: true).partiallyDelivered, isTrue);
      expect(_split(flag: false).partiallyDelivered, isFalse);
      expect(_split().partiallyDelivered, isTrue, reason: 'one live line delivered, one not');
      expect(_order().partiallyDelivered, isFalse);
      final all = _order(items: [_item('i1', 'p1', 'A', deliveredAt: '2026-10-02T10:00:00Z')]);
      expect(all.partiallyDelivered, isFalse, reason: 'everything delivered is a delivered order, not a partial one');
      final cancelledRest = _order(items: [_item('i1', 'p1', 'A', deliveredAt: '2026-10-02T10:00:00Z'), _item('i2', 'p2', 'B', fulfilment: 'cancelled')]);
      expect(cancelledRest.partiallyDelivered, isFalse, reason: 'a cancelled line is not still coming');
      expect(_split().deliveredItems.map((i) => i.id), ['i1']);
      expect(_split().comingItems.map((i) => i.id), ['i2']);
    });

    test('legs carry sellerIds, items and completesOrder; older legs have none', () {
      final legs = _split().legs;
      expect(legs, hasLength(2));
      expect(legs.first.sellerIds, ['s1']);
      expect(legs.first.items.single.orderItemId, 'i1');
      expect(legs.first.completesOrder, isFalse);
      expect(legs.first.isPartial, isTrue);
      expect(legs.last.completesOrder, isTrue);
      expect(legs.last.isOpen, isTrue);
      expect(legs.first.isOpen, isFalse);
      final old = OrderLeg.fromJson({'kind': 'delivery', 'status': 'assigned'});
      expect(old.sellerIds, isNull);
      expect(old.items, isEmpty);
      expect((old.completesOrder, old.isPartial), (null, false));
      expect(OrderLeg.fromJson({'kind': 'delivery', 'status': 'x', 'sellerIds': [null, 's1', 5]}).sellerIds, [null, 's1', null]);
    });

    test('the delivery mode and the customer legs (delivery and express, not the pickups)', () {
      expect(_order().deliveryMode, 'standard');
      expect(_order(extra: {'deliveryMode': 'express'}).isExpress, isTrue);
      final o = _order(legs: [_leg('pickup', 'delivered'), _leg('transfer', 'delivered'), _leg('delivery', 'assigned'), _leg('express', 'assigned')]);
      expect(o.customerLegs.map((l) => l.kind), ['delivery', 'express']);
    });

    test('a delivered line makes the seller\'s package delivered; the other seller\'s is still at the hub', () {
      final o = _split();
      final pk = packagesOf(o);
      expect(pk.map((p) => p.status), ['delivered', 'at_hub']);
    });
  });

  group('the estimate shown', () {
    test('the server day when there is one, else the days added up as before', () {
      expect(checkoutEstimateDay('2026-12-24', [9, 9], extraDays: 5), '2026-12-24');
      final now = DateTime.utc(2026, 10, 1, 8);
      expect(checkoutEstimateDay(null, [2, 4], extraDays: 1, now: now), estimateFor([2, 4], now, deliveryTotalDaysMax, 1));
      expect(checkoutEstimateDay(null, [2, 4], now: now), '2026-10-05');
    });

    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);

      Future<void> openCheckout(WidgetTester t, Map<String, dynamic> quote) async {
        await gapReset(lang: lang);
        final store = RealtimeStore.instance;
        store.walletBalance = 1000;
        store.addresses.add(AddressDto(id: 'a1', label: 'Home', line1: '12 Avenue de la Paix', city: 'Kinshasa', commune: 'Gombe', isDefault: true, geo: (lat: -4.31, lng: 15.31, placeId: null, formatted: null)));
        store.debugCallRequest = gapCalls(quote: (_) => quote);
        ShopState.instance.addToCart(productByUuid('p1')!);
        gapTallViewport(t);
        await Strings.setLang(lang, persist: false);
        await t.pumpWidget(gapApp(CheckoutScreen(locale: Locale(lang)), lang: lang));
        await t.pump(const Duration(milliseconds: 300));
      }

      String shown(WidgetTester t, String key) => t.widget<Text>(find.byKey(ValueKey(key))).data!;

      testWidgets('checkout shows the quote\'s date, not the days summed on the phone ($lang)', (t) async {
        await openCheckout(t, {...gapQuoteJson(fee: 4), 'estimatedDeliveryDate': '2027-01-15', 'estimateDays': 9});
        expect(shown(t, 'delivery-estimate'), dayLabel('2027-01-15', lang));
        expect(shown(t, 'delivery-estimate-hint'), s.deliveryEstimateHint);
        expect(find.byKey(const ValueKey('checkout-express')), findsNothing);
      });

      testWidgets('an older quote (no date): the phone adds the days up, as before ($lang)', (t) async {
        await openCheckout(t, {...gapQuoteJson(fee: 4), 'extraDays': 2});
        expect(shown(t, 'delivery-estimate'), dayLabel(estimateFor([productByUuid('p1')!.shipDays], null, deliveryTotalDaysMax, 2), lang));
      });

      testWidgets('an express quote: the "Express delivery" note ("straight from the store", no price: the fee is the one commission row), no warehouse lines ($lang)', (t) async {
        await openCheckout(t, {
          ...gapQuoteJson(fee: 4.5, hub: 'Entrepôt Gombe'),
          'estimatedDeliveryDate': '2027-01-04',
          'deliveryMode': 'express',
          'express': true,
        });
        expect(shown(t, 'checkout-express'), s.orderExpressNote);
        expect(shown(t, 'checkout-express'), lang == 'en' ? 'Express delivery: straight from the store to you.' : 'Livraison express : directement de la boutique chez vous.');
        expect(find.textContaining(money(4.5)), findsWidgets, reason: 'the one fee row still carries the amount');
        expect(find.text(s.platformFee), findsOneWidget);
        expect(find.byKey(const ValueKey('checkout-hub')), findsNothing, reason: 'no warehouse on an express delivery');
        expect(find.byKey(const ValueKey('checkout-transfer')), findsNothing);
        expect(shown(t, 'delivery-estimate'), dayLabel('2027-01-04', lang));
        expect(shown(t, 'delivery-estimate-hint'), s.deliveryEstimateHintExpress);
      });
    }
  });

  group('order detail: a split order', () {
    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);

      Future<void> open(WidgetTester t, OrderDto o, {Future<dynamic> Function(String, [Map<String, dynamic>?])? calls}) async {
        await gapReset(lang: lang);
        final store = RealtimeStore.instance;
        store.orders
          ..clear()
          ..add(o);
        store.debugCallRequest = calls ?? gapCalls();
        gapTallViewport(t);
        await Strings.setLang(lang, persist: false);
        await t.pumpWidget(gapApp(OrderDetailScreen(locale: Locale(lang), orderId: o.id), lang: lang));
        await t.pump(const Duration(milliseconds: 400));
      }

      testWidgets('"Part of your order was delivered", the counts, and each line says delivered or still coming ($lang)', (t) async {
        await open(t, _split());
        expect(find.byKey(const ValueKey('partial-banner')), findsOneWidget);
        expect(find.text(s.orderPartDelivered), findsOneWidget);
        expect(t.widget<Text>(find.byKey(const ValueKey('partial-counts'))).data, s.orderPartCounts(1, 2, 1));
        expect(find.byKey(const ValueKey('order-line-delivered-p1')), findsOneWidget);
        expect(find.byKey(const ValueKey('order-line-coming-p2')), findsOneWidget);
        expect(find.text(s.lineDelivered), findsWidgets);
        expect(find.text(s.lineComing), findsOneWidget);
        // each seller's package has its own badge: one delivered, one still at the warehouse
        expect(find.descendant(of: find.byKey(const ValueKey('package-status-1')), matching: find.text(s.pkgStatusDelivered)), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('package-status-2')), matching: find.text(s.pkgStatusAtHub)), findsOneWidget);
      });

      testWidgets('each customer leg is listed: which delivery, its status, what it carries ($lang)', (t) async {
        await open(t, _split());
        expect(find.byKey(const ValueKey('delivery-legs')), findsOneWidget);
        expect(find.text(s.deliveryLegN(1, 2)), findsOneWidget);
        expect(find.text(s.deliveryLegN(2, 2)), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('delivery-leg-status-1')), matching: find.text(s.deliveryLegStatus('delivered'))), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('delivery-leg-status-2')), matching: find.text(s.deliveryLegStatus('assigned'))), findsOneWidget);
        expect(t.widget<Text>(find.byKey(const ValueKey('delivery-leg-items-1'))).data, 'Phone case');
        expect(t.widget<Text>(find.byKey(const ValueKey('delivery-leg-items-2'))).data, 'Charger');
        expect(find.text(s.deliveryLegLast), findsOneWidget, reason: 'the second leg completes the order');
      });

      testWidgets('a whole order with one customer leg shows neither the banner nor the legs list ($lang)', (t) async {
        await open(t, _order(legs: [_leg('delivery', 'assigned')]));
        expect(find.byKey(const ValueKey('partial-banner')), findsNothing);
        expect(find.byKey(const ValueKey('delivery-legs')), findsNothing);
        expect(find.text(s.lineComing), findsNothing);
      });

      testWidgets('an older server (no deliveredAt, no leg items): nothing new appears ($lang)', (t) async {
        await open(t, _order(items: [_item('i1', 'p1', 'A'), _item('i2', 'p2', 'B', seller: 's2')], legs: [
          {'kind': 'delivery', 'status': 'assigned'}
        ]));
        expect(find.byKey(const ValueKey('partial-banner')), findsNothing);
        expect(find.byKey(const ValueKey('delivery-legs')), findsNothing);
      });

      testWidgets('an express order says so, and its leg is the express delivery ($lang)', (t) async {
        await open(t, _order(status: 'shipped', extra: {'deliveryMode': 'express'}, items: [_item('i1', 'p1', 'Phone case')], legs: [_leg('express', 'in_transit', pickedUpAt: '2026-10-02T09:00:00Z')]));
        expect(t.widget<Text>(find.byKey(const ValueKey('order-express-note'))).data, s.orderExpressNote);
      });
    }

    testWidgets('the delivery code is asked again when a leg opens or closes, because it is new for each leg', (t) async {
      var code = '1111';
      final asked = <String>[];
      Future<dynamic> calls(String event, [Map<String, dynamic>? body]) async {
        if (event == 'orders:deliveryCode') {
          asked.add(code);
          return {'required': true, 'code': code};
        }
        return const <dynamic>[];
      }

      final first = _split(legs: [
        _leg('delivery', 'assigned', items: [
          {'orderItemId': 'i1', 'qty': 1}
        ], completes: false, sellerIds: ['s1']),
      ]);
      await gapReset();
      final store = RealtimeStore.instance;
      store.orders
        ..clear()
        ..add(first);
      store.debugCallRequest = calls;
      gapTallViewport(t);
      await t.pumpWidget(gapApp(OrderDetailScreen(orderId: 'o1')));
      await t.pump(const Duration(milliseconds: 400));
      expect(t.widget<Text>(find.byKey(const ValueKey('delivery-code'))).data, '1111');
      expect(asked, ['1111']);

      // The first leg is delivered; the order status does not change (still processing) but the next leg has a new code.
      code = '2222';
      store.orders
        ..clear()
        ..add(_split());
      store.notifyListeners();
      await t.pump(const Duration(milliseconds: 400));
      await t.pump(); // the answer arrives after the frame that asked for it
      expect(asked, ['1111', '2222'], reason: 'a changed leg list asks the server again');
      expect(t.widget<Text>(find.byKey(const ValueKey('delivery-code'))).data, '2222');

      // Nothing changed: no new request.
      store.notifyListeners();
      await t.pump(const Duration(milliseconds: 400));
      expect(asked, hasLength(2));
    });

    testWidgets('no code card when no leg is open and the status is not on the road', (t) async {
      await gapReset();
      final store = RealtimeStore.instance;
      store.orders
        ..clear()
        ..add(_order(status: 'delivered', legs: [_leg('delivery', 'delivered')]));
      var asked = 0;
      store.debugCallRequest = (event, [body]) async {
        if (event == 'orders:deliveryCode') asked++;
        return const <dynamic>[];
      };
      gapTallViewport(t);
      await t.pumpWidget(gapApp(OrderDetailScreen(orderId: 'o1')));
      await t.pump(const Duration(milliseconds: 400));
      expect(find.byKey(const ValueKey('delivery-code-card')), findsNothing);
      expect(asked, 0);
    });
  });

  group('layout', () {
    for (final lang in ['en', 'fr']) {
      testWidgets('a split order survives 200% text on a small phone, no overflow ($lang)', (t) async {
        await gapReset(lang: lang);
        final store = RealtimeStore.instance;
        store.orders
          ..clear()
          ..add(_split());
        store.debugCallRequest = gapCalls();
        t.view.physicalSize = const Size(320 * 3, 640 * 3);
        t.view.devicePixelRatio = 3;
        addTearDown(t.view.reset);
        await Strings.setLang(lang, persist: false);
        await t.pumpWidget(MediaQuery(
          data: const MediaQueryData(size: Size(320, 640), textScaler: TextScaler.linear(2.0)),
          child: gapApp(OrderDetailScreen(locale: Locale(lang), orderId: 'o1'), lang: lang),
        ));
        await t.pump(const Duration(milliseconds: 400));
        expect(find.byKey(const ValueKey('partial-banner')), findsOneWidget);
        await t.scrollUntilVisible(find.byKey(const ValueKey('delivery-leg-2')), 200, scrollable: find.byType(Scrollable).first);
        expect(find.byKey(const ValueKey('delivery-legs')), findsOneWidget);
        expect(t.takeException(), isNull);
      });
    }
  });

  group('tracking', () {
    testWidgets('the tracking screen lists the legs and the partial banner too', (t) async {
      await gapReset();
      final store = RealtimeStore.instance;
      store.orders
        ..clear()
        ..add(_split());
      store.debugCallRequest = gapCalls();
      gapTallViewport(t);
      await t.pumpWidget(gapApp(OrderTrackingScreen(orderId: 'o1')));
      await t.pump(const Duration(milliseconds: 400));
      expect(find.byKey(const ValueKey('partial-banner')), findsOneWidget);
      expect(find.byKey(const ValueKey('delivery-legs')), findsOneWidget);
    });
  });

  group('the express journey', () {
    test('seller -> you: picked up, out for delivery, delivered; no warehouse step', () {
      final o = _order(status: 'shipped', extra: {'deliveryMode': 'express'}, items: [_item('i1', 'p1', 'A')], legs: [_leg('express', 'picked_up', pickedUpAt: '2026-10-02T09:00:00Z')]);
      final steps = orderJourney(o);
      expect(steps.map((s) => s.key), ['picked_up', 'out_for_delivery', 'delivered']);
      expect(steps[0].done, isTrue);
      expect(steps[0].at, isNotNull);
      expect(steps[1].current, isTrue);
      expect(steps[2].done, isFalse);
      expect(steps.any((s) => const {'at_origin', 'in_transfer', 'at_destination', 'at_hub'}.contains(s.key)), isFalse);
    });

    test('while the rider is on the road and when it is delivered', () {
      final road = orderJourney(_order(status: 'out_for_delivery', extra: {'deliveryMode': 'express'}, items: [_item('i1', 'p1', 'A')], legs: [_leg('express', 'in_transit', pickedUpAt: '2026-10-02T09:00:00Z')]));
      expect(road.map((s) => s.done), [true, true, false]);
      expect(road.last.current, isTrue);
      final done = orderJourney(_order(
          status: 'delivered',
          extra: {'deliveryMode': 'express', 'updatedAt': '2026-10-02T12:00:00Z'},
          items: [_item('i1', 'p1', 'A', deliveredAt: '2026-10-02T12:00:00Z')],
          legs: [_leg('express', 'delivered', pickedUpAt: '2026-10-02T09:00:00Z', deliveredAt: '2026-10-02T12:00:00Z')]));
      expect(done.every((s) => s.done), isTrue);
      expect(done.last.at, isNotNull);
    });

    test('an express order with no legs yet is still the three-step journey; not before the pickup starts', () {
      expect(orderJourney(_order(status: 'processing', extra: {'deliveryMode': 'express'}, items: [_item('i1', 'p1', 'A', fulfilment: 'ready')])).map((s) => s.key),
          ['picked_up', 'out_for_delivery', 'delivered']);
      expect(orderJourney(_order(status: 'confirmed', extra: {'deliveryMode': 'express'})), isEmpty);
    });

    test('a standard split order: the partial leg on the road puts the order at "out for delivery"; the warehouse steps stay', () {
      final o = _split(legs: [
        _leg('delivery', 'delivered', completes: false, deliveredAt: '2026-10-02T10:00:00Z', pickedUpAt: '2026-10-02T09:00:00Z'),
        _leg('delivery', 'assigned', completes: true),
      ]);
      final steps = orderJourney(o);
      expect(steps.map((s) => s.key), contains('at_destination'));
      expect(steps.firstWhere((s) => s.key == 'out_for_delivery').done, isTrue, reason: 'a leg already went out');
    });
  });

  group('French and English text', () {
    test('every new text has both languages', () {
      for (final lang in ['en', 'fr']) {
        final s = Strings(lang);
        final texts = [
          s.platformFee,
          s.deliveryEstimateHintExpress,
          s.orderExpressNote,
          s.orderPartDelivered,
          s.orderPartCounts(1, 3, 2),
          s.lineDelivered,
          s.lineComing,
          s.deliveriesTitle,
          s.deliveryLegN(1, 2),
          s.deliveryLegExpress,
          s.deliveryLegItems(1),
          s.deliveryLegItems(3),
          s.deliveryLegLast,
          for (final st in ['unassigned', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed']) s.deliveryLegStatus(st),
        ];
        for (final t in texts) {
          expect(t.trim(), isNotEmpty);
          expect(t, isNot(contains('{')), reason: '$lang: a placeholder was left in "$t"');
        }
      }
      expect(const Strings('fr').orderPartDelivered, 'Une partie de votre commande a été livrée');
      expect(const Strings('en').orderPartDelivered, 'Part of your order was delivered');
      expect(const Strings('fr').deliveryLegN(2, 3), 'Livraison 2 sur 3');
      expect(const Strings('fr').deliveryLegItems(1), '1 article');
    });

    test('the new notifications are shown in French', () {
      const fr = Strings('fr');
      expect(localizeNotification(fr, 'Part of your order is on its way', '').$1, 'Une partie de votre commande est en route');
      expect(localizeNotification(fr, 'Part of your order was delivered', '').$1, 'Une partie de votre commande a été livrée');
      expect(localizeNotification(fr, 'Items could not be delivered', '').$1, 'Articles non livrés');
      expect(localizeNotification(const Strings('en'), 'Part of your order was delivered', 'x').$1, 'Part of your order was delivered');
    });

    test('the status error accepts "A" and "An"; the partial-delivery cancel guard is translated', () {
      const fr = Strings('fr');
      expect(translateServerError('An express delivery that is picked up cannot become delivered.', fr), 'Une livraison express « récupérée » ne peut pas passer à « livrée ».');
      expect(translateServerError('A pickup that is assigned cannot become delivered.', fr), 'Un ramassage « assignée » ne peut pas passer à « livrée ».');
      expect(translateServerError('An in transit delivery cannot become failed.', fr), contains('en route'));
      expect(translateServerError('Part of this order was already delivered. Contact support to stop the rest.', fr), startsWith('Une partie de cette commande'));
      expect(translateServerError('An express parcel is still with the seller. Cancel the order instead.', fr), startsWith('Un colis express'));
      expect(translateServerError('An express delivery that is delivered cannot become failed.', const Strings('en')), 'An express delivery that is delivered cannot become failed.');
    });
  });
  group('a failed delivery attempt and the retry code', () {
    Map<String, dynamic> failedLeg({String reason = 'Customer not reachable', String kind = 'delivery'}) =>
        {..._leg(kind, 'failed'), 'id': 'f1', 'attempts': 1, 'failureReason': reason};

    test('the code is asked for whenever the order is not over, a failed attempt (confirmed) included', () {
      for (final st in ['confirmed', 'processing', 'shipped', 'out_for_delivery']) {
        expect(DeliveryCodeCard.asksFor(st), isTrue, reason: st);
      }
      for (final st in ['pending', 'cancelled', 'returned', 'delivered']) {
        expect(DeliveryCodeCard.asksFor(st), isFalse, reason: st);
      }
    });

    test('the failed attempt is read from the legs: its number, its reason, and whether the rider comes back', () {
      final o = _order(status: 'confirmed', legs: [failedLeg(), {..._leg('delivery', 'unassigned'), 'id': 'n2', 'attempts': 2}]);
      expect(o.failedAttempt, (attempt: 1, reason: 'Customer not reachable', retry: true));
      const en = Strings('en');
      expect(en.deliveryAttemptFailed(1, 'Customer not reachable', true), 'Delivery attempt 1 failed: Customer not reachable. The rider will try again.');
      expect(const Strings('fr').deliveryAttemptFailed(1, 'Client injoignable', true), 'Tentative de livraison 1 échouée: Client injoignable. Le livreur va réessayer.');
      expect(en.deliveryAttemptFailed(1, null, false), 'Delivery attempt 1 failed. We will be in touch.');
      expect(en.deliveryAttemptFailed(2, 'Nobody opened the door.', true), 'Delivery attempt 2 failed: Nobody opened the door. The rider will try again.');
    });

    test('nothing to say for a clean order, a finished one, a pickup, or a leg that went back to the seller', () {
      expect(_order(status: 'processing', legs: [_leg('delivery', 'in_transit')]).failedAttempt, isNull);
      expect(_order(status: 'delivered', legs: [failedLeg()]).failedAttempt, isNull);
      expect(_order(status: 'confirmed', legs: [failedLeg(kind: 'pickup')]).failedAttempt, isNull);
      expect(_order(status: 'confirmed', legs: [failedLeg(reason: 'Returned to seller')]).failedAttempt, isNull);
    });

    testWidgets('the order page shows the failed attempt banner', (tester) async {
      final o = _order(status: 'confirmed', legs: [failedLeg(), {..._leg('delivery', 'unassigned'), 'id': 'n2', 'attempts': 2}]);
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: FailedAttemptBanner(order: o))));
      expect(find.byKey(const ValueKey('failed-attempt')), findsOneWidget);
      expect(find.textContaining('Delivery attempt 1 failed: Customer not reachable'), findsOneWidget);
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: FailedAttemptBanner(order: _order(status: 'processing')))));
      expect(find.byKey(const ValueKey('failed-attempt')), findsNothing);
    });
  });

  group('an express order is not a warehouse delivery', () {
    test('the fee row is the one platform commission line; express says "straight from the store" (EN / FR)', () {
      expect(const Strings('en').platformFee, 'Platform commission');
      expect(const Strings('fr').platformFee, 'Commission de la plateforme');
      expect(const Strings('en').orderExpressNote, 'Express delivery: straight from the store to you.');
      expect(const Strings('fr').orderExpressNote, 'Livraison express : directement de la boutique chez vous.');
    });
  });
}
