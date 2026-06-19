import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:somba_teka/app/core/i18n/app_translations.dart';
import 'package:somba_teka/app/core/services/session_service.dart';
import 'package:somba_teka/app/core/services/shop_service.dart';
import 'package:somba_teka/app/core/theme/app_theme.dart';
import 'package:somba_teka/app/data/mock/mock_data.dart';
import 'package:somba_teka/app/modules/home/home_tab.dart';
import 'package:somba_teka/app/modules/product/product_detail_screen.dart';
import 'package:somba_teka/app/routes/app_routes.dart';

/// Pumps the home and product-detail screens at cramped sizes and large text
/// scales to surface any RenderFlex / pixel overflow. A test fails if Flutter
/// records an overflow exception during layout.
void main() {
  setUp(() {
    Get.testMode = true;
    Get.put(SessionService());
    Get.put(ShopService());
  });

  tearDown(Get.reset);

  // Drains every pending test exception and fails only on layout overflow,
  // ignoring unrelated test-env noise such as network image (HTTP) failures
  // from the mock picsum URLs.
  void expectNoOverflow(WidgetTester tester) {
    final exceptions = <String>[];
    for (Object? e = tester.takeException();
        e != null;
        e = tester.takeException()) {
      exceptions.add(e.toString());
    }
    final overflows =
        exceptions.where((e) => e.contains('overflowed')).toList();
    expect(overflows, isEmpty, reason: overflows.join('\n'));
  }

  Widget host(Widget child, {String locale = 'fr', String currency = 'CDF'}) {
    Get.find<SessionService>().currency.value = currency;
    return GetMaterialApp(
      locale: Locale(locale),
      translations: AppTranslations(),
      theme: AppTheme.light,
      getPages: [
        GetPage(name: '/host', page: () => child),
        GetPage(
            name: AppRoutes.product,
            page: () => const ProductDetailScreen()),
      ],
      initialRoute: '/host',
    );
  }

  // Narrow phone + accessibility text scaling is the worst case for overflow.
  const sizes = [Size(320, 640), Size(360, 720), Size(411, 891)];
  const scales = [1.0, 1.3];

  for (final size in sizes) {
    for (final scale in scales) {
      testWidgets('HomeTab no overflow @ $size x$scale', (tester) async {
        tester.view.physicalSize = size * tester.view.devicePixelRatio;
        tester.view.devicePixelRatio = 1.0;
        tester.view.physicalSize = size;
        addTearDown(tester.view.reset);

        await tester.pumpWidget(
          MediaQuery(
            data: MediaQueryData(
                size: size, textScaler: TextScaler.linear(scale)),
            child: host(const HomeTab()),
          ),
        );
        await tester.pump(const Duration(milliseconds: 300));
        expectNoOverflow(tester);
      });
    }
  }

  // Product detail: cover a CDF product with a struck-through original price
  // (long money strings) and a French locale (long button labels).
  for (final size in sizes) {
    for (final scale in scales) {
      testWidgets('ProductDetail no overflow @ $size x$scale', (tester) async {
        tester.view.devicePixelRatio = 1.0;
        tester.view.physicalSize = size;
        addTearDown(tester.view.reset);

        final product =
            MockData.products.firstWhere((p) => p.originalPrice != null);
        await tester.pumpWidget(
          MediaQuery(
            data: MediaQueryData(
                size: size, textScaler: TextScaler.linear(scale)),
            child: host(const SizedBox.shrink()),
          ),
        );
        Get.toNamed(AppRoutes.product, arguments: product);
        await tester.pump(const Duration(milliseconds: 300));
        expectNoOverflow(tester);
      });
    }
  }

  testWidgets('Product detail flow: add to cart', (tester) async {
    final shop = Get.find<ShopService>();
    final product = MockData.products
        .firstWhere((p) => p.variants.isEmpty && p.stock > 0);

    await tester.pumpWidget(
      GetMaterialApp(
        locale: const Locale('fr'),
        translations: AppTranslations(),
        theme: AppTheme.light,
        getPages: [
          GetPage(name: '/start', page: () => const _StubScreen()),
          GetPage(name: AppRoutes.product, page: () => const ProductDetailScreen()),
          GetPage(name: AppRoutes.checkout, page: () => const _StubScreen()),
        ],
        initialRoute: '/start',
      ),
    );
    Get.toNamed(AppRoutes.product, arguments: product);
    await tester.pumpAndSettle(const Duration(milliseconds: 300));

    expect(shop.cartCount, 0);
    await tester.tap(find.text('add_to_cart'.tr));
    await tester.pump(const Duration(milliseconds: 300));
    expect(shop.cartCount, 1);

    final overflowErrors = <String>[];
    for (Object? e = tester.takeException();
        e != null;
        e = tester.takeException()) {
      if (e.toString().contains('overflowed')) overflowErrors.add(e.toString());
    }
    expect(overflowErrors, isEmpty, reason: overflowErrors.join('\n'));

    // Let the confirmation snackbar's timer elapse so no timer outlives the test.
    await tester.pump(const Duration(seconds: 3));
  });
}

class _StubScreen extends StatelessWidget {
  const _StubScreen();
  @override
  Widget build(BuildContext context) => const Scaffold(body: SizedBox());
}
