// Shared fixtures for the gap_*_test.dart files (not a test itself).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/data/market_profiles.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/theme/app_theme.dart';
import 'package:lipcart/util/format.dart';
import 'package:shared_preferences/shared_preferences.dart';

ProductDto gapDto(String id, {int stock = 5, double price = 20, Object? variants, int? deliveryDays}) => ProductDto.fromJson({
      'id': id,
      'name': 'Item $id',
      'nameFr': 'Article $id',
      'price': price,
      'originalPrice': price,
      'category': 'Electronics',
      'categoryFr': 'Électronique',
      'image': '',
      'stock': stock,
      if (variants != null) 'variants': variants,
      if (deliveryDays != null) 'deliveryDays': deliveryDays,
    });

BackendUser gapUser({String phone = '', String id = 'u1', String role = 'customer'}) => BackendUser.fromJson({
      'id': id,
      'email': 'customer@somba.app',
      'name': 'Aline',
      'role': role,
      'phone': phone,
      'phoneVerified': true,
      'emailVerified': true,
    });

/// The server's answer to `delivery:quote` (a pinned address in Gombe unless told otherwise).
Map<String, dynamic> gapQuoteJson({double fee = 3, bool pinned = true, String hub = 'Kinshasa Hub', double transfer = 0, String? fallback}) => {
      'feeUsd': fee,
      'deliveryUsd': fee - transfer,
      'transferUsd': transfer,
      'distanceKm': 2.5,
      'destinationHubId': 'hub-kin',
      'destinationHub': {'id': 'hub-kin', 'name': hub, 'city': 'Kinshasa'},
      'originHubIds': ['hub-kin'],
      'transfer': transfer > 0,
      'pinned': pinned,
      'fallback': fallback,
    };

/// A fake socket for screens that quote the delivery: `delivery:quote` answers [quote], every other read is empty,
/// and [extra] answers more events (event -> body -> data).
Future<dynamic> Function(String event, [Map<String, dynamic>? body]) gapCalls({
  Map<String, dynamic> Function(Map<String, dynamic>? body)? quote,
  Map<String, dynamic Function(Map<String, dynamic>? body)> extra = const {},
}) =>
    (event, [body]) async {
      final custom = extra[event];
      if (custom != null) return custom(body);
      if (event == 'delivery:quote') return (quote ?? (_) => gapQuoteJson())(body);
      return const <dynamic>[];
    };

Widget gapApp(Widget home, {String lang = 'en'}) => MaterialApp(
      theme: AppTheme.light(),
      locale: Locale(lang),
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      home: home,
    );

/// Fresh singletons for a test: mock prefs, English, USD display, a hydrated store with [products].
Future<void> gapReset({List<ProductDto>? products, String lang = 'en'}) async {
  SharedPreferences.setMockInitialValues({});
  await ShopState.instance.load();
  await Strings.setLang(lang, persist: false);
  marketNotifier.value = MarketProfileId.france; // amounts in USD
  final store = RealtimeStore.instance;
  store.products
    ..clear()
    ..addAll(products ?? [gapDto('p1'), gapDto('p2', stock: 2)]);
  store.hydrated = true;
  store.user = gapUser();
  store.debugCallRequest = gapCalls();
  store.addresses.clear();
  final shop = ShopState.instance;
  shop.cart.clear();
  shop.savedForLater.clear();
  shop.stockNotices.clear();
  shop.selectedAddressId = null;
  shop.appliedPromo = null;
}

void gapTearDown() {
  final store = RealtimeStore.instance;
  store.products.clear();
  store.addresses.clear();
  store.orders.clear();
  store.user = null;
  store.hydrated = false;
  store.walletBalance = 0;
  store.requireVerifiedForCheckout = false;
  store.debugPlaceOrderRequest = null;
  store.debugAddressRequest = null;
  store.debugCallRequest = null;
  final shop = ShopState.instance;
  shop.cart.clear();
  shop.savedForLater.clear();
  shop.stockNotices.clear();
  shop.selectedAddressId = null;
  marketNotifier.value = MarketProfileId.drc;
}

/// A tall phone so lazily built list children are all on screen.
void gapTallViewport(WidgetTester tester) {
  tester.view.physicalSize = const Size(390 * 3, 1500 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
}

/// Real text widths: the app's bundled fonts (tests otherwise measure with the fixed-width "Ahem" font, far wider).
Future<void> gapLoadFonts() async {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
    await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
  }
}
