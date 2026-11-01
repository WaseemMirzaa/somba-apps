// Checkout (estimated delivery from the sellers' delivery times, fee quoted for the address's map pin) and the product page (variant choice).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/checkout_screen.dart';
import 'package:lipcart/screens/more/support_extra.dart';
import 'package:lipcart/screens/product_detail_screen.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/util/delivery_estimate.dart';

import 'gap_helpers.dart';

/// Every `orders:create` the checkout sent, answered like the server would (a confirmed wallet order).
final _sent = <Map<String, dynamic>>[];

Future<dynamic> _fakeServer(String event, [Map<String, dynamic>? body]) async {
  _sent.add(body!);
  return {'id': 'o-${_sent.length}', 'reference': 'SOM-${_sent.length}', 'status': 'confirmed', 'paymentMethod': body['paymentMethod'], 'items': const []};
}

/// A saved address; pinned on the map unless [pinned] is false.
AddressDto _address({String? commune, String id = 'a1', String city = 'Kinshasa', bool pinned = true}) => AddressDto(
    id: id,
    label: 'Home',
    line1: '12 Avenue de la Paix',
    city: city,
    commune: commune,
    isDefault: true,
    geo: pinned ? (lat: -4.31, lng: 15.31, placeId: null, formatted: null) : null);

