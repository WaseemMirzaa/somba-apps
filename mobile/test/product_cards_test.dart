// Product cards on Search / Wishlist (and the other grids that share the helper)
// must open the product page on tap and add to the cart on "+".
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/screens/more/account_more.dart';
import 'package:lipcart/screens/more/auth_screens.dart';
import 'package:lipcart/screens/more/search_screen.dart';
import 'package:lipcart/screens/product_detail_screen.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

ProductDto _dto() => ProductDto(
      id: 'p-test-1',
      name: 'Widget Test Phone',
      nameFr: '',
      price: 25,
      originalPrice: 25,
      discount: 0,
      category: 'Electronics',
      categoryFr: '',
      image: '',
      stock: 9,
      rating: 4,
      reviews: 2,
    );

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    final store = RealtimeStore.instance;
    store.products
      ..clear()
      ..add(_dto());
    store.wishlistIds
      ..clear()
      ..add('p-test-1');
    ShopState.instance.cart.clear();
  });

  tearDown(() {
    RealtimeStore.instance.products.clear();
    RealtimeStore.instance.wishlistIds.clear();
    ShopState.instance.cart.clear();
  });

  Future<void> exercise(WidgetTester tester, Widget screen) async {
    tester.view.physicalSize = const Size(900, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: screen));
    await tester.pumpAndSettle();
    expect(find.text('Widget Test Phone'), findsWidgets);

    // "+" adds one to the cart and offers a Cart shortcut.
    await tester.tap(find.byIcon(Icons.add_rounded).first);
    await tester.pump();
    expect(ShopState.instance.cart, hasLength(1));
    expect(ShopState.instance.cart.first.qty, 1);
    expect(find.text('Cart'), findsOneWidget);

    // Tapping the card opens the product page.
    await tester.tap(find.text('Widget Test Phone').first);
    await tester.pumpAndSettle();
    expect(find.byType(ProductDetailScreen), findsOneWidget);
  }

  testWidgets('wishlist cards open the product and add to the cart', (tester) async {
    await exercise(tester, const WishlistScreen());
  });

  testWidgets('search result cards open the product and add to the cart', (tester) async {
    await exercise(tester, const SearchScreen(initialText: 'Widget'));
  });

  testWidgets('terms box starts unchecked and the policy text opens a dialog', (tester) async {
    tester.view.physicalSize = const Size(900, 2000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(const MaterialApp(home: RegisterScreen()));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.check_box_outline_blank_rounded), findsOneWidget);
    expect(find.byIcon(Icons.check_box_rounded), findsNothing);

    // The policy words are a link: the dialog opens without ticking the box.
    await tester.tapOnText(find.textRange.ofSubstring('Terms & Privacy Policy'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('terms-body')), findsOneWidget);
  });
}
