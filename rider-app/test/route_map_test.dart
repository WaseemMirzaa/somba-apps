// The in-app route map on a task: the rider, the next stop (the one Navigate leads to) and the line between them. The
// Google map itself needs the platform view, so the screen is run with a stand-in that records what it was told to draw.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/deliveries_screen.dart';
import 'package:somba_rider/screens/task_route_screen.dart';
import 'package:somba_rider/services/maps_config.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/services/route_line.dart';
import 'package:somba_rider/theme/app_theme.dart';

import 'task_fixtures.dart';

// Google's documented example for the encoded polyline format.
const _encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

Position _fix(double lat, double lng) => Position(latitude: lat, longitude: lng, timestamp: DateTime(2026, 11, 3), accuracy: 5, altitude: 0, altitudeAccuracy: 0, heading: 0, headingAccuracy: 0, speed: 0, speedAccuracy: 0);

String _routesBody({int meters = 4200, String duration = '780s'}) => jsonEncode({
      'routes': [
        {
          'distanceMeters': meters,
          'duration': duration,
          'polyline': {'encodedPolyline': _encoded},
        },
      ],
    });

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
      await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
    }
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await Strings.setLang('en', persist: false);
  });

  tearDown(() {
    MapsConfig.debugEnabledOverride = null;
    RiderStore.instance.location.last.value = null;
    RiderStore.instance.myTasks.clear();
    RiderStore.instance.user = null;
  });

  group('the line', () {
    test('decodes the encoded polyline', () {
      final p = decodePolyline(_encoded);
      expect(p, hasLength(3));
      expect(p[0].lat, closeTo(38.5, 1e-9));
      expect(p[0].lng, closeTo(-120.2, 1e-9));
      expect(p[1].lat, closeTo(40.7, 1e-9));
      expect(p[1].lng, closeTo(-120.95, 1e-9));
      expect(p[2].lat, closeTo(43.252, 1e-9));
      expect(p[2].lng, closeTo(-126.453, 1e-9));
    });

    test('a truncated or empty polyline gives what could be read, never an exception', () {
      expect(decodePolyline(''), isEmpty);
      expect(decodePolyline(_encoded.substring(0, 12)), hasLength(lessThan(3)));
    });

    test('distance: Gombe to Masina is about 10 km', () {
      final m = haversineMeters((lat: -4.3217, lng: 15.3125), (lat: -4.3865, lng: 15.3940));
      expect(m, inInclusiveRange(9500, 12500));
      expect(haversineMeters((lat: 1, lng: 1), (lat: 1, lng: 1)), 0);
    });

    test('the straight fallback is flagged approximate and carries its distance', () {
      final l = RouteLine.straight((lat: -4.3217, lng: 15.3125), (lat: -4.3865, lng: 15.3940));
      expect(l.approximate, isTrue);
      expect(l.points, hasLength(2));
      expect(l.distanceMeters, inInclusiveRange(9500, 12500));
    });

    test('parses a computeRoutes answer, and nothing else', () {
      final l = parseRoutesResponse(jsonDecode(_routesBody()))!;
      expect((l.approximate, l.distanceMeters, l.durationSeconds, l.points.length), (false, 4200, 780, 3));
      for (final bad in [null, 'x', {}, {'routes': []}, {'routes': [{}]}, {'routes': [{'polyline': {'encodedPolyline': ''}}]}]) {
        expect(parseRoutesResponse(bad), isNull, reason: '$bad');
      }
    });

    test('the service sends the key in the header, never in the URL', () async {
      http.Request? seen;
      final svc = RouteService(
        apiKey: 'TESTKEY',
        client: MockClient((r) async {
          seen = r;
          return http.Response(_routesBody(), 200);
        }),
      );
      final l = await svc.fetch((lat: -4.32, lng: 15.31), (lat: -4.38, lng: 15.39));
      expect(l, isNotNull);
      expect(seen!.url.toString(), isNot(contains('TESTKEY')));
      expect(seen!.headers['X-Goog-Api-Key'], 'TESTKEY');
      expect(seen!.url.host, 'routes.googleapis.com');
    });

    test('a refused key (Routes API not enabled) falls back, and the service does not ask again', () async {
      var asked = 0;
      final svc = RouteService(
        apiKey: 'K',
        client: MockClient((r) async {
          asked++;
          return http.Response('{"error":{"status":"PERMISSION_DENIED"}}', 403);
        }),
      );
      expect(await svc.fetch((lat: 1, lng: 1), (lat: 2, lng: 2)), isNull);
      expect(svc.refused, isTrue);
      expect(await svc.fetch((lat: 1, lng: 1), (lat: 2, lng: 2)), isNull);
      expect(asked, 1);
    });

    test('no key, a network error and a server error all give null (the caller draws the straight line)', () async {
      expect(await RouteService(apiKey: '').fetch((lat: 1, lng: 1), (lat: 2, lng: 2)), isNull);
      expect(await RouteService(apiKey: 'K', client: MockClient((r) async => throw http.ClientException('down'))).fetch((lat: 1, lng: 1), (lat: 2, lng: 2)), isNull);
      final svc = RouteService(apiKey: 'K', client: MockClient((r) async => http.Response('', 503)));
      expect(await svc.fetch((lat: 1, lng: 1), (lat: 2, lng: 2)), isNull);
      expect(svc.refused, isFalse, reason: 'a 503 is worth asking again');
    });
  });

  group('the overlay', () {
    test('the rider and the stop are markers; a road route is a solid line, the fallback is dashed', () {
      const me = (lat: -4.3217, lng: 15.3125), stop = (lat: -4.3865, lng: 15.3940);
      final road = buildRouteOverlay(const RouteMapData(me: me, stop: stop, line: [me, (lat: -4.35, lng: 15.35), stop], approximate: false), youLabel: 'You', stopLabel: 'Stop');
      expect(road.markers.map((m) => m.markerId.value), unorderedEquals(['me', 'stop']));
      expect(road.lines.single.patterns, isEmpty);
      expect(road.lines.single.points, hasLength(3));
      final straight = buildRouteOverlay(const RouteMapData(me: me, stop: stop, line: [me, stop]), youLabel: 'You', stopLabel: 'Stop');
      expect(straight.lines.single.patterns, isNotEmpty, reason: 'dashed, so it is never mistaken for a road');
    });

    test('without the rider or the stop, only what is known is drawn, and no line', () {
      final o = buildRouteOverlay(const RouteMapData(stop: (lat: -4.3, lng: 15.3)), youLabel: 'You', stopLabel: 'Stop');
      expect(o.markers.map((m) => m.markerId.value), ['stop']);
      expect(o.lines, isEmpty);
    });
  });

  group('the screen', () {
    RouteMapData? drawn;
    final opened = <Uri>[];

    Future<void> pump(WidgetTester t, DeliveryTaskDto task, {RouteService? routes, Future<LatLngPair?> Function()? where, String lang = 'en', double width = 360}) async {
      await Strings.setLang(lang, persist: false);
      drawn = null;
      opened.clear();
      t.view.physicalSize = Size(width * 3, 780 * 3);
      t.view.devicePixelRatio = 3;
      addTearDown(t.view.reset);
      await t.pumpWidget(MaterialApp(
        locale: Locale(lang),
        supportedLocales: const [Locale('en'), Locale('fr')],
        localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
        theme: AppTheme.light(),
        home: TaskRouteScreen(
          task: task,
          routes: routes ?? RouteService(apiKey: ''),
          positionOnce: where ?? () async => (lat: -4.3217, lng: 15.3125),
          launcher: (u) async {
            opened.add(u);
            return true;
          },
          isIPhone: false,
          mapBuilder: (c, d) {
            drawn = d;
            return const ColoredBox(key: ValueKey('fake-map'), color: Color(0xFFDDE6F5));
          },
        ),
      ));
      await t.pump(const Duration(milliseconds: 300));
      await t.pump(const Duration(milliseconds: 300));
    }

    testWidgets('a delivery on the road: the rider, the customer\'s pin, and a straight line with its distance when no road route is available', (t) async {
      final s = Strings('en');
      await pump(t, leg('delivery', id: 'a', status: 'in_transit'));
      expect(drawn!.me, (lat: -4.3217, lng: 15.3125));
      expect(drawn!.stop, (lat: -4.3101, lng: 15.3125), reason: 'the customer pin Navigate leads to');
      expect(drawn!.line, hasLength(2));
      expect(drawn!.approximate, isTrue);
      expect(find.byKey(const ValueKey('route-straight')), findsOneWidget);
      expect(find.text(s.routeStraight), findsOneWidget);
      expect(find.byKey(const ValueKey('route-distance')), findsOneWidget);
      expect(find.byKey(const ValueKey('route-eta')), findsNothing, reason: 'no travel time for a straight line');
    });

    testWidgets('with a road route: the line follows it, with the distance and the time, and no "straight line" note', (t) async {
      final routes = RouteService(apiKey: 'K', client: MockClient((r) async => http.Response(_routesBody(meters: 4200, duration: '780s'), 200)));
      await pump(t, leg('delivery', id: 'a', status: 'in_transit'), routes: routes);
      expect(drawn!.approximate, isFalse);
      expect(drawn!.line, hasLength(3));
      expect(find.byKey(const ValueKey('route-straight')), findsNothing);
      expect(find.text(Strings('en').routeDistance('4.2 km')), findsOneWidget);
      expect(find.text(Strings('en').routeEta(13)), findsOneWidget);
    });

    testWidgets('before the parcel is picked up, the next stop is where it is (a seller\'s pickup address)', (t) async {
      await pump(t, leg('pickup', id: 'p', status: 'assigned'));
      expect(drawn!.stop, (lat: -4.33, lng: 15.29));
    });

    testWidgets('a stop without an exact pin: only the rider is drawn, and the note sends the rider to Navigate', (t) async {
      final json = legJson('delivery', id: 'n', status: 'in_transit');
      final to = Map<String, dynamic>.from(json['to'] as Map)..remove('lat')..remove('lng');
      json['to'] = to;
      json['address'] = '{"line1":"12, avenue du Commerce","commune":"Gombe","city":"Kinshasa"}';
      (json['order'] as Map)['shippingAddress'] = json['address'];
      await pump(t, DeliveryTaskDto.fromJson(json));
      expect(drawn!.stop, isNull);
      expect(drawn!.line, isEmpty);
      expect(find.text(Strings('en').routeNoPin), findsOneWidget);
      expect(find.byKey(const ValueKey('route-navigate')), findsOneWidget, reason: 'Navigate still works from the address');
    });

    testWidgets('no position yet: the stop is drawn and the note says why there is no line', (t) async {
      await pump(t, leg('delivery', id: 'a', status: 'in_transit'), where: () async => null);
      expect(drawn!.me, isNull);
      expect(drawn!.stop, isNotNull);
      expect(find.text(Strings('en').routeNoPosition), findsOneWidget);
      expect(drawn!.line, isEmpty);
    });

    testWidgets('the shared position moves the rider\'s marker, and a long move redraws the route', (t) async {
      var asked = 0;
      final routes = RouteService(apiKey: 'K', client: MockClient((r) async {
        asked++;
        return http.Response(_routesBody(), 200);
      }));
      await pump(t, leg('delivery', id: 'a', status: 'in_transit'), routes: routes);
      expect(asked, 1);
      RiderStore.instance.location.last.value = _fix(-4.3217, 15.3130); // 50 m: marker only
      await t.pump(const Duration(milliseconds: 200));
      expect(drawn!.me!.lng, closeTo(15.3130, 1e-9));
      expect(asked, 1);
      RiderStore.instance.location.last.value = _fix(-4.3300, 15.3300); // ~2 km: the route is asked again
      await t.pump(const Duration(milliseconds: 200));
      await t.pump(const Duration(milliseconds: 200));
      expect(drawn!.me!.lat, closeTo(-4.33, 1e-9));
      expect(asked, 2);
    });

    testWidgets('Navigate stays: the same Google Maps link as the list, with the customer pin', (t) async {
      await pump(t, leg('delivery', id: 'a', status: 'in_transit'));
      expect(find.byType(FilledButton), findsOneWidget, reason: 'one filled button per screen');
      await t.tap(find.byKey(const ValueKey('route-navigate')));
      await t.pump();
      expect(opened.single.host, 'www.google.com');
      expect(opened.single.queryParameters['destination'], '-4.3101,15.3125');
    });

    for (final lang in ['en', 'fr']) {
      testWidgets('shows the label of where Navigate leads, in the rider\'s language ($lang)', (t) async {
        final s = Strings(lang);
        await pump(t, leg('transfer', id: 'x', status: 'picked_up'), lang: lang);
        expect(find.text(s.navigateHub), findsOneWidget);
        await pump(t, leg('pickup', id: 'p', status: 'assigned'), lang: lang);
        expect(find.text(s.navigateSeller), findsOneWidget);
      });
    }
  });

  group('on the task card', () {
    Future<void> show(WidgetTester t, List<DeliveryTaskDto> tasks) async {
      final store = RiderStore.instance;
      store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean', role: 'rider', phone: '+243810000000');
      store.loaded = true;
      store.myTasks
        ..clear()
        ..addAll(tasks);
      t.view.physicalSize = const Size(360 * 3, 1600 * 3);
      t.view.devicePixelRatio = 3;
      addTearDown(t.view.reset);
      await t.pumpWidget(MaterialApp(
        supportedLocales: const [Locale('en'), Locale('fr')],
        localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
        theme: AppTheme.light(),
        home: Scaffold(body: DeliveriesScreen(routeMapBuilder: (c, d) => const ColoredBox(key: ValueKey('fake-map'), color: Color(0xFFDDE6F5)))),
      ));
      await t.pump(const Duration(milliseconds: 600));
    }

    testWidgets('with a Maps key, an active task has "Route map" next to Navigate, and it opens the map', (t) async {
      MapsConfig.debugEnabledOverride = true;
      await show(t, [leg('delivery', id: 'a', status: 'in_transit')]);
      expect(find.byKey(const ValueKey('navigate-a')), findsOneWidget);
      await t.tap(find.byKey(const ValueKey('route-map-a')));
      await t.pumpAndSettle();
      expect(find.byType(TaskRouteScreen), findsOneWidget);
      expect(find.byKey(const ValueKey('fake-map')), findsOneWidget);
    });

    testWidgets('without a Maps key the button is not offered; Navigate is all there is', (t) async {
      MapsConfig.debugEnabledOverride = false;
      await show(t, [leg('delivery', id: 'a', status: 'in_transit')]);
      expect(find.byKey(const ValueKey('route-map-a')), findsNothing);
      expect(find.byKey(const ValueKey('navigate-a')), findsOneWidget);
    });

    testWidgets('a finished task has no route map', (t) async {
      MapsConfig.debugEnabledOverride = true;
      await show(t, [leg('delivery', id: 'a', status: 'delivered')]);
      await t.tap(find.byKey(const ValueKey('tab-1')));
      await t.pump(const Duration(milliseconds: 300));
      expect(find.byKey(const ValueKey('route-map-a')), findsNothing);
    });
  });
}