/// Gombe (a1) costs 3, Limete (a2) 5.
Map<String, dynamic> _quoteFor(Map<String, dynamic>? body) =>
    gapQuoteJson(fee: body?['addressId'] == 'a2' ? 5 : 3, hub: body?['addressId'] == 'a2' ? 'Limete Hub' : 'Kinshasa Hub');

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  tearDown(gapTearDown);

  group('Checkout · delivery time and fee', () {
    setUp(() async {
      await gapReset();
      _sent.clear();
      final store = RealtimeStore.instance;
      store.walletBalance = 1000;
      store.addresses.add(_address(commune: 'Gombe'));
      store.debugPlaceOrderRequest = _fakeServer;
      store.debugCallRequest = gapCalls(quote: _quoteFor);
      ShopState.instance.addToCart(productByUuid('p1')!);
    });

    Future<void> open(WidgetTester tester, {String lang = 'en'}) async {
      gapTallViewport(tester);
      await Strings.setLang(lang, persist: false);
      await tester.pumpWidget(gapApp(CheckoutScreen(locale: Locale(lang)), lang: lang));
      await tester.pump(const Duration(milliseconds: 300));
    }

    Future<void> tapKey(WidgetTester tester, String key) async {
      await tester.tap(find.byKey(ValueKey(key)));
      await tester.pump();
    }

    Future<void> place(WidgetTester tester) async {
      await tapKey(tester, 'pay-wallet');
      await tapKey(tester, 'place-order');
      await tester.pump(const Duration(milliseconds: 400));
    }

    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);

      testWidgets('shows the estimated delivery day and offers no date or time choice ($lang)', (tester) async {
        await open(tester, lang: lang);
        expect(find.text(s.estimatedDelivery), findsOneWidget);
        expect(tester.widget<Text>(find.byKey(const ValueKey('delivery-estimate'))).data, dayLabel(estimateFor([deliveryDaysFallback]), lang));
        expect(find.text(s.deliveryEstimateHint), findsOneWidget);
        expect(find.byType(ChoiceChip), findsNothing, reason: 'no slot chips any more');
      });
    }

    testWidgets('the slowest product in the cart sets the estimate', (tester) async {
      await gapReset(products: [gapDto('fast', deliveryDays: 1), gapDto('slow', deliveryDays: 6)]);
      final store = RealtimeStore.instance;
      store.walletBalance = 1000;
      store.addresses.add(_address(commune: 'Gombe'));
      store.debugPlaceOrderRequest = _fakeServer;
      store.debugCallRequest = gapCalls(quote: _quoteFor);
      ShopState.instance.addToCart(productByUuid('fast')!);
      await open(tester);
      expect(tester.widget<Text>(find.byKey(const ValueKey('delivery-estimate'))).data, dayLabel(estimateFor([1]), 'en'));
      ShopState.instance.addToCart(productByUuid('slow')!);
      await open(tester);
      expect(tester.widget<Text>(find.byKey(const ValueKey('delivery-estimate'))).data, dayLabel(estimateFor([6]), 'en'));
    });

    testWidgets('the order carries no delivery date from the app (the server works it out)', (tester) async {
      await open(tester);
      await place(tester);
      expect(_sent, hasLength(1));
      expect(_sent.single.containsKey('deliverySlot'), isFalse);
      expect(_sent.single.containsKey('estimatedDeliveryDate'), isFalse);
    });

    group('delivery fee from the server quote (no zone is ever shown)', () {
      Finder snack(String text) => find.descendant(of: find.byType(SnackBar), matching: find.text(text));

      for (final lang in ['en', 'fr']) {
        final s = Strings(lang);

        testWidgets('the quoted fee and warehouse are shown, no zone anywhere ($lang)', (tester) async {
          await open(tester, lang: lang);
          expect(find.textContaining('Gombe · Kinshasa'), findsNothing, reason: 'no zone list');
          expect(find.text(lang == 'en' ? 'Delivery zone' : 'Zone de livraison'), findsNothing);
          expect(find.text(s.delivery), findsOneWidget, reason: 'the summary row says "Delivery"');
          expect(find.text(s.checkoutFromHub('Kinshasa Hub')), findsOneWidget);
          expect(find.byKey(const ValueKey('address-needs-pin')), findsNothing);
          await place(tester);
          expect(_sent.single.containsKey('zoneId'), isFalse);
          expect(_sent.single.containsKey('deliveryFeeUsd'), isFalse);
        });

        testWidgets('an unpinned address blocks the order and asks for the pin ($lang)', (tester) async {
          RealtimeStore.instance
            ..requirePinnedAddress = true
            ..addresses.clear()
            ..addresses.add(_address(commune: 'Gombe', pinned: false));
          addTearDown(() => RealtimeStore.instance.requirePinnedAddress = false);
          await open(tester, lang: lang);
          expect(find.descendant(of: find.byKey(const ValueKey('address-needs-pin')), matching: find.text(s.checkoutNeedPin)), findsOneWidget);
          expect(find.text(s.checkoutPinCta), findsOneWidget);
          await place(tester);
          expect(_sent, isEmpty);
          expect(snack(s.checkoutNeedPin), findsOneWidget);
        });

        testWidgets('a refused quote is explained in the user\'s language and can be retried ($lang)', (tester) async {
          RealtimeStore.instance.debugCallRequest = (event, [body]) async {
            if (event == 'delivery:quote') throw ApiException('Delivery is not available right now: no warehouse is open.');
            return const <dynamic>[];
          };
          await open(tester, lang: lang);
          expect(find.text(s.checkoutQuoteFailed), findsOneWidget);
          expect(find.text(s.retry), findsOneWidget);
          expect(find.text('—'), findsOneWidget, reason: 'no fee to show');
          await place(tester);
          expect(_sent, isEmpty);
          expect(snack(s.checkoutQuoteFailed), findsOneWidget);
          expect(s.serverError('Delivery is not available right now: no warehouse is open.'),
              lang == 'fr' ? contains('aucun entrepôt') : contains('no warehouse'));
        });
      }

      testWidgets('without the pin requirement an unpinned address is still quoted and ordered (old servers)', (tester) async {
        RealtimeStore.instance
          ..addresses.clear()
          ..addresses.add(_address(commune: 'Gombe', pinned: false));
        RealtimeStore.instance.debugCallRequest = gapCalls(quote: (_) => gapQuoteJson(pinned: false, fallback: 'city'));
        await open(tester);
        expect(find.byKey(const ValueKey('address-needs-pin')), findsNothing);
        await place(tester);
        expect(_sent, hasLength(1));
      });

      testWidgets('"Pin on the map" opens the address form for that address', (tester) async {
        RealtimeStore.instance
          ..requirePinnedAddress = true
          ..addresses.clear()
          ..addresses.add(_address(commune: 'Gombe', pinned: false));
        addTearDown(() => RealtimeStore.instance.requirePinnedAddress = false);
        await open(tester);
        await tester.tap(find.byKey(const ValueKey('fix-address')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        expect(find.byType(AddressFormScreen), findsOneWidget);
      });

      testWidgets('a different delivery address is quoted again with its own fee', (tester) async {
        final store = RealtimeStore.instance;
        store.addresses
          ..clear()
          ..addAll([_address(commune: 'Limete', id: 'a1'), _address(commune: 'Gombe', id: 'a2')]);
        await open(tester);
        expect(find.text(const Strings('en').checkoutFromHub('Kinshasa Hub')), findsOneWidget);
        ShopState.instance.selectedAddressId = 'a2';
        store.notifyListeners();
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(find.text(const Strings('en').checkoutFromHub('Limete Hub')), findsOneWidget);
      });
    });
  });

  group('Product page · variants', () {
    const variants = '[{"name":"Size","options":["41","42","43"]},{"name":"Colour","options":["Black","White"]}]';

    setUp(() async {
      await gapReset(products: [
        gapDto('shoe', stock: 8, variants: variants),
        gapDto('plain', stock: 8),
      ]);
      final store = RealtimeStore.instance;
      store.debugPlaceOrderRequest = _fakeServer;
      _sent.clear();
    });

    Future<void> open(WidgetTester tester, String uuid, {String lang = 'en'}) async {
      gapTallViewport(tester);
      await Strings.setLang(lang, persist: false);
      await tester.pumpWidget(gapApp(ProductDetailScreen(product: productByUuid(uuid)!, locale: Locale(lang)), lang: lang));
      await tester.pump(const Duration(milliseconds: 300));
    }

    Finder addButton() => find.widgetWithIcon(IconButton, Icons.add_shopping_cart_rounded);

    Future<void> tapAdd(WidgetTester tester) async {
      await tester.tap(addButton());
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
    }

    Future<void> choose(WidgetTester tester, String group, String option) async {
      await tester.tap(find.byKey(ValueKey('variant-$group-$option')));
      await tester.pump();
    }

    Finder snack(String text) => find.descendant(of: find.byType(SnackBar), matching: find.text(text));

    testWidgets('shows a chip for every option of every group', (tester) async {
      await open(tester, 'shoe');
      for (final o in ['41', '42', '43']) {
        expect(find.byKey(ValueKey('variant-Size-$o')), findsOneWidget);
      }
      for (final o in ['Black', 'White']) {
        expect(find.byKey(ValueKey('variant-Colour-$o')), findsOneWidget);
      }
      expect(find.byKey(const ValueKey('variant-title-Size')), findsOneWidget);
      expect(find.byKey(const ValueKey('variant-title-Colour')), findsOneWidget);
    });

    testWidgets('a product without options has no chips and adds with the Default variant', (tester) async {
      await open(tester, 'plain');
      expect(find.byType(ChoiceChip), findsNothing);
      await tapAdd(tester);
      expect(ShopState.instance.cart.single.variant, 'Default');
      expect(snack(const Strings('en').addedToCart), findsOneWidget);
    });

    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);

      testWidgets('the product page shows the seller\'s delivery time and the expected day ($lang)', (tester) async {
        await open(tester, 'shoe', lang: lang);
        expect(find.descendant(of: find.byKey(const ValueKey('pd-delivery')), matching: find.text(s.pdDeliveryDays(deliveryDaysFallback, dayLabel(estimateFor([deliveryDaysFallback]), lang)))), findsOneWidget);
      });

      testWidgets('Add to cart without choosing says "Choose a Size" and adds nothing ($lang)', (tester) async {
        await open(tester, 'shoe', lang: lang);
        await tapAdd(tester);
        expect(snack(s.chooseOption('Size')), findsOneWidget);
        expect(snack(lang == 'en' ? 'Choose a size first' : 'Choisissez d’abord : size'), findsOneWidget, reason: 'the option name reads in lower case');
        expect(ShopState.instance.cart, isEmpty);
        expect(snack(s.addedToCart), findsNothing);
      });

      testWidgets('with Size chosen but not Colour it asks for the Colour ($lang)', (tester) async {
        await open(tester, 'shoe', lang: lang);
        await choose(tester, 'Size', '42');
        await tapAdd(tester);
        expect(snack(s.chooseOption('Colour')), findsOneWidget);
        expect(ShopState.instance.cart, isEmpty);
      });

      testWidgets('after choosing, the cart line carries "Size: 42 · Colour: Black" ($lang)', (tester) async {
        await open(tester, 'shoe', lang: lang);
        await choose(tester, 'Size', '42');
        await choose(tester, 'Colour', 'Black');
        expect(tester.widget<ChoiceChip>(find.byKey(const ValueKey('variant-Size-42'))).selected, isTrue);
        expect(tester.widget<ChoiceChip>(find.byKey(const ValueKey('variant-Size-41'))).selected, isFalse);
        expect(tester.widget<Text>(find.byKey(const ValueKey('variant-title-Size'))).data, 'Size: 42');
        await tapAdd(tester);
        final line = ShopState.instance.cart.single;
        expect(line.variant, 'Size: 42 · Colour: Black');
        expect(line.qty, 1);
        expect(snack(s.addedToCart), findsOneWidget);
      });
    }

    testWidgets('changing the choice changes the variant; different variants are separate lines', (tester) async {
      await open(tester, 'shoe');
      await choose(tester, 'Size', '41');
      await choose(tester, 'Colour', 'White');
      await tapAdd(tester);
      await choose(tester, 'Size', '43');
      await tapAdd(tester);
      expect(ShopState.instance.cart.map((c) => c.variant), ['Size: 41 · Colour: White', 'Size: 43 · Colour: White']);
    });

    testWidgets('Buy now without choosing is blocked the same way', (tester) async {
      await open(tester, 'shoe');
      await tester.tap(find.byType(FilledButton).last);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(snack(const Strings('en').chooseOption('Size')), findsOneWidget);
      expect(find.byType(CheckoutScreen), findsNothing);
    });

    testWidgets('Buy now after choosing opens the checkout with that variant and leaves the cart alone', (tester) async {
      RealtimeStore.instance.addresses.add(_address(commune: 'Gombe'));
      RealtimeStore.instance.walletBalance = 1000;
      await open(tester, 'shoe');
      await choose(tester, 'Size', '42');
      await choose(tester, 'Colour', 'Black');
      await tester.tap(find.byType(FilledButton).last);
      await tester.pumpAndSettle();
      expect(find.byType(CheckoutScreen), findsOneWidget);
      expect(ShopState.instance.cart, isEmpty);
      await tester.tap(find.byKey(const ValueKey('pay-wallet')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('place-order')));
      await tester.pump(const Duration(milliseconds: 400));
      expect((_sent.single['items'] as List).single, {'productId': 'shoe', 'qty': 1, 'variant': 'Size: 42 · Colour: Black'});
    });
  });
}
