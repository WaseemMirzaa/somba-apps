// The delivery model on the customer's screens: the quote in the cart, store coupons at checkout, the parcel's
// journey on the tracking screen, the warehouse directory, and the guards on the cart paths for a store on vacation.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/cart_screen.dart';
import 'package:lipcart/screens/checkout_screen.dart';
import 'package:lipcart/screens/more/order_screens.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/delivery_quote.dart';
import 'package:lipcart/services/hub_directory.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';

import 'gap_helpers.dart';

AddressDto _address({String id = 'a1', bool pinned = true}) => AddressDto(
    id: id,
    label: 'Home',
    line1: '12 Avenue de la Paix',
    city: 'Kinshasa',
    commune: 'Gombe',
    isDefault: true,
    geo: pinned ? (lat: -4.31, lng: 15.31, placeId: null, formatted: null) : null);

ProductDto _seller(String id, {String seller = 's1', bool vacation = false}) => ProductDto.fromJson({
      'id': id,
      'name': 'Item $id',
      'nameFr': 'Article $id',
      'price': 20,
      'originalPrice': 20,
      'category': 'Electronics',
      'categoryFr': 'Électronique',
      'image': '',
      'stock': 5,
      'sellerId': seller,
      'sellerName': 'Boutique $seller',
      if (vacation) 'sellerOnVacation': true,
      if (vacation) 'sellerVacationNotice': {'en': 'Back on 12 Nov', 'fr': 'De retour le 12 nov.'},
    });

