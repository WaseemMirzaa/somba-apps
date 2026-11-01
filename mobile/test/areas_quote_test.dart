// The final areas API on the delivery quote and the not-served refusal: the structured refusal (area names in both
// languages and the served cities) in the cart and at checkout, the message-only refusal of older servers with the cities
// from the geo directory, the "no rider" fallback line, the per-hop transit and cost of the route card, and the quote
// payloads with and without the new fields.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/cart_screen.dart';
import 'package:lipcart/screens/checkout_screen.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/delivery_quote.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/util/delivery_estimate.dart';
import 'package:lipcart/util/format.dart';

import 'areas_helpers.dart';
import 'gap_helpers.dart';

const _gombe = ['p-kin', 'c-kin', 'd-luk', 'm-gombe'];
const _goma = ['p-nk', 'c-goma'];

AddressDto _address(List<String> ids, {String commune = 'Gombe', String city = 'Kinshasa', bool? served}) => AddressDto.fromJson({
      'id': 'a1',
      'label': 'Home',
      'line1': '12 Avenue de la Paix',
      'commune': commune,
      'city': city,
      'isDefault': true,
      'geo': {'lat': -4.31, 'lng': 15.31},
      'areaId': ids.last,
      'areaChain': chainOf(ids),
      if (served != null) 'served': served,
    });

/// The refusal as the final contract sends it.
ApiException _refusal({
  String error = 'We don\'t deliver to Nord-Kivu yet.',
  String? areaName = 'Nord-Kivu',
  String? areaNameEn = 'North Kivu',
  List<Map<String, dynamic>> cities = const [
    {'id': 'c-kin', 'name': 'Kinshasa', 'nameEn': null},
    {'id': 'c-kc', 'name': 'Kongo-Central', 'nameEn': 'Central Kongo'},
  ],
}) =>
    ApiException.fromAck({'ok': false, 'error': error, 'code': 'not_served', 'areaId': 'p-nk', 'areaName': areaName, 'areaNameEn': areaNameEn, 'servedCities': cities});

Map<String, dynamic> _hop(String from, String to, {double? transit, Object? cost = _absent}) => {
      'fromHubId': 'h-$from',
      'fromHubName': 'Entrepôt $from',
      'toHubId': 'h-$to',
      'toHubName': 'Entrepôt $to',
      if (transit != null) 'transitHours': transit,
      if (cost != _absent) 'costUsd': cost,
    };

const _absent = Object();

