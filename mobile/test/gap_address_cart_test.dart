// Address form (landmark, delivery-zone line, edit mode, phone check) and the cart screen
// (remove with Undo, save for later, low stock, price change) in English and French.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/cart_screen.dart';
import 'package:lipcart/screens/more/support_extra.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/util/format.dart';

import 'gap_helpers.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  tearDown(gapTearDown);

  group('Address form', () {
    setUp(() => gapReset());

    Future<void> open(WidgetTester tester, String lang, {AddressDto? existing}) async {
      gapTallViewport(tester);
      await Strings.setLang(lang, persist: false);
      await tester.pumpWidget(gapApp(AddressFormScreen(locale: Locale(lang), existing: existing), lang: lang));
      await tester.pump();
    }

    Finder fieldIn(String key) => find.descendant(of: find.byKey(ValueKey(key)), matching: find.byType(TextField));

    /// The N-th text field of the form: label 0, phone 1, street 2, landmark 3, commune 4, city 5.
    Finder field(int n) => find.byType(TextField).at(n);

    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);

      testWidgets('has a landmark field with its label ($lang)', (tester) async {
        await open(tester, lang);
        expect(find.byKey(const ValueKey('address-landmark')), findsOneWidget);
        expect(find.text(s.addrLandmark), findsOneWidget);
        await tester.enterText(fieldIn('address-landmark'), 'Blue gate');
        expect(find.text('Blue gate'), findsOneWidget);
      });

      testWidgets('no zone line until a commune is typed ($lang)', (tester) async {
        await open(tester, lang);
        expect(find.byKey(const ValueKey('address-zone')), findsNothing);
      });

      testWidgets('commune Gombe shows the zone name and its fee ($lang)', (tester) async {
        await open(tester, lang);
        await tester.enterText(field(4), 'Gombe');
        await tester.pump();
        expect(find.byKey(const ValueKey('address-zone')), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('address-zone')), matching: find.text(s.addrZoneOk(money(3)))), findsOneWidget);
        expect(find.text(s.addrZoneNone), findsNothing);
      });

      testWidgets('the zone matches "Commune de Limete" and ignores case/accents ($lang)', (tester) async {
        await open(tester, lang);
        await tester.enterText(field(4), 'COMMUNE DE LIMETÉ');
        await tester.pump();
        expect(find.text(s.addrZoneOk(money(5))), findsOneWidget, reason: 'Limete is priced; the zone itself is not named');
        expect(find.text(s.addrZoneNone), findsNothing);
      });

      testWidgets('an unknown commune says we do not deliver there ($lang)', (tester) async {
        await open(tester, lang);
        await tester.enterText(field(4), 'Narnia');
        await tester.pump();
        expect(find.byKey(const ValueKey('address-zone')), findsOneWidget);
        expect(find.text(s.addrZoneNone), findsOneWidget);
        expect(find.textContaining('Zone'), findsNothing, reason: 'no zone name is claimed');
      });

      testWidgets('a commune in another city than the zone is not matched ($lang)', (tester) async {
        await open(tester, lang);
        await tester.enterText(field(4), 'Gombe');
        await tester.enterText(field(5), 'Lubumbashi');
        await tester.pump();
        expect(find.text(s.addrZoneNone), findsOneWidget);
      });

      testWidgets('zones from the server replace the fallback ones ($lang)', (tester) async {
        RealtimeStore.instance.zones = [gapZones.last];
        await open(tester, lang);
        await tester.enterText(field(4), 'Gombe');
        await tester.pump();
        expect(find.text(s.addrZoneNone), findsOneWidget, reason: 'Gombe is not in the server list');
        await tester.enterText(field(4), 'Limete');
        await tester.pump();
        expect(find.text(s.addrZoneOk(money(5))), findsOneWidget);
      });

      testWidgets('an invalid phone shows a snackbar and nothing is saved ($lang)', (tester) async {
        await open(tester, lang);
        await tester.enterText(field(1), '12');
        await tester.enterText(field(2), '12 Avenue de la Paix');
        await tester.tap(find.byKey(const ValueKey('save-address')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        expect(find.descendant(of: find.byType(SnackBar), matching: find.text(s.mmInvalid)), findsOneWidget);
        expect(find.text(s.mmInvalid), findsNWidgets(2), reason: 'inline error stays beside the snackbar');
        expect(RealtimeStore.instance.addresses, isEmpty);
        expect(find.byType(AddressFormScreen), findsOneWidget, reason: 'the form stays open');
      });

      testWidgets('a missing street shows a snackbar ($lang)', (tester) async {
        await open(tester, lang);
        await tester.tap(find.byKey(const ValueKey('save-address')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        expect(find.descendant(of: find.byType(SnackBar), matching: find.text(s.addrErrStreet)), findsOneWidget);
      });

      testWidgets('edit mode pre-fills every field and uses the edit title ($lang)', (tester) async {
        final a = AddressDto(
          id: 'a1',
          label: 'Office',
          line1: '5 Rue du Marché',
          line2: 'Near the pharmacy',
          commune: 'Limete',
          city: 'Kinshasa',
          phone: '+243 81 234 5678',
          isDefault: true,
        );
        await open(tester, lang, existing: a);
        expect(find.text(s.addrEditTitle), findsOneWidget);
        expect(find.text(s.addrTitle), findsNothing);
        // label, phone, street, landmark, commune, city
        final values = [for (var i = 0; i < 6; i++) tester.widget<TextField>(field(i)).controller!.text];
        expect(values, ['Office', '+243 81 234 5678', '5 Rue du Marché', 'Near the pharmacy', 'Limete', 'Kinshasa']);
        expect(tester.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value, isTrue);
        expect(find.text(s.addrZoneOk(money(5))), findsOneWidget, reason: 'zone line is live from the first frame');
      });

      testWidgets('create mode uses the add title and a default label ($lang)', (tester) async {
        await open(tester, lang);
        expect(find.text(s.addrTitle), findsOneWidget);
        expect(find.text(s.addrEditTitle), findsNothing);
        expect(find.text(s.addrLabelDefault), findsOneWidget);
      });

      testWidgets('without a Maps key the map shows the unavailable note ($lang)', (tester) async {
        await open(tester, lang);
        expect(find.byKey(const ValueKey('map-unavailable')), findsOneWidget);
        expect(find.byKey(const ValueKey('address-map')), findsNothing);
        expect(find.text(s.addrMapUnavailable), findsOneWidget);
      });
    }
  });

  group('Cart screen', () {
    setUp(() => gapReset(products: [gapDto('p1', stock: 10), gapDto('p2', stock: 10, price: 30), gapDto('low', stock: 3, price: 12)]));

    Future<void> open(WidgetTester tester, String lang) async {
      gapTallViewport(tester);
      await Strings.setLang(lang, persist: false);
      await tester.pumpWidget(gapApp(CartScreen(locale: Locale(lang)), lang: lang));
      await tester.pump();
    }

    Key removeKey(String uuid) => ValueKey('remove-${productByUuid(uuid)!.id}');
    Key saveKey(String uuid) => ValueKey('save-later-${productByUuid(uuid)!.id}');
    List<String> cartIds() => ShopState.instance.cart.map((c) => c.product.uuid).toList();

    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);
      String name(String id) => lang == 'fr' ? 'Article $id' : 'Item $id';

      testWidgets('Remove shows a snackbar and Undo restores the line in place ($lang)', (tester) async {
        final shop = ShopState.instance;
        shop.addToCart(productByUuid('p1')!, qty: 2);
        shop.addToCart(productByUuid('p2')!);
        shop.addToCart(productByUuid('low')!);
        await open(tester, lang);
        await tester.tap(find.byKey(removeKey('p2')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        expect(cartIds(), ['p1', 'low']);
        expect(find.descendant(of: find.byType(SnackBar), matching: find.text(s.cartRemoved(name('p2')))), findsOneWidget);
        expect(find.byKey(removeKey('p2')), findsNothing);

        await tester.tap(find.text(s.undo));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        expect(cartIds(), ['p1', 'p2', 'low'], reason: 'back where it was');
        expect(find.byKey(removeKey('p2')), findsOneWidget);
        expect(shop.cart.first.qty, 2, reason: 'other lines untouched');
      });

      testWidgets('removing the last line empties the cart; Undo brings it back ($lang)', (tester) async {
        ShopState.instance.addToCart(productByUuid('p1')!);
        await open(tester, lang);
        await tester.tap(find.byKey(removeKey('p1')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        expect(find.text(s.cartEmpty), findsOneWidget);
        await tester.tap(find.text(s.undo));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        expect(cartIds(), ['p1']);
        expect(find.byKey(removeKey('p1')), findsOneWidget);
      });

      testWidgets('Save for later moves the line to the Saved section and back ($lang)', (tester) async {
        final shop = ShopState.instance;
        shop.addToCart(productByUuid('p1')!);
        shop.addToCart(productByUuid('p2')!);
        await open(tester, lang);
        expect(find.byKey(const ValueKey('saved-for-later-title')), findsNothing);

        await tester.tap(find.byKey(saveKey('p1')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        expect(cartIds(), ['p2']);
        expect(shop.savedForLater.map((c) => c.product.uuid), ['p1']);
        expect(find.byKey(const ValueKey('saved-for-later-title')), findsOneWidget);
        expect(find.text(s.cartSavedSection(1)), findsOneWidget);
        expect(find.descendant(of: find.byType(SnackBar), matching: find.text(s.cartSavedForLater(name('p1')))), findsOneWidget);
        expect(find.byKey(ValueKey('move-to-cart-${productByUuid('p1')!.id}')), findsOneWidget);

        await tester.tap(find.byKey(ValueKey('move-to-cart-${productByUuid('p1')!.id}')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        expect(shop.savedForLater, isEmpty);
        expect(cartIds(), containsAll(['p1', 'p2']));
        expect(find.byKey(const ValueKey('saved-for-later-title')), findsNothing);
        expect(find.descendant(of: find.byType(SnackBar), matching: find.text(s.cartMovedToCart(name('p1')))), findsOneWidget);
      });

      testWidgets('saving the only line still shows the Saved section, not the empty state ($lang)', (tester) async {
        ShopState.instance.addToCart(productByUuid('p1')!);
        await open(tester, lang);
        await tester.tap(find.byKey(saveKey('p1')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        expect(find.byKey(const ValueKey('saved-for-later-title')), findsOneWidget);
        expect(find.text(name('p1')), findsOneWidget);
      });

      testWidgets('a saved line whose product sold out cannot be moved ($lang)', (tester) async {
        final shop = ShopState.instance;
        shop.addToCart(productByUuid('p1')!);
        shop.saveForLater(0);
        RealtimeStore.instance.products
          ..clear()
          ..addAll([gapDto('p1', stock: 0), gapDto('p2', stock: 10, price: 30)]);
        await open(tester, lang);
        final btn = tester.widget<TextButton>(find.byKey(ValueKey('move-to-cart-${productByUuid('p1')!.id}')));
        expect(btn.onPressed, isNull);
        expect(find.text(s.pdOutOfStock), findsOneWidget);
      });

      testWidgets('low stock line shows for stock <= 5 only ($lang)', (tester) async {
        final shop = ShopState.instance;
        shop.addToCart(productByUuid('low')!); // stock 3
        shop.addToCart(productByUuid('p1')!); // stock 10
        await open(tester, lang);
        final key = ValueKey('cart-low-stock-${productByUuid('low')!.id}');
        expect(find.byKey(key), findsOneWidget);
        expect(find.text(s.cartOnlyLeft(3)), findsOneWidget);
        expect(find.byKey(ValueKey('cart-low-stock-${productByUuid('p1')!.id}')), findsNothing);
      });

      testWidgets('exactly 5 in stock is "low", 6 is not ($lang)', (tester) async {
        RealtimeStore.instance.products
          ..clear()
          ..addAll([gapDto('five', stock: 5), gapDto('six', stock: 6)]);
        ShopState.instance.addToCart(productByUuid('five')!);
        ShopState.instance.addToCart(productByUuid('six')!);
        await open(tester, lang);
        expect(find.byKey(ValueKey('cart-low-stock-${productByUuid('five')!.id}')), findsOneWidget);
        expect(find.byKey(ValueKey('cart-low-stock-${productByUuid('six')!.id}')), findsNothing);
      });

      testWidgets('price drop since adding is pointed out ($lang)', (tester) async {
        ShopState.instance.addToCart(productByUuid('p1')!); // $20 now
        ShopState.instance.cart.single.priceWhenAdded = 25;
        await open(tester, lang);
        expect(find.byKey(ValueKey('cart-price-change-${productByUuid('p1')!.id}')), findsOneWidget);
        expect(find.text(s.cartPriceDown(money(25))), findsOneWidget);
        expect(find.text(s.cartPriceUp(money(25))), findsNothing);
      });

      testWidgets('price rise since adding is pointed out ($lang)', (tester) async {
        ShopState.instance.addToCart(productByUuid('p1')!);
        ShopState.instance.cart.single.priceWhenAdded = 15;
        await open(tester, lang);
        expect(find.text(s.cartPriceUp(money(15))), findsOneWidget);
        expect(find.text(s.cartPriceDown(money(15))), findsNothing);
      });

      testWidgets('no price-change text when the price is unchanged ($lang)', (tester) async {
        ShopState.instance.addToCart(productByUuid('p1')!);
        await open(tester, lang);
        expect(find.byKey(ValueKey('cart-price-change-${productByUuid('p1')!.id}')), findsNothing);
      });

      testWidgets('a price that moved while the cart was open shows up live ($lang)', (tester) async {
        ShopState.instance.addToCart(productByUuid('p1')!);
        await open(tester, lang);
        RealtimeStore.instance.products
          ..clear()
          ..addAll([gapDto('p1', stock: 10, price: 16), gapDto('p2', stock: 10, price: 30), gapDto('low', stock: 3, price: 12)]);
        RealtimeStore.instance.notifyListeners();
        await tester.pump();
        expect(find.text(s.cartPriceDown(money(20))), findsOneWidget);
      });
    }
  });
}