OrderDto _order(String status, {List<String> origins = const ['hub-a'], String dest = 'hub-b', String fulfilment = 'received'}) => OrderDto.fromJson({
      'id': 'o1',
      'reference': 'SOM-77',
      'status': status,
      'paymentMethod': 'wallet',
      'totalUsd': 25,
      'updatedAt': '2026-10-25T09:30:00Z',
      'destinationHubId': dest,
      'originHubIds': origins,
      'items': [
        {'productId': 'p1', 'productName': 'Item', 'qty': 1, 'priceUsd': 20, 'sellerId': 's1', 'fulfilment': fulfilment, 'receivedAt': '2026-10-24T10:00:00Z'},
      ],
    });

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  tearDown(() {
    HubDirectory.instance.debugSet(const []);
    gapTearDown();
  });

  group('QuoteController', () {
    test('parses the quote, with the hub, the transfer and the fallback', () {
      final q = DeliveryQuote.fromJson(gapQuoteJson(fee: 4.5, transfer: 1.5, hub: 'Limete Hub', pinned: false, fallback: 'city'));
      expect(q.feeUsd, 4.5);
      expect(q.transferUsd, 1.5);
      expect(q.transfer, isTrue);
      expect(q.destinationHubName, 'Limete Hub');
      expect(q.destinationHubId, 'hub-kin');
      expect(q.originHubIds, ['hub-kin']);
      expect(q.pinned, isFalse);
      expect(q.fallback, 'city');
    });

    test('a bare quote ({feeUsd}) is enough', () {
      final q = DeliveryQuote.fromJson({'feeUsd': 2});
      expect(q.feeUsd, 2);
      expect(q.pinned, isTrue, reason: 'an older/minimal answer is not treated as unpinned');
      expect(q.originHubIds, isEmpty);
    });

    test('asks once per address and set of products, and again when either changes', () async {
      await gapReset(products: [_seller('p1'), _seller('p2', seller: 's2')]);
      var calls = 0;
      RealtimeStore.instance.debugCallRequest = (event, [body]) async {
        calls++;
        return gapQuoteJson(fee: body!['addressId'] == 'a2' ? 5 : 3);
      };
      final shop = ShopState.instance..addToCart(productByUuid('p1')!);
      final c = QuoteController();
      await c.update(_address(), shop.cart);
      await c.update(_address(), shop.cart);
      expect(calls, 1, reason: 'same address and lines: nothing to ask');
      expect(c.quote!.feeUsd, 3);
      shop.cart.first.qty = 3;
      await c.update(_address(), shop.cart);
      expect(calls, 1, reason: 'a quantity does not change the route');
      await c.update(_address(id: 'a2'), shop.cart);
      expect(calls, 2);
      expect(c.quote!.feeUsd, 5);
      shop.addToCart(productByUuid('p2')!);
      await c.update(_address(id: 'a2'), shop.cart);
      expect(calls, 3, reason: 'another seller can mean another origin warehouse');
      await c.retry(_address(id: 'a2'), shop.cart);
      expect(calls, 4);
      c.dispose();
    });

    test('no address, or an empty cart: no call and no quote', () async {
      await gapReset(products: [_seller('p1')]);
      var calls = 0;
      RealtimeStore.instance.debugCallRequest = (event, [body]) async {
        calls++;
        return gapQuoteJson();
      };
      final c = QuoteController();
      await c.update(null, [CartItem(product: productByUuid('p1')!, qty: 1)]);
      await c.update(_address(), const []);
      expect(calls, 0);
      expect(c.quote, isNull);
      expect(c.error, isNull);
      c.dispose();
    });

    test('a failure leaves no quote and keeps the error; a late answer for an old address is ignored', () async {
      await gapReset(products: [_seller('p1')]);
      final shop = ShopState.instance..addToCart(productByUuid('p1')!);
      RealtimeStore.instance.debugCallRequest = (event, [body]) async => throw ApiException('Pin your delivery address on the map.');
      final c = QuoteController();
      await c.update(_address(), shop.cart);
      expect(c.quote, isNull);
      expect(c.error, isA<ApiException>());
      expect(c.loading, isFalse);
      // A slow answer for a1 must not replace the answer for a2.
      final slow = <String, dynamic>{};
      RealtimeStore.instance.debugCallRequest = (event, [body]) async {
        if (body!['addressId'] == 'a1') await Future<void>.delayed(const Duration(milliseconds: 50));
        slow[body['addressId'] as String] = true;
        return gapQuoteJson(fee: body['addressId'] == 'a1' ? 3 : 5);
      };
      final first = c.update(_address(), shop.cart, force: true);
      await Future<void>.delayed(const Duration(milliseconds: 10)); // a1's request is on its way
      final second = c.update(_address(id: 'a2'), shop.cart);
      await Future.wait([first, second]);
      expect(slow.length, 2);
      expect(c.quote!.feeUsd, 5, reason: 'the newest address wins');
      c.dispose();
    });
  });

  group('Cart · delivery fee', () {
    Future<void> open(WidgetTester tester, String lang) async {
      gapTallViewport(tester);
      await Strings.setLang(lang, persist: false);
      await tester.pumpWidget(gapApp(CartScreen(locale: Locale(lang)), lang: lang));
      await tester.pump(const Duration(milliseconds: 300));
    }

    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);

      testWidgets('no address yet: "at checkout" and why ($lang)', (tester) async {
        await gapReset(products: [_seller('p1')], lang: lang);
        ShopState.instance.addToCart(productByUuid('p1')!);
        await open(tester, lang);
        expect(find.text(s.cartDeliveryLater), findsOneWidget);
        expect(find.byKey(const ValueKey('cart-delivery-hint')), findsOneWidget);
        expect(find.text(s.cartDeliveryHint), findsOneWidget);
      });

      testWidgets('with an address the fee is the server quote ($lang)', (tester) async {
        await gapReset(products: [_seller('p1')], lang: lang);
        RealtimeStore.instance.addresses.add(_address());
        RealtimeStore.instance.debugCallRequest = gapCalls(quote: (_) => gapQuoteJson(fee: 4));
        ShopState.instance.addToCart(productByUuid('p1')!);
        await open(tester, lang);
        expect(find.text(s.cartDeliveryLater), findsNothing);
        expect(find.byKey(const ValueKey('cart-delivery-hint')), findsNothing);
        // Delivery row: the quoted 4 dollars (total = 20 + 4).
        expect(find.textContaining('24'), findsWidgets);
      });

      testWidgets('an address without a pin says the fee is approximate ($lang)', (tester) async {
        await gapReset(products: [_seller('p1')], lang: lang);
        RealtimeStore.instance.addresses.add(_address(pinned: false));
        RealtimeStore.instance.debugCallRequest = gapCalls(quote: (_) => gapQuoteJson(pinned: false, fallback: 'city'));
        ShopState.instance.addToCart(productByUuid('p1')!);
        await open(tester, lang);
        expect(find.byKey(const ValueKey('cart-delivery-unpinned')), findsOneWidget);
        expect(find.text(s.cartDeliveryUnpinned), findsOneWidget);
      });
    }

    testWidgets('a quote that fails falls back to "at checkout" and does not break the cart', (tester) async {
      await gapReset(products: [_seller('p1')]);
      RealtimeStore.instance.addresses.add(_address());
      RealtimeStore.instance.debugCallRequest = (event, [body]) async => throw ApiException('Delivery is not available right now: no warehouse is open.');
      ShopState.instance.addToCart(productByUuid('p1')!);
      await open(tester, 'en');
      expect(find.text(const Strings('en').cartDeliveryLater), findsOneWidget);
      expect(find.textContaining(const Strings('en').checkout), findsWidgets);
    });

    for (final lang in ['en', 'fr']) {
      testWidgets('moving a saved line of a store on vacation back to the cart is refused with the notice ($lang)', (tester) async {
        await gapReset(products: [_seller('p1', vacation: true), _seller('p2', seller: 's2')], lang: lang);
        final shop = ShopState.instance;
        shop.addToCart(productByUuid('p1')!);
        shop.saveForLater(0);
        shop.addToCart(productByUuid('p2')!); // a non-empty cart, so the saved section shows
        await open(tester, lang);
        final move = find.byKey(ValueKey('move-to-cart-${productByUuid('p1')!.id}'));
        expect(move, findsOneWidget);
        await tester.ensureVisible(move);
        await tester.tap(move);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        expect(find.descendant(of: find.byType(SnackBar), matching: find.text(lang == 'en' ? 'Back on 12 Nov' : 'De retour le 12 nov.')), findsOneWidget);
        expect(shop.savedForLater, hasLength(1), reason: 'the line stays saved');
        expect(shop.cart.map((c) => c.product.uuid), ['p2']);
      });
    }
  });

  group('Checkout · store coupons', () {
    Future<void> open(WidgetTester tester, String lang) async {
      gapTallViewport(tester);
      await Strings.setLang(lang, persist: false);
      await tester.pumpWidget(gapApp(CheckoutScreen(locale: Locale(lang)), lang: lang));
      await tester.pump(const Duration(milliseconds: 300));
    }

    final asked = <String>[];
    Map<String, dynamic>? validated;

    Future<dynamic> Function(String, [Map<String, dynamic>?]) server({bool fail = false}) => (event, [body]) async {
          asked.add(event);
          switch (event) {
            case 'delivery:quote':
              return gapQuoteJson();
            case 'coupons:store':
              if (fail) throw ApiException('Store not found.');
              return body!['sellerId'] == 's1'
                  ? [
                      {'code': 'KIN10', 'type': 'percent', 'value': 10, 'minOrder': 0, 'description': '', 'sellerId': 's1'},
                      {'code': 'KIN5', 'type': 'fixed', 'value': 5, 'minOrder': 30, 'description': '5 off big baskets', 'sellerId': 's1'},
                    ]
                  : <dynamic>[];
            case 'promos:validate':
              validated = body;
              return {'ok': true, 'code': body!['code'], 'discount': 2.0};
          }
          return const <dynamic>[];
        };

    setUp(() {
      asked.clear();
      validated = null;
    });

    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);
      testWidgets('each store\'s public coupons are offered and a tap applies the code with the cart lines ($lang)', (tester) async {
        await gapReset(products: [_seller('p1'), _seller('p2', seller: 's2')], lang: lang);
        RealtimeStore.instance.addresses.add(_address());
        RealtimeStore.instance.debugCallRequest = server();
        ShopState.instance
          ..addToCart(productByUuid('p1')!)
          ..addToCart(productByUuid('p2')!);
        await open(tester, lang);
        expect(find.byKey(const ValueKey('store-coupons-s1')), findsOneWidget);
        expect(find.byKey(const ValueKey('store-coupons-s2')), findsNothing, reason: 'a store with no coupon shows nothing');
        expect(find.textContaining('Boutique s1'), findsWidgets);
        expect(find.text('KIN10 · ${s.promoPercentOff(10)}'), findsOneWidget);
        expect(find.text('KIN5 · ${s.promoFixedOff(5)}'), findsOneWidget);
        await tester.tap(find.byKey(const ValueKey('store-coupon-KIN10')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        expect(tester.widget<TextField>(find.byKey(const ValueKey('checkout-promo'))).controller!.text, 'KIN10');
        expect(validated!['code'], 'KIN10');
        expect(validated!['items'], [
          {'productId': 'p1', 'qty': 1},
          {'productId': 'p2', 'qty': 1},
        ], reason: 'the server needs the lines to price a store coupon');
        expect(ShopState.instance.appliedPromo!.code, 'KIN10');
        expect(find.text(s.promoRow('KIN10')), findsOneWidget);
        expect(find.descendant(of: find.byType(SnackBar), matching: find.text(s.promoApplied('KIN10'))), findsOneWidget);
      });
    }

    testWidgets('a refused coupon reads in French (store only)', (tester) async {
      await gapReset(products: [_seller('p1')], lang: 'fr');
      RealtimeStore.instance.addresses.add(_address());
      RealtimeStore.instance.debugCallRequest = (event, [body]) async {
        if (event == 'promos:validate') return {'ok': false, 'reason': 'This coupon only applies to products from Kinshasa Traders.'};
        if (event == 'coupons:store') return [{'code': 'KIN10', 'type': 'percent', 'value': 10, 'sellerId': 's1'}];
        if (event == 'delivery:quote') return gapQuoteJson();
        return const <dynamic>[];
      };
      ShopState.instance.addToCart(productByUuid('p1')!);
      await open(tester, 'fr');
      await tester.tap(find.byKey(const ValueKey('store-coupon-KIN10')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.descendant(of: find.byType(SnackBar), matching: find.text('Ce coupon ne s’applique qu’aux produits de Kinshasa Traders.')), findsOneWidget);
      expect(ShopState.instance.appliedPromo, isNull);
    });

    testWidgets('a failed coupon read just shows no coupons; the promo field still works', (tester) async {
      await gapReset(products: [_seller('p1')]);
      RealtimeStore.instance.addresses.add(_address());
      RealtimeStore.instance.debugCallRequest = server(fail: true);
      ShopState.instance.addToCart(productByUuid('p1')!);
      await open(tester, 'en');
      expect(find.byKey(const ValueKey('store-coupons-s1')), findsNothing);
      await tester.enterText(find.byKey(const ValueKey('checkout-promo')), 'WELCOME');
      await tester.tap(find.byKey(const ValueKey('checkout-promo-apply')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(validated!['code'], 'WELCOME');
    });

    testWidgets('a platform code is validated with the lines too (old servers ignore them)', (tester) async {
      await gapReset(products: [_seller('p1')]);
      RealtimeStore.instance.addresses.add(_address());
      RealtimeStore.instance.debugCallRequest = server();
      ShopState.instance.addToCart(productByUuid('p1')!, qty: 2);
      await open(tester, 'en');
      await tester.enterText(find.byKey(const ValueKey('checkout-promo')), 'BIENVENUE');
      await tester.tap(find.byKey(const ValueKey('checkout-promo-apply')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(validated!['subtotalUsd'], 40);
      expect(validated!['items'], [
        {'productId': 'p1', 'qty': 2}
      ]);
    });
  });

  group('Tracking · the parcel\'s journey', () {
    Future<void> open(WidgetTester tester, String lang) async {
      gapTallViewport(tester);
      await Strings.setLang(lang, persist: false);
      await tester.pumpWidget(gapApp(OrderTrackingScreen(locale: Locale(lang), orderId: 'o1'), lang: lang));
      await tester.pump(const Duration(milliseconds: 300));
    }

    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);

      testWidgets('shows the legs through both warehouses with their names ($lang)', (tester) async {
        await gapReset(lang: lang);
        HubDirectory.instance.debugSet(const [HubInfo(id: 'hub-a', name: 'Limete Hub'), HubInfo(id: 'hub-b', name: 'Kinshasa Hub')]);
        RealtimeStore.instance.orders.add(_order('shipped'));
        await open(tester, lang);
        for (final t in [s.journeyPickedUp, s.journeyAtOrigin, s.journeyInTransfer, s.journeyAtDestination, s.journeyOutForDelivery, s.journeyDelivered]) {
          expect(find.text(t), findsOneWidget, reason: t);
        }
        expect(find.textContaining('Limete Hub'), findsOneWidget, reason: 'at the seller\'s warehouse');
        expect(find.textContaining('Kinshasa Hub'), findsNWidgets(2), reason: 'in transfer to it, and then at it');
      });
    }

    testWidgets('one warehouse: there is no transfer row', (tester) async {
      await gapReset();
      HubDirectory.instance.debugSet(const [HubInfo(id: 'hub-b', name: 'Kinshasa Hub')]);
      RealtimeStore.instance.orders.add(_order('shipped', origins: ['hub-b']));
      await open(tester, 'en');
      expect(find.text(const Strings('en').journeyInTransfer), findsNothing);
      expect(find.text(const Strings('en').journeyAtDestination), findsOneWidget);
    });

    testWidgets('before the pickup starts, and for an order from before the routing, the status timeline is shown', (tester) async {
      await gapReset();
      RealtimeStore.instance.orders.add(_order('confirmed'));
      await open(tester, 'en');
      expect(find.text(const Strings('en').journeyPickedUp), findsNothing);
      expect(find.text(const Strings('en').statusConfirmed), findsWidgets);
      expect(find.text(const Strings('en').statusShipped), findsOneWidget);
    });

    testWidgets('a push moves the journey live: out for delivery marks the delivery row done', (tester) async {
      await gapReset();
      RealtimeStore.instance.orders.add(_order('shipped', origins: ['hub-b']));
      await open(tester, 'en');
      RealtimeStore.instance.debugOrderPush({..._orderJson('out_for_delivery'), 'updatedAt': '2026-10-25T10:00:00Z'});
      await tester.pump();
      expect(find.text(const Strings('en').journeyOutForDelivery), findsOneWidget);
      expect(find.byIcon(Icons.check_rounded), findsWidgets);
    });
  });

  group('Warehouse directory', () {
    test('loads hubs:list on hydrate and forgets them on sign-out', () async {
      final store = RealtimeStore.instance;
      store.debugCallRequest = (event, [body]) async => event == 'hubs:list'
          ? [
              {'id': 'h1', 'name': 'Kinshasa Hub', 'city': 'Kinshasa', 'lat': -4.3, 'lng': 15.3, 'active': true},
              {'id': 'h2', 'name': 'Paris Hub', 'city': 'Paris'},
              {'name': 'no id'},
            ]
          : const <dynamic>[];
      final hook = HubDirectory.instance.hook;
      await hook.hydrate!(store);
      expect(HubDirectory.instance.nameOf('h1'), 'Kinshasa Hub');
      expect(HubDirectory.instance.byId('h2')!.city, 'Paris');
      expect(HubDirectory.instance.nameOf('nope'), isNull);
      expect(HubDirectory.instance.nameOf(null), isNull);
      hook.reset!();
      expect(HubDirectory.instance.nameOf('h1'), isNull);
      store.debugCallRequest = null;
    });
  });

  group('French for the delivery errors', () {
    const fr = Strings('fr');
    test('the new logistics and coupon errors are translated', () {
      expect(fr.serverError('Pin your delivery address on the map.'), 'Placez votre adresse de livraison sur la carte.');
      expect(fr.serverError('Delivery is not available right now: no warehouse is open.'), contains('aucun entrepôt'));
      expect(fr.serverError('This coupon only applies to products from Mama Tech.'), 'Ce coupon ne s’applique qu’aux produits de Mama Tech.');
      expect(fr.serverError('This coupon applies to one store’s products: add them to your cart first.'), contains('une seule boutique'));
    });
  });
}

Map<String, dynamic> _orderJson(String status) => {
      'id': 'o1',
      'reference': 'SOM-77',
      'status': status,
      'paymentMethod': 'wallet',
      'totalUsd': 25,
      'destinationHubId': 'hub-b',
      'originHubIds': ['hub-b'],
      'items': [
        {'productId': 'p1', 'productName': 'Item', 'qty': 1, 'priceUsd': 20, 'sellerId': 's1', 'fulfilment': 'received', 'receivedAt': '2026-10-24T10:00:00Z'},
      ],
    };