Map<String, dynamic> _origin(String seller, List<Map<String, dynamic>> hops, {String hub = 'Limete', Map<String, dynamic> extra = const {}}) => {
      'sellerId': seller,
      'hubId': 'h-$hub',
      'hubName': 'Entrepôt $hub',
      'areaName': 'Limete',
      'areaNameEn': 'Limete',
      'fallback': null,
      'coveringHubId': 'h-$hub',
      'coveringHubName': 'Entrepôt $hub',
      'hops': hops,
      'transitHours': 0,
      ...extra,
    };

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  tearDown(() {
    resetGeo();
    gapTearDown();
  });

  group('the quote payload', () {
    test('an old quote (none of the new fields) reads with their defaults', () {
      final q = DeliveryQuote.fromJson(gapQuoteJson(fee: 5, transfer: 2));
      expect((q.fallback, q.coveringHubName, q.coveringHubId, q.hasFallback, q.standsIn), (null, null, null, false, false));
      expect((q.feeOverrideUsd, q.interCity, q.interCityDays, q.extraDays), (null, false, 0, null));
      expect(q.destinationArea, isNull);
      expect(q.destinationAreaChain, isEmpty);
      expect(q.origins, isEmpty);
      expect(q.routeChains, isEmpty);
      expect(q.estimateExtraDays, 0);
      expect(q.distinctHops, isEmpty);
    });

    test('an old hop has no transit time and no cost of its own', () {
      final h = QuoteHop.fromJson(_hop('A', 'B'));
      expect((h.transitHours, h.costUsd), (0, null));
      expect(QuoteRoute([h]).hasHopDetails, isFalse);
      final o = QuoteOrigin.fromJson({'sellerId': 's1', 'hubName': 'Entrepôt A', 'areaName': 'Gombe'});
      expect((o.areaNameEn, o.fallback, o.coveringHubName, o.transitHours, o.hasFallback, o.areaNameFor('en'), o.areaNameFor('fr')), (null, null, null, 0, false, 'Gombe', 'Gombe'));
    });

    test('the final contract\'s fields are all read', () {
      final q = DeliveryQuote.fromJson({
        ...gapQuoteJson(fee: 9, transfer: 4),
        'served': true,
        'destinationHubName': 'Entrepôt Kinshasa',
        'destinationAreaChain': chainOf(_gombe),
        'fallback': 'city',
        'coveringHubId': 'h-Limete',
        'coveringHubName': 'Entrepôt Limete',
        'feeOverrideUsd': 6.5,
        'interCity': true,
        'interCityDays': 3,
        'transitHours': 30,
        'extraDays': 2,
        'origins': [
          _origin('s1', [_hop('Limete', 'Kinshasa', transit: 6, cost: 1.5), _hop('Kinshasa', 'Kikwit', transit: 24, cost: null)],
              extra: {'fallback': 'nearest', 'coveringHubName': 'Entrepôt Kasa', 'transitHours': 30, 'areaNameEn': 'Limete Town'}),
        ],
      });
      expect((q.fallback, q.coveringHubId, q.coveringHubName, q.hasFallback, q.standsIn), ('city', 'h-Limete', 'Entrepôt Limete', true, true));
      expect((q.feeOverrideUsd, q.interCity, q.interCityDays, q.extraDays, q.transitHours), (6.5, true, 3, 2, 30));
      expect(q.destinationAreaChain.map((a) => a.id), ['cd', 'p-kin', 'c-kin', 'd-luk', 'm-gombe']);
      expect(q.destinationArea!.id, 'm-gombe', reason: 'the chain\'s last area when the area itself is not sent');
      final o = q.origins.single;
      expect((o.fallback, o.coveringHubName, o.hubName, o.areaName, o.areaNameEn, o.transitHours), ('nearest', 'Entrepôt Kasa', 'Entrepôt Limete', 'Limete', 'Limete Town', 30));
      expect(o.areaNameFor('en'), 'Limete Town');
      expect(o.areaNameFor('fr'), 'Limete');
      expect(o.standsIn, isTrue);
      expect(o.hops.map((h) => (h.transitHours, h.costUsd)), [(6.0, 1.5), (24.0, null)]);
      expect(q.routes, [
        ['Entrepôt Limete', 'Entrepôt Kinshasa', 'Entrepôt Kikwit']
      ]);
      expect(q.routeChains.single.hasHopDetails, isTrue);
    });

    test('a hop\'s cost is a number, or null for the standard transfer fee; odd values are ignored', () {
      expect(QuoteHop.fromJson(_hop('A', 'B', cost: 0)).costUsd, 0);
      expect(QuoteHop.fromJson(_hop('A', 'B', cost: 2.25)).costUsd, 2.25);
      expect(QuoteHop.fromJson(_hop('A', 'B', cost: null)).costUsd, isNull);
      expect(QuoteHop.fromJson(_hop('A', 'B', cost: 'two')).costUsd, isNull);
      expect(QuoteHop.fromJson(_hop('A', 'B', transit: 4.5)).transitHours, 4.5);
    });

    test('"no riders" is a fallback where nobody else delivers: the covering warehouse keeps the order', () {
      final q = DeliveryQuote.fromJson({...gapQuoteJson(), 'fallback': 'no_riders', 'coveringHubName': 'Kinshasa Hub'});
      expect((q.hasFallback, q.standsIn), (true, false));
      // a fallback the server did not name the warehouse of says nothing the shopper can use
      expect(DeliveryQuote.fromJson({...gapQuoteJson(), 'fallback': 'city'}).hasFallback, isFalse);
    });

    test('the estimate grows by extraDays, else by the lanes\' transit days, else by the inter-city allowance', () {
      DeliveryQuote q(Map<String, dynamic> extra) => DeliveryQuote.fromJson({...gapQuoteJson(), ...extra});
      expect(q({'extraDays': 4, 'transitHours': 10, 'interCity': true, 'interCityDays': 3}).estimateExtraDays, 4);
      expect(q({'transitHours': 50, 'interCity': true, 'interCityDays': 3}).estimateExtraDays, 3);
      expect(q({'interCity': true, 'interCityDays': 3}).estimateExtraDays, 3);
      expect(q({'interCity': false, 'interCityDays': 3}).estimateExtraDays, 0);
      expect(q({'extraDays': 0, 'interCity': true, 'interCityDays': 3}).estimateExtraDays, 0, reason: 'the server\'s own number, even zero');
    });

    test('a shared hop is one hop; its fee is its own cost, else what is left of the transfer fee shared by the standard ones', () {
      final q = DeliveryQuote.fromJson({
        ...gapQuoteJson(fee: 12, transfer: 7),
        'origins': [
          _origin('s1', [_hop('Limete', 'Kinshasa', cost: 3), _hop('Kinshasa', 'Kikwit', cost: null), _hop('Kikwit', 'Idiofa', cost: null)]),
          _origin('s2', [_hop('Limete', 'Kinshasa', cost: 3)]),
        ],
      });
      expect(q.distinctHops.map((h) => h.key), ['h-Limete>h-Kinshasa', 'h-Kinshasa>h-Kikwit', 'h-Kikwit>h-Idiofa']);
      expect(q.hopFeeUsd(q.distinctHops[0]), 3);
      expect(q.hopFeeUsd(q.distinctHops[1]), 2, reason: '(7 - 3) / 2 standard hops');
      expect(q.hopFeeUsd(q.distinctHops[2]), 2);
      expect(q.routes, hasLength(2), reason: 'two distinct chains');
    });

    test('the fee of a hop is unknown when nothing is left to share', () {
      final q = DeliveryQuote.fromJson({
        ...gapQuoteJson(fee: 3, transfer: 0),
        'origins': [
          _origin('s1', [_hop('A', 'B', cost: null)])
        ],
      });
      expect(q.hopFeeUsd(q.distinctHops.single), isNull);
    });
  });

  for (final lang in ['en', 'fr']) {
    final s = Strings(lang);
    final area = lang == 'en' ? 'North Kivu' : 'Nord-Kivu';
    final cities = lang == 'en' ? 'Kinshasa, Central Kongo' : 'Kinshasa, Kongo-Central';

    group('the structured not-served refusal ($lang)', () {
      final events = <String>[];

      setUp(() async {
        await gapReset(lang: lang);
        resetGeo();
        events.clear();
        ShopState.instance.addToCart(productByUuid('p1')!);
      });

      /// Serves the quote with [quote] (it may throw) and records every event.
      void serve({Map<String, dynamic> Function(Map<String, dynamic>? body)? quote, List<Map<String, dynamic>>? servedCities}) {
        RealtimeStore.instance.debugCallRequest = areaCalls(quote: quote, servedCities: servedCities, log: events);
      }

      Future<void> openCheckout(WidgetTester t) async {
        gapTallViewport(t);
        await Strings.setLang(lang, persist: false);
        await t.pumpWidget(gapApp(CheckoutScreen(locale: Locale(lang)), lang: lang));
        await t.pump(const Duration(milliseconds: 300));
        await t.pump();
      }

      Future<void> openCart(WidgetTester t) async {
        gapTallViewport(t);
        await Strings.setLang(lang, persist: false);
        await t.pumpWidget(gapApp(CartScreen(locale: Locale(lang)), lang: lang));
        await t.pump(const Duration(milliseconds: 300));
        await t.pump();
      }

      String text(WidgetTester t, String key) => t.widget<Text>(find.byKey(ValueKey(key))).data!;

      testWidgets('checkout: the sentence from the area\'s names and the cities we deliver in, in the language of the app', (t) async {
        RealtimeStore.instance.addresses.add(_address(_goma, commune: '', city: 'Goma', served: false));
        serve(quote: (_) => throw _refusal());
        await openCheckout(t);
        expect(text(t, 'not-served-text'), s.areaNotServed(area));
        expect(text(t, 'not-served-text'), lang == 'en' ? 'We don’t deliver to North Kivu yet.' : 'Nous ne livrons pas encore à Nord-Kivu.');
        expect(text(t, 'not-served-cities'), s.areaDeliverIn(cities));
        expect(text(t, 'not-served-cities'), lang == 'en' ? 'We currently deliver in: Kinshasa, Central Kongo' : 'Nous livrons actuellement à : Kinshasa, Kongo-Central');
        expect(events, isNot(contains('geo:servedCities')), reason: 'the refusal already lists them');
        expect(find.byKey(const ValueKey('change-address')), findsOneWidget);
        expect(find.text(s.checkoutQuoteFailed), findsNothing);
      });

      testWidgets('cart: the same notice', (t) async {
        RealtimeStore.instance.addresses.add(_address(_goma, commune: '', city: 'Goma', served: false));
        serve(quote: (_) => throw _refusal());
        await openCart(t);
        expect(text(t, 'not-served-text'), s.areaNotServed(area));
        expect(text(t, 'not-served-cities'), s.areaDeliverIn(cities));
        expect(events, isNot(contains('geo:servedCities')));
      });

      testWidgets('the structured names are shown as sent, not looked up in the address (no area-chain rewrite)', (t) async {
        // The address calls its province "Nord-Kivu"/"North Kivu"; the server\'s own names are what is shown.
        RealtimeStore.instance.addresses.add(_address(_goma, commune: '', city: 'Goma', served: false));
        serve(quote: (_) => throw _refusal(areaName: 'Kivu du Nord', areaNameEn: 'Northern Kivu'));
        await openCheckout(t);
        expect(text(t, 'not-served-text'), s.areaNotServed(lang == 'en' ? 'Northern Kivu' : 'Kivu du Nord'));
      });

      testWidgets('nothing matched ("this area"): the address\'s own area; a list of cities still follows', (t) async {
        RealtimeStore.instance.addresses.add(_address(_goma, commune: '', city: 'Goma', served: false));
        serve(quote: (_) => throw _refusal(error: 'We don\'t deliver to this area yet.', areaName: null, areaNameEn: null));
        await openCheckout(t);
        expect(text(t, 'not-served-text'), s.areaNotServed('Goma'));
        expect(text(t, 'not-served-cities'), s.areaDeliverIn(cities));
      });

      testWidgets('a structured refusal that lists no city has no cities line, and the directory is not asked', (t) async {
        RealtimeStore.instance.addresses.add(_address(_goma, commune: '', city: 'Goma', served: false));
        serve(quote: (_) => throw _refusal(cities: const []), servedCities: [
          {'id': 'x', 'name': 'Boma'}
        ]);
        await openCheckout(t);
        await t.pump();
        expect(find.byKey(const ValueKey('not-served-text')), findsOneWidget);
        expect(find.byKey(const ValueKey('not-served-cities')), findsNothing);
        expect(events, isNot(contains('geo:servedCities')), reason: 'the server\'s answer is trusted, even when empty');
      });

      testWidgets('placing the order is refused with the structured fields: one sentence in the snackbar with the cities, nothing is sent', (t) async {
        final sent = <Map<String, dynamic>>[];
        RealtimeStore.instance.walletBalance = 1000;
        RealtimeStore.instance.debugPlaceOrderRequest = (event, [body]) async {
          sent.add(body!);
          throw _refusal();
        };
        RealtimeStore.instance.addresses.add(_address(_gombe, served: true));
        var quotes = 0;
        serve(quote: (_) {
          quotes++;
          if (quotes == 1) return gapQuoteJson();
          throw _refusal();
        });
        await openCheckout(t);
        expect(find.byKey(const ValueKey('not-served')), findsNothing);
        await t.tap(find.byKey(const ValueKey('pay-wallet')));
        await t.pump();
        await t.tap(find.byKey(const ValueKey('place-order')));
        await t.pump();
        await t.pump(const Duration(milliseconds: 400));
        expect(sent, hasLength(1));
        expect(find.descendant(of: find.byType(SnackBar), matching: find.text('${s.areaNotServed(area)} ${s.areaDeliverIn(cities)}')), findsOneWidget);
        expect(find.descendant(of: find.byType(SnackBar), matching: find.text(s.areaChangeAddress)), findsOneWidget);
        await t.pump(const Duration(milliseconds: 200));
        expect(quotes, 2, reason: 'the quote is asked again');
        expect(text(t, 'not-served-cities'), s.areaDeliverIn(cities));
      });
    });

    group('the message-only refusal of an older server ($lang)', () {
      final events = <String>[];

      setUp(() async {
        await gapReset(lang: lang);
        resetGeo();
        events.clear();
        ShopState.instance.addToCart(productByUuid('p1')!);
      });

      void serve({Map<String, dynamic> Function(Map<String, dynamic>? body)? quote, List<Map<String, dynamic>>? servedCities}) {
        RealtimeStore.instance.debugCallRequest = areaCalls(quote: quote, servedCities: servedCities, log: events);
      }

      Future<void> openCheckout(WidgetTester t) async {
        gapTallViewport(t);
        await Strings.setLang(lang, persist: false);
        await t.pumpWidget(gapApp(CheckoutScreen(locale: Locale(lang)), lang: lang));
        await t.pump(const Duration(milliseconds: 300));
        await t.pump();
        await t.pump();
      }

      testWidgets('the area is parsed from the message and shown as the address\'s own area; the cities come from geo:servedCities', (t) async {
        RealtimeStore.instance.addresses.add(_address(_goma, commune: '', city: 'Goma', served: false));
        serve(quote: (_) => throw ApiException('We don\'t deliver to Nord-Kivu yet.'), servedCities: [
          {'id': 'c-kin', 'name': 'Kinshasa', 'nameEn': null},
          {'id': 'c-kc', 'name': 'Kongo-Central', 'nameEn': 'Central Kongo'},
        ]);
        await openCheckout(t);
        expect(t.widget<Text>(find.byKey(const ValueKey('not-served-text'))).data, s.areaNotServed(area), reason: 'the French name read as the address\'s province, in the language of the app');
        expect(t.widget<Text>(find.byKey(const ValueKey('not-served-cities'))).data, s.areaDeliverIn(cities));
        expect(events.where((e) => e == 'geo:servedCities'), hasLength(1));
      });

      testWidgets('a server without geo:servedCities: the cities are worked out from the served provinces', (t) async {
        RealtimeStore.instance.addresses.add(_address(_goma, commune: '', city: 'Goma', served: false));
        serve(quote: (_) => throw ApiException('We don\'t deliver to Goma yet.'));
        await openCheckout(t);
        expect(t.widget<Text>(find.byKey(const ValueKey('not-served-text'))).data, s.areaNotServed('Goma'));
        // kGeo: Kinshasa and Kongo-Central are served; Kinshasa has a city, Kongo-Central lists none
        expect(t.widget<Text>(find.byKey(const ValueKey('not-served-cities'))).data, s.areaDeliverIn('Kinshasa'));
        expect(events, contains('geo:children:p-kin'));
        expect(events, isNot(contains('geo:children:p-nk')));
      });

      testWidgets('a quote that only says served:false gets the cities too', (t) async {
        RealtimeStore.instance.addresses.add(_address(_goma, commune: '', city: 'Goma', served: false));
        serve(quote: (_) => {...gapQuoteJson(), 'served': false}, servedCities: [
          {'id': 'c-kin', 'name': 'Kinshasa'}
        ]);
        await openCheckout(t);
        expect(t.widget<Text>(find.byKey(const ValueKey('not-served-text'))).data, s.areaNotServed('Goma'));
        expect(t.widget<Text>(find.byKey(const ValueKey('not-served-cities'))).data, s.areaDeliverIn('Kinshasa'));
      });

      testWidgets('the directory cannot be reached: the sentence stays, without the list, and nothing breaks', (t) async {
        RealtimeStore.instance.addresses.add(_address(_goma, commune: '', city: 'Goma', served: false));
        final base = areaCalls(quote: (_) => throw ApiException('We don\'t deliver to Goma yet.'));
        RealtimeStore.instance.debugCallRequest = (event, [body]) => event.startsWith('geo:') ? Future.error(ApiException.local('err_no_connection')) : base(event, body);
        await openCheckout(t);
        expect(t.widget<Text>(find.byKey(const ValueKey('not-served-text'))).data, s.areaNotServed('Goma'));
        expect(find.byKey(const ValueKey('not-served-cities')), findsNothing);
        expect(t.takeException(), isNull);
      });

      testWidgets('a served address has no notice and never asks for the cities', (t) async {
        RealtimeStore.instance.addresses.add(_address(_gombe, served: true));
        serve(quote: (_) => gapQuoteJson());
        await openCheckout(t);
        expect(find.byKey(const ValueKey('not-served')), findsNothing);
        expect(events, isNot(contains('geo:servedCities')));
      });
    });

    group('the delivery lines of the route card ($lang)', () {
      setUp(() async {
        await gapReset(lang: lang);
        resetGeo();
        ShopState.instance.addToCart(productByUuid('p1')!);
      });

      Future<void> openCheckout(WidgetTester t, Map<String, dynamic> quote) async {
        RealtimeStore.instance.addresses.add(AddressDto(
            id: 'a1', label: 'Home', line1: '12 Avenue de la Paix', city: 'Kikwit', isDefault: true, geo: (lat: -5.04, lng: 18.8, placeId: null, formatted: null)));
        RealtimeStore.instance.debugCallRequest = gapCalls(quote: (_) => quote);
        gapTallViewport(t);
        await Strings.setLang(lang, persist: false);
        await t.pumpWidget(gapApp(CheckoutScreen(locale: Locale(lang)), lang: lang));
        await t.pump(const Duration(milliseconds: 300));
      }

      String shown(WidgetTester t, String key) => t.widget<Text>(find.byKey(ValueKey(key))).data!;

      testWidgets('the covering warehouse has no rider and another delivers: who, and from where', (t) async {
        await openCheckout(t, {...gapQuoteJson(hub: 'Entrepôt Kinshasa'), 'fallback': 'city', 'coveringHubId': 'h-lim', 'coveringHubName': 'Entrepôt Limete'});
        expect(shown(t, 'checkout-fallback'), s.checkoutFallback('Entrepôt Limete', 'Entrepôt Kinshasa'));
        expect(shown(t, 'checkout-fallback'),
            lang == 'en' ? 'Entrepôt Limete has no rider available right now — delivered from Entrepôt Kinshasa' : 'Entrepôt Limete n’a aucun livreur disponible pour le moment — livraison depuis Entrepôt Kinshasa');
        expect(shown(t, 'checkout-hub'), s.checkoutFromHub('Entrepôt Kinshasa'));
      });

      testWidgets('"nearest" (another city of the province) reads the same', (t) async {
        await openCheckout(t, {...gapQuoteJson(hub: 'Entrepôt Kikwit'), 'fallback': 'nearest', 'coveringHubName': 'Entrepôt Kinshasa'});
        expect(shown(t, 'checkout-fallback'), s.checkoutFallback('Entrepôt Kinshasa', 'Entrepôt Kikwit'));
      });

      testWidgets('nobody has a rider: the order stays and may take longer', (t) async {
        await openCheckout(t, {...gapQuoteJson(hub: 'Entrepôt Kinshasa'), 'fallback': 'no_riders', 'coveringHubName': 'Entrepôt Kinshasa'});
        expect(shown(t, 'checkout-fallback'), s.checkoutFallbackNone('Entrepôt Kinshasa'));
        expect(find.textContaining('delivered from'), findsNothing);
        expect(find.textContaining('livraison depuis'), findsNothing);
      });

      testWidgets('older quotes: no fallback line, and a fallback without the covering warehouse\'s name says nothing', (t) async {
        await openCheckout(t, {...gapQuoteJson(), 'fallback': 'city'});
        expect(find.byKey(const ValueKey('checkout-fallback')), findsNothing);
        expect(find.byKey(const ValueKey('checkout-hub')), findsOneWidget);
      });

      testWidgets('a seller\'s pickup area without a rider: the warehouse that collects instead, with the area in the user\'s language', (t) async {
        await openCheckout(t, {
          ...gapQuoteJson(),
          'origins': [
            _origin('s1', [], hub: 'Kinshasa', extra: {'fallback': 'city', 'coveringHubName': 'Entrepôt Limete', 'areaName': 'Nord-Kivu', 'areaNameEn': 'North Kivu'}),
            _origin('s2', [], hub: 'Kinshasa', extra: {'fallback': 'city', 'coveringHubName': 'Entrepôt Limete', 'areaName': 'Nord-Kivu', 'areaNameEn': 'North Kivu'}),
          ],
        });
        expect(shown(t, 'checkout-pickup-fallback-0'), s.checkoutPickupFallback('Entrepôt Limete', 'Entrepôt Kinshasa', area: area));
        expect(find.byKey(const ValueKey('checkout-pickup-fallback-1')), findsNothing, reason: 'the same sentence once');
        expect(shown(t, 'checkout-pickup-fallback-0'),
            lang == 'en'
                ? 'Entrepôt Limete has no rider available right now — parcels from North Kivu are collected by Entrepôt Kinshasa'
                : 'Entrepôt Limete n’a aucun livreur disponible pour le moment — les colis de Nord-Kivu sont ramassés par Entrepôt Kinshasa');
      });

      testWidgets('a relayed route: the chain, then each hop with its transit time and its cost (the standard fee where the lane has none)', (t) async {
        await openCheckout(t, {
          ...gapQuoteJson(fee: 9, transfer: 5, hub: 'Entrepôt Kikwit'),
          'transitHours': 28,
          'extraDays': 2,
          'origins': [
            _origin('s1', [_hop('Limete', 'Kinshasa', transit: 4, cost: 3), _hop('Kinshasa', 'Kikwit', transit: 24, cost: null)]),
            _origin('s2', [_hop('Limete', 'Kinshasa', transit: 4, cost: 3), _hop('Kinshasa', 'Kikwit', transit: 24, cost: null)]),
          ],
        });
        expect(shown(t, 'checkout-route-0'), s.checkoutRoute('Entrepôt Limete → Entrepôt Kinshasa → Entrepôt Kikwit'));
        expect(find.byKey(const ValueKey('checkout-route-1')), findsNothing, reason: 'one route, however many sellers take it');
        expect(shown(t, 'checkout-hop-0-0'), 'Entrepôt Limete → Entrepôt Kinshasa · ${s.checkoutHopTransit(4)} · ${money(3)}');
        expect(shown(t, 'checkout-hop-0-1'), 'Entrepôt Kinshasa → Entrepôt Kikwit · ${s.checkoutHopTransit(24)} · ${money(2)}', reason: '5 - 3 left for the one standard hop');
        expect(find.byKey(const ValueKey('checkout-hop-0-2')), findsNothing);
        expect(shown(t, 'checkout-transit'), s.checkoutTransit(28));
        expect(shown(t, 'checkout-transfer'), s.checkoutTransferFee(money(5)));
        expect(shown(t, 'delivery-estimate'), dayLabel(estimateFor([productByUuid('p1')!.shipDays], null, deliveryTotalDaysMax, 2), lang));
      });

      testWidgets('one direct hop on a lane: a single hop row with its transit time, no route chain', (t) async {
        await openCheckout(t, {
          ...gapQuoteJson(fee: 6, transfer: 2, hub: 'Entrepôt Kinshasa'),
          'transitHours': 6,
          'origins': [
            _origin('s1', [_hop('Limete', 'Kinshasa', transit: 6, cost: null)])
          ],
        });
        expect(find.byKey(const ValueKey('checkout-route-0')), findsNothing);
        expect(shown(t, 'checkout-hop-0-0'), 'Entrepôt Limete → Entrepôt Kinshasa · ${s.checkoutHopTransit(6)} · ${money(2)}');
      });

      testWidgets('hops without a transit time or a cost of their own (an older server) show no hop rows', (t) async {
        await openCheckout(t, {
          ...gapQuoteJson(fee: 6, transfer: 2),
          'origins': [
            _origin('s1', [_hop('Limete', 'Kinshasa')])
          ],
        });
        expect(find.byKey(const ValueKey('checkout-hop-0-0')), findsNothing);
        expect(find.byKey(const ValueKey('checkout-route-0')), findsNothing);
        expect(find.byKey(const ValueKey('checkout-transfer')), findsOneWidget);
      });

      testWidgets('delivery between cities with no lane: the allowance in days; with a lane the transit line says it', (t) async {
        await openCheckout(t, {...gapQuoteJson(fee: 6, transfer: 2), 'interCity': true, 'interCityDays': 3, 'extraDays': 3});
        expect(shown(t, 'checkout-intercity'), s.checkoutInterCity(3));
        expect(shown(t, 'checkout-intercity'), lang == 'en' ? 'Delivery between cities adds about 3 days.' : 'La livraison entre villes ajoute environ 3 jours.');
        expect(find.byKey(const ValueKey('checkout-transit')), findsNothing);
        expect(shown(t, 'delivery-estimate'), dayLabel(estimateFor([productByUuid('p1')!.shipDays], null, deliveryTotalDaysMax, 3), lang));
      });

      testWidgets('delivery between cities on a lane: the transit time, not the allowance', (t) async {
        await openCheckout(t, {...gapQuoteJson(fee: 6, transfer: 2), 'interCity': true, 'interCityDays': 3, 'transitHours': 72, 'extraDays': 3});
        expect(find.byKey(const ValueKey('checkout-intercity')), findsNothing);
        expect(shown(t, 'checkout-transit'), s.checkoutTransit(72));
      });

      testWidgets('an older quote shows none of the new lines', (t) async {
        await openCheckout(t, gapQuoteJson());
        for (final k in ['checkout-fallback', 'checkout-intercity', 'checkout-transit', 'checkout-transfer', 'checkout-route-0', 'checkout-hop-0-0']) {
          expect(find.byKey(ValueKey(k)), findsNothing, reason: k);
        }
      });
    });
  }

  group('the quote controller and the cities', () {
    setUp(() async {
      await gapReset();
      resetGeo();
      ShopState.instance.addToCart(productByUuid('p1')!);
    });

    test('a message-only refusal gets the cities from the directory; they are read again after a coverage change', () async {
      final rows = <Map<String, dynamic>>[
        {'id': 'c-kin', 'name': 'Kinshasa'}
      ];
      final log = <String>[];
      RealtimeStore.instance.debugCallRequest =
          areaCalls(quote: (_) => throw ApiException('We don\'t deliver to Goma yet.'), servedCities: rows, log: log);
      final c = QuoteController();
      addTearDown(c.dispose);
      final address = _address(_goma, commune: '', city: 'Goma', served: false);
      await c.update(address, ShopState.instance.cart);
      await pumpEventQueue();
      expect(c.notServed, isTrue);
      expect(c.servedCities.map((e) => e.name), ['Kinshasa']);
      expect(c.notice(const Strings('en'), address)!.full, 'We don’t deliver to Goma yet. We currently deliver in: Kinshasa');

      rows.add({'id': 'c-lub', 'name': 'Lubumbashi'});
      RealtimeStore.instance.debugEmit('geo:updated', area('c-lub', 'city', 'Lubumbashi'));
      await c.retry(address, ShopState.instance.cart);
      await pumpEventQueue();
      expect(c.servedCities.map((e) => e.name), ['Kinshasa', 'Lubumbashi']);
      expect(log.where((e) => e == 'geo:servedCities'), hasLength(2), reason: 'once per coverage change, not per quote');
    });

    test('a structured refusal is trusted: the directory is not asked, and the notice has the server\'s cities', () async {
      final log = <String>[];
      RealtimeStore.instance.debugCallRequest = areaCalls(quote: (_) => throw _refusal(), servedCities: const [], log: log);
      final c = QuoteController();
      addTearDown(c.dispose);
      final address = _address(_goma, commune: '', city: 'Goma', served: false);
      await c.update(address, ShopState.instance.cart);
      await pumpEventQueue();
      expect(log, ['delivery:quote']);
      expect(c.refusal!.structured, isTrue);
      expect(c.notice(const Strings('fr'), address)!.full, 'Nous ne livrons pas encore à Nord-Kivu. Nous livrons actuellement à : Kinshasa, Kongo-Central');
    });

    test('a served address has no refusal and no notice', () async {
      RealtimeStore.instance.debugCallRequest = areaCalls();
      final c = QuoteController();
      addTearDown(c.dispose);
      final address = _address(_gombe, served: true);
      await c.update(address, ShopState.instance.cart);
      await pumpEventQueue();
      expect((c.notServed, c.refusal), (false, null));
      expect(c.notice(const Strings('en'), address), isNull);
    });
  });

  test('a hop\'s transit time and the inter-city allowance in words', () {
    const en = Strings('en'), fr = Strings('fr');
    expect(en.checkoutHopTransit(4), 'about 4 h');
    expect(fr.checkoutHopTransit(4.2), 'environ 5 h');
    expect(en.checkoutHopTransit(72), 'about 3 days');
    expect(fr.checkoutHopTransit(48), 'environ 2 jours');
    expect(en.checkoutInterCity(1), 'Delivery between cities adds about 1 day.');
    expect(fr.checkoutInterCity(1), 'La livraison entre villes ajoute environ 1 jour.');
    expect(en.checkoutInterCity(5), 'Delivery between cities adds about 5 days.');
  });
}
