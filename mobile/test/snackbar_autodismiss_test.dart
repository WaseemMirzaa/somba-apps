// A SnackBar that has an `action` stays on screen until it is dismissed unless `persist: false` is set
// (Flutter 3.35+). "Added to cart — Cart" used to cover the bottom of every page for minutes. Every
// snackbar with an action must go away on its own after its normal duration, action still tappable.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/cart_screen.dart';
import 'package:lipcart/screens/product_detail_screen.dart';
import 'package:lipcart/widgets/product_actions.dart';

import 'gap_helpers.dart';

void main() {
  setUpAll(gapLoadFonts);
  setUp(() => gapReset(products: [gapDto('p1', stock: 10), gapDto('p2', stock: 10, price: 30)]));
  tearDown(gapTearDown);

  const s = Strings('en');
  Finder snackBar() => find.byType(SnackBar);
  Finder action(String label) => find.descendant(of: find.byType(SnackBarAction), matching: find.text(label));

  /// Past a snackbar's default 4 s on screen, plus the time it takes to slide out.
  Future<void> waitItOut(WidgetTester tester) async {
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
  }

  group('snackbars with an action dismiss themselves', () {
    testWidgets('"Added to cart — Cart" from a product card leaves after its duration', (tester) async {
      await tester.pumpWidget(gapApp(Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () => addProductToCart(context, productByUuid('p1')!, const Locale('en')),
            child: const Text('add'),
          ),
        ),
      )));
      await tester.tap(find.text('add'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(ShopState.instance.cart, hasLength(1));
      expect(snackBar(), findsOneWidget);
      expect(action(s.cart), findsOneWidget);

      // Still there while it is being read...
      await tester.pump(const Duration(seconds: 2));
      expect(snackBar(), findsOneWidget);

      // ...gone once its time is up, with nobody having touched it.
      await waitItOut(tester);
      expect(snackBar(), findsNothing);
    });

    testWidgets('its action is tappable while it shows, and opens the cart', (tester) async {
      gapTallViewport(tester);
      await tester.pumpWidget(gapApp(Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () => addProductToCart(context, productByUuid('p1')!, const Locale('en')),
            child: const Text('add'),
          ),
        ),
      )));
      await tester.tap(find.text('add'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.tap(action(s.cart));
      await tester.pumpAndSettle();
      expect(find.byType(CartScreen), findsOneWidget);
    });

    testWidgets('"Added to cart — Cart" on the product page leaves after its duration', (tester) async {
      gapTallViewport(tester);
      await tester.pumpWidget(gapApp(ProductDetailScreen(product: productByUuid('p1')!, locale: const Locale('en'))));
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tap(find.widgetWithIcon(IconButton, Icons.add_shopping_cart_rounded));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.descendant(of: snackBar(), matching: find.text(s.addedToCart)), findsOneWidget);
      expect(action(s.cart), findsOneWidget);

      await waitItOut(tester);
      expect(snackBar(), findsNothing);
    });

    testWidgets('"Removed — Undo" in the cart leaves after its duration', (tester) async {
      ShopState.instance.addToCart(productByUuid('p1')!);
      ShopState.instance.addToCart(productByUuid('p2')!);
      gapTallViewport(tester);
      await tester.pumpWidget(gapApp(const CartScreen(locale: Locale('en'))));
      await tester.pump();
      await tester.tap(find.byKey(ValueKey('remove-${productByUuid('p2')!.id}')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(snackBar(), findsOneWidget);
      expect(action(s.undo), findsOneWidget);

      await waitItOut(tester);
      expect(snackBar(), findsNothing);
      expect(ShopState.instance.cart.map((c) => c.product.uuid), ['p1'], reason: 'the removal stands once Undo is no longer offered');
    });
  });

  // Whatever is added later: a SnackBarAction inside a SnackBar that does not say `persist: false` would bring the bug back.
  test('every SnackBar with an action in lib/ opts out of persisting', () {
    final offenders = <String>[];
    for (final f in Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
      final src = f.readAsStringSync();
      for (final m in RegExp(r'SnackBarAction\(').allMatches(src)) {
        final start = src.lastIndexOf('SnackBar(', m.start);
        if (start == -1 || !src.substring(start, m.start).contains('persist: false')) {
          offenders.add('${f.path}:${'\n'.allMatches(src.substring(0, m.start)).length + 1}');
        }
      }
    }
    expect(offenders, isEmpty, reason: 'SnackBar with an action but no `persist: false`');
  });
}
