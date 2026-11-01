// Navigate to the customer's map pin: pin parsing, the Google Maps link, and the Navigate button.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/deliveries_screen.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/navigation_link.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

import 'task_fixtures.dart';

DeliveryTaskDto _task(String status, {String? address, String? pickup = 'Seller, Gombe'}) => DeliveryTaskDto(
      id: 't77',
      orderId: 'o',
      orderReference: 'SOM-77',
      status: status,
      codAmountUsd: 0,
      addressRaw: address,
      customerName: 'Marie Dubois',
      pickupAddress: pickup,
    );

const _pinned = '{"line1":"12 Avenue de la Paix","city":"Kinshasa","commune":"Gombe","geo":{"lat":-4.3101,"lng":15.3125,"placeId":"ChIJ"}}';
const _typed = '{"line1":"12 Avenue de la Paix","city":"Kinshasa"}';

void main() {
  group('pin on the task', () {
    test('is read from the order address', () {
      final p = _task('in_transit', address: _pinned).pin!;
      expect((p.lat, p.lng), (-4.3101, 15.3125));
    });
    test('is absent for hand-typed, plain-text or missing addresses', () {
      expect(_task('in_transit', address: _typed).pin, isNull);
      expect(_task('in_transit', address: '12 Avenue, Gombe').pin, isNull);
      expect(_task('in_transit').pin, isNull);
    });
    test('ignores impossible coordinates', () {
      expect(_task('in_transit', address: '{"geo":{"lat":120,"lng":15}}').pin, isNull);
      expect(_task('in_transit', address: '{"geo":{"lat":"x","lng":15}}').pin, isNull);
    });
  });

  group('navigation link', () {
    test('uses exact coordinates when pinned', () {
      final u = navigationUri(pin: (lat: -4.3101, lng: 15.3125), addressText: 'ignored');
      expect(u.host, 'www.google.com');
      expect(u.path, '/maps/dir/');
      expect(u.queryParameters['destination'], '-4.3101,15.3125');
      expect(u.queryParameters['travelmode'], 'two-wheeler');
    });
    test('falls back to the address text, properly encoded', () {
      final u = navigationUri(addressText: '12 Avenue de la Paix, Gombe & Kinshasa');
      expect(u.queryParameters['destination'], '12 Avenue de la Paix, Gombe & Kinshasa');
      expect(u.toString(), contains('Gombe+%26+Kinshasa'));
    });
    test('opens through the launcher and reports the result', () async {
      Uri? seen;
      final ok = await openNavigation(pin: (lat: 1, lng: 2), launcher: (u) async {
        seen = u;
        return true;
      });
      expect(ok, isTrue);
      expect(seen!.queryParameters['destination'], '1.0,2.0');
      expect(await openNavigation(pin: (lat: 1, lng: 2), launcher: (_) async => false), isFalse);
    });
    test('nothing to navigate to, or a launcher that throws, returns false', () async {
      expect(await openNavigation(), isFalse);
      expect(await openNavigation(addressText: '  '), isFalse);
      expect(await openNavigation(addressText: 'x', launcher: (_) async => throw StateError('no maps')), isFalse);
    });
  });

  group('Navigate button', () {
    setUpAll(() async {
      TestWidgetsFlutterBinding.ensureInitialized();
      for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
        await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
      }
    });

    Future<void> show(WidgetTester t, String lang, List<DeliveryTaskDto> tasks, {Future<bool> Function(Uri)? launcher}) async {
      SharedPreferences.setMockInitialValues({});
      await Strings.setLang(lang, persist: false);
      final store = RiderStore.instance;
      store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean', role: 'rider', phone: '+243810000000');
      store.loaded = true;
      store.myTasks
        ..clear()
        ..addAll(tasks);
      t.view.physicalSize = const Size(360 * 3, 740 * 3);
      t.view.devicePixelRatio = 3;
      addTearDown(t.view.reset);
      addTearDown(() {
        store.user = null;
        store.myTasks.clear();
      });
      await t.pumpWidget(MaterialApp(
        locale: Locale(lang),
        supportedLocales: const [Locale('en'), Locale('fr')],
        localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
        theme: AppTheme.light(),
        home: Scaffold(body: DeliveriesScreen(launcher: launcher)),
      ));
      await t.pump(const Duration(milliseconds: 600));
    }

    for (final lang in ['en', 'fr']) {
      testWidgets('in transit: navigate to the customer, pin noted, no overflow ($lang)', (t) async {
        await show(t, lang, [_task('in_transit', address: _pinned)]);
        expect(find.byKey(const ValueKey('navigate-t77')), findsOneWidget);
        expect(find.text(Strings(lang).navigateCustomer), findsOneWidget);
        expect(find.text(Strings(lang).pinExact), findsOneWidget);
        expect(t.takeException(), isNull);
      });

      testWidgets('before pickup the button heads to the seller ($lang)', (t) async {
        await show(t, lang, [_task('assigned', address: _pinned)]);
        expect(find.text(Strings(lang).navigatePickup), findsOneWidget);
        expect(find.text(Strings(lang).pinExact), findsNothing, reason: 'the pin is the customer\'s, not the seller\'s');
      });
    }

    group('per leg kind', () {
      Uri? opened;
      Future<bool> grab(Uri u) async {
        opened = u;
        return true;
      }

      Future<void> tapNav(WidgetTester t, String id) async {
        opened = null;
        await t.ensureVisible(find.byKey(ValueKey('navigate-$id')));
        await t.pump();
        await t.tap(find.byKey(ValueKey('navigate-$id')));
        await t.pump(const Duration(milliseconds: 300));
      }

      testWidgets('pickup: to the seller before the pickup, to the warehouse after', (t) async {
        await show(t, 'en', [leg('pickup', id: 'k1')], launcher: grab);
        expect(find.text(Strings('en').navigateSeller), findsOneWidget);
        await tapNav(t, 'k1');
        expect(opened!.queryParameters['destination'], '-4.33,15.29', reason: 'the seller pin');

        await show(t, 'en', [leg('pickup', id: 'k1', status: 'in_transit')], launcher: grab);
        expect(find.text(Strings('en').navigateHub), findsOneWidget);
        await tapNav(t, 'k1');
        expect(opened!.queryParameters['destination'], '-4.35,15.34', reason: 'the origin warehouse pin');
      });

      testWidgets('transfer: from the origin warehouse, then to the destination warehouse', (t) async {
        await show(t, 'fr', [leg('transfer', id: 'k2')], launcher: grab);
        expect(find.text(Strings('fr').navigateHub), findsOneWidget);
        await tapNav(t, 'k2');
        expect(opened!.queryParameters['destination'], '-4.35,15.34');
        await show(t, 'fr', [leg('transfer', id: 'k2', status: 'picked_up')], launcher: grab);
        await tapNav(t, 'k2');
        expect(opened!.queryParameters['destination'], '-4.3105,15.3136');
      });

      testWidgets('delivery: to the warehouse to fetch it, then to the customer pin', (t) async {
        await show(t, 'en', [leg('delivery', id: 'k3')], launcher: grab);
        await tapNav(t, 'k3');
        expect(opened!.queryParameters['destination'], '-4.3105,15.3136');
        await show(t, 'en', [leg('delivery', id: 'k3', status: 'in_transit')], launcher: grab);
        expect(find.text(Strings('en').navigateCustomer), findsOneWidget);
        await tapNav(t, 'k3');
        expect(opened!.queryParameters['destination'], '-4.3101,15.3125');
      });

      testWidgets('return pickup: the customer first, then the warehouse', (t) async {
        await show(t, 'en', [leg('return_pickup', id: 'k4')], launcher: grab);
        expect(find.text(Strings('en').navigateCustomer), findsOneWidget);
        await tapNav(t, 'k4');
        expect(opened!.queryParameters['destination'], '-4.3101,15.3125');
        await show(t, 'en', [leg('return_pickup', id: 'k4', status: 'in_transit')], launcher: grab);
        expect(find.text(Strings('en').navigateHub), findsOneWidget);
      });

      testWidgets('return to seller: ends at the seller', (t) async {
        await show(t, 'en', [leg('return_to_seller', id: 'k5', status: 'in_transit')], launcher: grab);
        expect(find.text(Strings('en').navigateSeller), findsOneWidget);
        await tapNav(t, 'k5');
        expect(opened!.queryParameters['destination'], '-4.33,15.29');
      });

      testWidgets('an endpoint without coordinates is searched by its address', (t) async {
        final j = jsonDecode(jsonEncode(legJson('pickup', id: 'k6'))) as Map<String, dynamic>;
        (j['from'] as Map)['lat'] = null;
        (j['from'] as Map)['lng'] = null;
        await show(t, 'en', [DeliveryTaskDto.fromJson(j)], launcher: grab);
        await tapNav(t, 'k6');
        expect(opened!.queryParameters['destination'], '27, avenue Kasa-Vubu, Bandalungwa');
      });
    });

    testWidgets('no pin note for a typed address, button still offered', (t) async {
      await show(t, 'en', [_task('in_transit', address: _typed)]);
      expect(find.text(Strings('en').pinExact), findsNothing);
      expect(find.byKey(const ValueKey('navigate-t77')), findsOneWidget);
    });

    testWidgets('finished deliveries have no Navigate button', (t) async {
      await show(t, 'en', [_task('delivered', address: _pinned)]);
      await t.tap(find.byKey(const ValueKey('tab-1')));
      await t.pump(const Duration(milliseconds: 300));
      expect(find.byKey(const ValueKey('navigate-t77')), findsNothing);
    });

    testWidgets('tapping it opens Google Maps at the customer pin', (t) async {
      Uri? opened;
      await show(t, 'en', [_task('in_transit', address: _pinned)], launcher: (u) async {
        opened = u;
        return true;
      });
      await t.ensureVisible(find.byKey(const ValueKey('navigate-t77')));
      await t.pump();
      await t.tap(find.byKey(const ValueKey('navigate-t77')));
      await t.pump(const Duration(milliseconds: 300));
      expect(opened!.queryParameters['destination'], '-4.3101,15.3125');
      expect(find.text(Strings('en').navFailed), findsNothing);
    });

    testWidgets('before pickup it opens the seller address, never the customer pin', (t) async {
      Uri? opened;
      await show(t, 'en', [_task('assigned', address: _pinned)], launcher: (u) async {
        opened = u;
        return true;
      });
      await t.ensureVisible(find.byKey(const ValueKey('navigate-t77')));
      await t.pump();
      await t.tap(find.byKey(const ValueKey('navigate-t77')));
      await t.pump(const Duration(milliseconds: 300));
      expect(opened!.queryParameters['destination'], 'Seller, Gombe');
    });

    testWidgets('a typed address navigates by street, commune and city, without the landmark', (t) async {
      Uri? opened;
      const withLandmark = '{"line1":"12 Avenue de la Paix","line2":"Blue gate, next to the pharmacy","commune":"Gombe","city":"Kinshasa"}';
      await show(t, 'en', [_task('in_transit', address: withLandmark)], launcher: (u) async {
        opened = u;
        return true;
      });
      expect(find.textContaining('Blue gate, next to the pharmacy'), findsOneWidget, reason: 'the rider still reads the landmark');
      await t.ensureVisible(find.byKey(const ValueKey('navigate-t77')));
      await t.pump();
      await t.tap(find.byKey(const ValueKey('navigate-t77')));
      await t.pump(const Duration(milliseconds: 300));
      expect(opened!.queryParameters['destination'], '12 Avenue de la Paix, Gombe, Kinshasa');
    });

    for (final lang in ['en', 'fr']) {
      testWidgets('the card says by when to deliver, from the order estimate ($lang)', (t) async {
        final task = DeliveryTaskDto.fromJson({
          'id': 't1', 'orderId': 'o', 'orderReference': 'SOM-77', 'status': 'in_transit',
          'order': {'shippingAddress': _typed, 'estimatedDeliveryDate': '2026-10-26'},
        });
        expect(task.deliverByText, '26/10');
        await show(t, lang, [task]);
        expect(find.text(Strings(lang).deliverBy('26/10')), findsOneWidget);
      });
    }

    test('no or malformed estimate → no deliver-by line', () {
      expect(_task('in_transit').deliverByText, isNull);
      expect(DeliveryTaskDto.fromJson({'id': 't', 'order': {'estimatedDeliveryDate': '2026-10-26 09:00-12:00'}}).deliverByText, isNull);
    });

    testWidgets('a maps app that cannot open shows a friendly message', (t) async {
      await show(t, 'en', [_task('in_transit', address: _pinned)], launcher: (_) async => false);
      await t.ensureVisible(find.byKey(const ValueKey('navigate-t77')));
      await t.pump();
      await t.tap(find.byKey(const ValueKey('navigate-t77')));
      await t.pump();
      await t.pump(const Duration(milliseconds: 300));
      expect(find.text(Strings('en').navFailed), findsOneWidget);
    });
  });
}
