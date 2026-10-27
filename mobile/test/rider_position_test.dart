// Tracking: the rider's live position reads as how far away they are and how fresh it is, in both languages, never as
// raw coordinates; "Open in maps" stays.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/more/order_screens.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/util/geo_distance.dart';

import 'gap_helpers.dart';

const _pin = (lat: -4.3217, lng: 15.3125); // the delivery pin (Gombe)

OrderDto _order({bool withPin = true}) => OrderDto.fromJson({
      'id': 'o1',
      'reference': 'SOM-2042',
      'customerName': 'Aline Mbuyi',
      'status': 'out_for_delivery',
      'paymentMethod': 'wallet',
      'totalUsd': 63,
      'createdAt': '2026-10-01T09:30:00',
      if (withPin) 'shippingAddress': '{"line1":"12 Avenue de la Paix","city":"Kinshasa","geo":{"lat":${_pin.lat},"lng":${_pin.lng}}}',
      'items': [
        {'productId': 'p1', 'productName': 'Phone case', 'qty': 1, 'priceUsd': 20},
      ],
    });

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  setUp(() => gapReset());
  tearDown(() {
    RealtimeStore.instance.riderLocations.clear();
    gapTearDown();
  });

  group('distance', () {
    test('great-circle distance: Gombe to Masina is about 12 km, the same point is 0', () {
      expect(distanceKm(-4.3217, 15.3125, -4.3865, 15.3940), closeTo(12.5, 1.0));
      expect(distanceKm(-4.3217, 15.3125, -4.3217, 15.3125), 0);
      // 0.01 degree of latitude is 1.11 km
      expect(distanceKm(-4.32, 15.31, -4.33, 15.31), closeTo(1.11, 0.02));
    });

    test('the label is short and in the language\'s number style', () {
      const en = Strings('en');
      const fr = Strings('fr');
      expect(distanceLabel(en, 0.853), '850 m');
      expect(distanceLabel(en, 0.004), '0 m');
      expect(distanceLabel(en, 1.24), '1.2 km');
      expect(distanceLabel(fr, 1.24), '1,2 km');
      expect(distanceLabel(en, 14.4), '14 km');
    });

    test('very close below 100 m (no number), the distance beyond, nothing without a pin', () {
      for (final lang in ['en', 'fr']) {
        final s = Strings(lang);
        expect(riderDistanceText(s, (lat: -4.3217, lng: 15.3128), _pin), s.trackRiderNear, reason: '33 m');
        expect(riderDistanceText(s, (lat: -4.3317, lng: 15.3125), _pin), s.trackRiderAway(distanceLabel(s, 1.11)), reason: '1.1 km');
        expect(riderDistanceText(s, (lat: -4.3317, lng: 15.3125), null), isNull);
      }
      expect(riderDistanceText(const Strings('fr'), (lat: -4.3317, lng: 15.3125), _pin), 'Votre livreur est à 1,1 km');
      expect(riderDistanceText(const Strings('en'), (lat: -4.3317, lng: 15.3125), _pin), 'Your rider is 1.1 km away');
    });

    test('how fresh: just now, seconds, then minutes', () {
      final t = DateTime(2026, 10, 27, 10);
      for (final lang in ['en', 'fr']) {
        final s = Strings(lang);
        expect(updatedAgoText(s, t, now: t.add(const Duration(seconds: 2))), s.trackUpdatedNow);
        expect(updatedAgoText(s, t, now: t.add(const Duration(seconds: 12))), s.trackUpdatedS(12));
        expect(updatedAgoText(s, t, now: t.add(const Duration(seconds: 59))), s.trackUpdatedS(59));
        expect(updatedAgoText(s, t, now: t.add(const Duration(seconds: 190))), s.trackUpdatedM(3));
      }
      expect(updatedAgoText(const Strings('fr'), t, now: t.add(const Duration(seconds: 12))), 'Mis à jour il y a 12 s');
      expect(updatedAgoText(const Strings('en'), t, now: t.add(const Duration(seconds: 12))), 'Updated 12 s ago');
    });
  });

  group('the tracking screen', () {
    final raw = RegExp(r'-?\d+\.\d{4,}'); // a coordinate such as -4.38300

    Future<void> open(WidgetTester tester, String lang, OrderDto order, {RiderLocationDto? at}) async {
      await Strings.setLang(lang, persist: false);
      final store = RealtimeStore.instance;
      store.orders.add(order);
      if (at != null) store.riderLocations[order.id] = at;
      tester.view.physicalSize = const Size(402 * 3, 1200 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(gapApp(OrderTrackingScreen(locale: Locale(lang), orderId: order.id), lang: lang));
      await tester.pump(const Duration(milliseconds: 300));
    }

    for (final lang in ['en', 'fr']) {
      testWidgets('shows the distance to the delivery pin and how fresh it is, with Open in maps, and no raw numbers ($lang)', (tester) async {
        final s = Strings(lang);
        await open(tester, lang, _order(), at: RiderLocationDto(orderId: 'o1', lat: -4.3317, lng: 15.3125, at: DateTime.now().subtract(const Duration(seconds: 12))));
        expect(find.text(s.trackRiderAway(distanceLabel(s, 1.11))), findsOneWidget);
        final ago = RegExp(lang == 'fr' ? r'^Mis à jour il y a 1[2-4] s$' : r'^Updated 1[2-4] s ago$'); // the test clock moves a little
        expect(find.byWidgetPredicate((w) => w is Text && ago.hasMatch(w.data ?? '')), findsOneWidget);
        expect(find.text(s.trackOpenMaps), findsOneWidget);
        expect(find.byKey(const ValueKey('open-maps')), findsOneWidget);
        final texts = tester.widgetList<Text>(find.byType(Text)).map((t) => t.data ?? t.textSpan?.toPlainText() ?? '');
        expect(texts.where(raw.hasMatch), isEmpty, reason: 'no coordinates on screen');
        expect(find.byKey(const ValueKey('rider-coords')), findsNothing);
      });

      testWidgets('very close says so without a number ($lang)', (tester) async {
        final s = Strings(lang);
        await open(tester, lang, _order(), at: RiderLocationDto(orderId: 'o1', lat: -4.3217, lng: 15.3127));
        expect(find.text(s.trackRiderNear), findsOneWidget);
        expect(find.text(s.trackUpdatedNow), findsOneWidget);
      });

      testWidgets('an order with no delivery pin still says the rider shares their position, never the coordinates ($lang)', (tester) async {
        final s = Strings(lang);
        await open(tester, lang, _order(withPin: false), at: RiderLocationDto(orderId: 'o1', lat: -4.38300, lng: 15.38800));
        expect(find.text(s.trackRiderLive), findsOneWidget);
        expect(find.text(s.trackUpdatedNow), findsOneWidget);
        final texts = tester.widgetList<Text>(find.byType(Text)).map((t) => t.data ?? t.textSpan?.toPlainText() ?? '');
        expect(texts.where(raw.hasMatch), isEmpty);
        expect(find.byKey(const ValueKey('open-maps')), findsOneWidget);
      });
    }

    testWidgets('the age keeps counting while the screen stays open', (tester) async {
      await open(tester, 'en', _order(), at: RiderLocationDto(orderId: 'o1', lat: -4.3317, lng: 15.3125, at: DateTime.now().subtract(const Duration(seconds: 56))));
      expect(find.textContaining(RegExp(r'^Updated 5[6-9] s ago$')), findsOneWidget);
      // The timer ticks every 5 s on the real clock: the widget re-reads it, so after a tick the age is higher.
      await tester.runAsync(() => Future<void>.delayed(const Duration(seconds: 6)));
      await tester.pump(const Duration(seconds: 6));
      expect(find.textContaining('Updated 1 min ago'), findsOneWidget);
    });

    testWidgets('no position yet: the hint says it will appear, and nothing else', (tester) async {
      await open(tester, 'en', _order());
      expect(find.text(const Strings('en').trackLiveHint), findsOneWidget);
      expect(find.byKey(const ValueKey('open-maps')), findsNothing);
    });
  });
}
