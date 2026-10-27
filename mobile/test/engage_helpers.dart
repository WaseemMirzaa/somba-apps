// Shared fixtures for the engage_*_test.dart files (not a test itself): products with the new fields, a fake clock
// for countdowns and flash sales, and a reset of the engagement store.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:lipcart/theme/app_theme.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/catalog_models.dart';
import 'package:lipcart/services/engage_store.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';

import 'gap_helpers.dart';

/// A test clock: countdowns and the engagement store read it instead of the wall clock.
class FakeClock {
  DateTime t = DateTime.utc(2026, 10, 25, 12);
  DateTime call() => t;
  void advance(Duration d) => t = t.add(d);
}

/// A served product with the engagement fields; [extra] overrides or adds payload fields.
ProductDto engageDto(String id, {double price = 20, int stock = 5, Map<String, dynamic> extra = const {}}) => ProductDto.fromJson({
      'id': id,
      'name': 'Item $id',
      'nameFr': 'Article $id',
      'price': price,
      'originalPrice': price,
      'category': 'Electronics',
      'categoryFr': 'Électronique',
      'image': '',
      'stock': stock,
      'sellerId': 's1',
      'sellerName': 'Kinshasa Traders',
      'deliveryDays': 3,
      ...extra,
    });

/// The payload of a store that is away until [until].
Map<String, dynamic> vacationFields({String until = '2026-11-12T22:59:59.000Z', bool withNotice = true}) => {
      'sellerOnVacation': true,
      'sellerVacationUntil': until,
      if (withNotice)
        'sellerVacationNotice': {
          'en': 'Kinshasa Traders is on vacation until 12 Nov 2026 and is not taking new orders.',
          'fr': 'Kinshasa Traders est en vacances jusqu’au 12 nov. 2026 et ne prend pas de nouvelles commandes.',
        },
    };

/// A running flash sale as `flashsales:list` serves it.
Map<String, dynamic> flashJson(String id, String productId, {int endsInMs = 3600000, double flashPrice = 12, double basePrice = 20, int discount = 40, String phase = 'running'}) => {
      'id': id,
      'productId': productId,
      'title': 'Weekend flash',
      'titleFr': 'Flash du week-end',
      'productName': 'Item $productId',
      'productNameFr': 'Article $productId',
      'flashPrice': flashPrice,
      'basePrice': basePrice,
      'discount': discount,
      'phase': phase,
      'status': 'approved',
      'active': true,
      'startsInMs': null,
      'endsInMs': endsInMs,
    };

final FakeClock engageClock = FakeClock();

/// Fresh singletons: [gapReset] plus an empty engagement store on the fake clock.
Future<void> engageReset({List<ProductDto>? products, String lang = 'en'}) async {
  await gapReset(products: products, lang: lang);
  engageClock.t = DateTime.utc(2026, 10, 25, 12);
  EngageStore.instance
    ..reset()
    ..now = engageClock.call;
  RealtimeStore.instance.debugCallRequest = null;
}

void engageTearDown() {
  EngageStore.instance
    ..reset()
    ..now = DateTime.now;
  RealtimeStore.instance.debugCallRequest = null;
  gapTearDown();
}

/// Delivers `flashsales:list` to the store.
Future<void> loadSales(List<Map<String, dynamic>> sales) async {
  RealtimeStore.instance.debugCallRequest = (event, [body]) async => event == 'flashsales:list' ? sales : const <dynamic>[];
  await EngageStore.instance.loadFlashSales();
}

Product productOf(String id) => productByUuid(id)!;

/// Replaces a product in the live catalogue (what `product:updated` does).
void pushProduct(Map<String, dynamic> json) {
  final store = RealtimeStore.instance;
  final dto = ProductDto.fromJson(json);
  final i = store.products.indexWhere((p) => p.id == dto.id);
  if (i == -1) {
    store.products.insert(0, dto);
  } else {
    store.products[i] = dto;
  }
  // ignore: invalid_use_of_protected_member
  store.notifyListeners();
}

Widget gapAppScaled(Widget home, {String lang = 'en', double scale = 1.0}) => MaterialApp(
      theme: AppTheme.light(),
      locale: Locale(lang),
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)), child: child!),
      home: home,
    );

