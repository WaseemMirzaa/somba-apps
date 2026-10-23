// Checkout (estimated delivery from the sellers' delivery times, zone matched from the address) and the product page (variant choice).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/checkout_screen.dart';
import 'package:lipcart/screens/more/support_extra.dart';
import 'package:lipcart/screens/product_detail_screen.dart';
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

AddressDto _address({String? commune, String? zoneId, String id = 'a1', String city = 'Kinshasa'}) =>
    AddressDto(id: id, label: 'Home', line1: '12 Avenue de la Paix', city: city, commune: commune, zoneId: zoneId, isDefault: true);

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  tearDown(gapTearDown);

  group('Checkout · delivery time and zone', () {
    setUp(() async {
      await gapReset();
      _sent.clear();
      final store = RealtimeStore.instance;
      store.walletBalance = 1000;
      store.zones = List.of(gapZones);
      store.addresses.add(_address(commune: 'Gombe'));
      store.debugPlaceOrderRequest = _fakeServer;
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
      store.zones = List.of(gapZones);
      store.addresses.add(_address(commune: 'Gombe'));
      store.debugPlaceOrderRequest = _fakeServer;
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

    group('zone from the delivery address (never shown to the shopper)', () {
      Finder snack(String text) => find.descendant(of: find.byType(SnackBar), matching: find.text(text));

      for (final lang in ['en', 'fr']) {
        final s = Strings(lang);

        testWidgets('commune Limete is priced and sent as the Limete zone, with no zone shown ($lang)', (tester) async {
          RealtimeStore.instance.addresses
            ..clear()
            ..add(_address(commune: 'Limete'));
          await open(tester, lang: lang);
          expect(ShopState.instance.selectedZoneId, 'zone-limete');
          expect(find.textContaining('Gombe · Kinshasa'), findsNothing, reason: 'no zone list');
          expect(find.textContaining('Limete · Kinshasa'), findsNothing);
          expect(find.text(lang == 'en' ? 'Delivery zone' : 'Zone de livraison'), findsNothing);
          expect(find.text(s.delivery), findsOneWidget, reason: 'the summary row says "Delivery", not the zone');
          expect(find.byKey(const ValueKey('address-not-served')), findsNothing);
          await place(tester);
          expect(_sent.single['zoneId'], 'zone-limete');
          expect(_sent.single['deliveryFeeUsd'], 5);
          expect(_sent.single['shippingAddress'], contains('"zone":"zone-limete"'));
        });

        testWidgets('a commune outside every zone blocks the order with "we don\'t deliver here" ($lang)', (tester) async {
          RealtimeStore.instance.addresses
            ..clear()
            ..add(_address(commune: 'Narnia'));
          await open(tester, lang: lang);
          expect(find.byKey(const ValueKey('address-not-served')), findsOneWidget);
          expect(find.descendant(of: find.byKey(const ValueKey('address-not-served')), matching: find.text(s.checkoutNotServed)), findsOneWidget);
          expect(find.text(s.checkoutChangeAddress), findsOneWidget);
          expect(find.text('—'), findsOneWidget, reason: 'no fee to show');
          await place(tester);
          expect(_sent, isEmpty);
          expect(snack(s.checkoutNotServed), findsOneWidget);
        });

        testWidgets('an address without a commune asks for it and blocks the order ($lang)', (tester) async {
          RealtimeStore.instance.addresses
            ..clear()
            ..add(_address());
          await open(tester, lang: lang);
          expect(find.descendant(of: find.byKey(const ValueKey('address-not-served')), matching: find.text(s.checkoutNeedCommune)), findsOneWidget);
          expect(find.text(s.checkoutEditAddress), findsOneWidget);
          await place(tester);
          expect(_sent, isEmpty);
          expect(snack(s.checkoutNeedCommune), findsOneWidget);
        });
      }

      testWidgets('the match ignores accents, case and the "Commune de" prefix', (tester) async {
        RealtimeStore.instance.addresses
          ..clear()
          ..add(_address(commune: 'Commune de LIMETÉ'));
        await open(tester);
        expect(ShopState.instance.selectedZoneId, 'zone-limete');
        expect(find.byKey(const ValueKey('address-not-served')), findsNothing);
      });

      testWidgets('the zone id saved on the address wins over the commune', (tester) async {
        RealtimeStore.instance.addresses
          ..clear()
          ..add(_address(commune: 'Gombe', zoneId: 'zone-limete'));
        await open(tester);
        expect(ShopState.instance.selectedZoneId, 'zone-limete');
        await place(tester);
        expect(_sent.single['zoneId'], 'zone-limete');
      });

      testWidgets('a commune of another city is not served', (tester) async {
        RealtimeStore.instance.addresses
          ..clear()
          ..add(_address(commune: 'Limete', city: 'Lubumbashi'));
        await open(tester);
        expect(find.byKey(const ValueKey('address-not-served')), findsOneWidget);
        await place(tester);
        expect(_sent, isEmpty);
      });

      testWidgets('"Edit this address" opens the address form for that address', (tester) async {
        RealtimeStore.instance.addresses
          ..clear()
          ..add(_address());
        await open(tester);
        await tester.tap(find.byKey(const ValueKey('fix-address')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        expect(find.byType(AddressFormScreen), findsOneWidget);
      });

      testWidgets('a different delivery address re-applies its own zone and fee', (tester) async {
        final store = RealtimeStore.instance;
        store.addresses
          ..clear()
          ..addAll([_address(commune: 'Limete', id: 'a1'), _address(commune: 'Gombe', id: 'a2')]);
        await open(tester);
        expect(ShopState.instance.selectedZoneId, 'zone-limete');
        ShopState.instance.selectedAddressId = 'a2';
        store.notifyListeners();
        await tester.pump();
        expect(ShopState.instance.selectedZoneId, 'zone-gombe');
        await place(tester);
        expect(_sent.single['zoneId'], 'zone-gombe');
        expect(_sent.single['deliveryFeeUsd'], 3);
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
      store.zones = List.of(gapZones);
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
