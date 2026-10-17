// French texts are longer than English ones: render the main screens in French
// on a small phone (360 x 740) and fail on any layout overflow or exception.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/app.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/cart_screen.dart';
import 'package:lipcart/screens/checkout_screen.dart';
import 'package:lipcart/screens/more/account_more.dart';
import 'package:lipcart/screens/more/auth_screens.dart';
import 'package:lipcart/screens/more/order_screens.dart';
import 'package:lipcart/screens/more/settings_extra.dart';
import 'package:lipcart/screens/more/support_extra.dart';
import 'package:lipcart/screens/product_detail_screen.dart';
import 'package:lipcart/screens/wallet_screen.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/theme/app_theme.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:shared_preferences/shared_preferences.dart';

ProductDto _product() => ProductDto(
      id: 'p1',
      name: 'Phone',
      nameFr: 'Téléphone intelligent avec un nom assez long pour la grille',
      price: 120,
      originalPrice: 150,
      discount: 20,
      category: 'Electronics',
      categoryFr: 'Électronique',
      image: '',
      stock: 3,
      rating: 4.5,
      reviews: 1200,
      sellerId: 's1',
      sellerName: 'Boutique Kin',
    );

OrderDto _order(String status) => OrderDto(
      id: 'o-$status',
      reference: 'SOM-1042',
      customerName: 'Aline',
      status: status,
      paymentMethod: 'airtel_money',
      totalUsd: 123,
      subtotalUsd: 120,
      deliveryFeeUsd: 3,
      createdAt: DateTime(2026, 10, 1, 9, 30),
      items: [OrderItemDto(productId: 'p1', productName: 'Phone', variant: 'Default', qty: 1, priceUsd: 120)],
    );

const _lang = String.fromEnvironment('LAYOUT_LANG', defaultValue: 'fr');

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    // Real text widths: the app's bundled fonts (tests otherwise measure with the fixed-width "Ahem" font).
    TestWidgetsFlutterBinding.ensureInitialized();
    for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
      await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
    }
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await Strings.setLang(_lang, persist: false);
    final store = RealtimeStore.instance;
    store.products
      ..clear()
      ..add(_product());
    store.orders
      ..clear()
      ..addAll([_order('pending'), _order('out_for_delivery'), _order('delivered')]);
    ShopState.instance.cart.clear();
  });

  tearDown(() {
    RealtimeStore.instance.products.clear();
    RealtimeStore.instance.orders.clear();
    ShopState.instance.cart.clear();
  });

  Future<void> show(WidgetTester tester, Widget screen) async {
    tester.view.physicalSize = const Size(360 * 3, 740 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      locale: const Locale(_lang),
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      theme: AppTheme.light(), // the app's own fonts: the default test font (Ahem) is far wider than real text
      home: screen,
    ));
    await tester.pump(const Duration(milliseconds: 600));
  }

  const fr = Locale('fr');
  final screens = <String, Widget Function()>{
    'sign in': () => const LoginScreen(),
    'sign up': () => const RegisterScreen(),
    'verify phone': () => const OtpScreen(phone: '+243812345678'),
    'forgot password': () => const ForgotScreen(),
    'reset password': () => const ResetPasswordScreen(),
    'cart (empty)': () => const CartScreen(locale: fr),
    'settings': () => const CustomerSettingsScreen(locale: fr),
    'edit profile': () => const CustomerEditProfileScreen(locale: fr),
    'help': () => const HelpScreen(locale: fr),
    'delete account': () => const AccountDeleteScreen(),
    'new address': () => const AddressFormScreen(locale: fr),
    'address book': () => const AddressBookScreen(locale: fr),
    'wallet': () => const WalletScreen(locale: fr),
    'notifications': () => const NotificationsScreen(locale: fr),
    'order (pending)': () => const OrderDetailScreen(locale: fr, orderId: 'o-pending'),
    'order tracking': () => const OrderTrackingScreen(locale: fr, orderId: 'o-out_for_delivery'),
    'order (delivered)': () => const OrderDetailScreen(locale: fr, orderId: 'o-delivered'),
  };

  for (final e in screens.entries) {
    testWidgets('French layout: ${e.key}', (tester) async {
      await show(tester, e.value());
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('French layout: the five tabs of the app', (tester) async {
    await show(tester, AppShell(locale: fr, onLocaleChanged: (_) {}));
    for (final label in [const Strings('fr').categories, const Strings('fr').deals, const Strings('fr').orders, const Strings('fr').account, const Strings('fr').home]) {
      await tester.tap(find.byIcon(_navIcon(label)));
      await tester.pump(const Duration(milliseconds: 500));
      expect(tester.takeException(), isNull, reason: label);
    }
  });

  testWidgets('French layout: product page, checkout with a cart line', (tester) async {
    final p = productByUuid('p1')!;
    await show(tester, ProductDetailScreen(product: p, locale: fr));
    expect(tester.takeException(), isNull);
    ShopState.instance.addToCart(p, qty: 2);
    await show(tester, const CheckoutScreen(locale: fr));
    expect(tester.takeException(), isNull);
    await show(tester, const CartScreen(locale: fr));
    expect(tester.takeException(), isNull);
  });
}

IconData _navIcon(String label) {
  const s = Strings('fr');
  if (label == s.home) return Icons.home_rounded;
  if (label == s.categories) return Icons.grid_view_rounded;
  if (label == s.deals) return Icons.local_fire_department_rounded;
  if (label == s.orders) return Icons.receipt_long_rounded;
  return Icons.person_rounded;
}
