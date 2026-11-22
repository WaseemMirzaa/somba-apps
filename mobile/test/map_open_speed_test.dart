// Opening the address map must not wait on the GPS or the geocoder: a remembered position is used at once, a new fix
// is bounded, a late fix never undoes what the customer did by hand, and quick pans send one address lookup.
import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/location_picker_screen.dart';
import 'package:lipcart/services/device_location.dart';
import 'package:lipcart/services/places_client.dart';

import 'gap_helpers.dart';

/// A phone whose location answers are scripted; every call is recorded.
class _FakeGeolocator extends GeolocatorPlatform {
  bool servicesOn = true;
  LocationPermission permission = LocationPermission.whileInUse;
  LocationPermission afterRequest = LocationPermission.whileInUse;
  Position? lastKnown;
  Object? lastKnownError;
  Position? fresh; // null: the fix times out
  final calls = <String>[];
  LocationSettings? freshSettings;

  @override
  Future<bool> isLocationServiceEnabled() async => servicesOn;
  @override
  Future<LocationPermission> checkPermission() async => permission;
  @override
  Future<LocationPermission> requestPermission() async {
    calls.add('request');
    return permission = afterRequest;
  }

  @override
  Future<Position?> getLastKnownPosition({bool forceLocationManager = false}) async {
    calls.add('lastKnown');
    if (lastKnownError != null) throw lastKnownError!;
    return lastKnown;
  }

  @override
  Future<Position> getCurrentPosition({LocationSettings? locationSettings}) async {
    calls.add('current');
    freshSettings = locationSettings;
    final f = fresh;
    if (f == null) throw TimeoutException('no fix');
    return f;
  }
}

Position _pos(double lat, double lng, {Duration age = Duration.zero}) => Position(
      latitude: lat,
      longitude: lng,
      timestamp: DateTime.now().subtract(age),
      accuracy: 10,
      altitude: 0,
      altitudeAccuracy: 0,
      heading: 0,
      headingAccuracy: 0,
      speed: 0,
      speedAccuracy: 0,
    );

const _panTo = LatLng(-4.3301, 15.3122);
const _gps = (lat: -4.4, lng: 15.4);

Widget _fakeMap(BuildContext context,
        {required LatLng initial, required ValueChanged<LatLng> onMove, required VoidCallback onIdle, required ValueChanged<GoogleMapController> onCreated}) =>
    Container(
      alignment: Alignment.topLeft,
      child: Padding(
        padding: const EdgeInsets.only(top: 120),
        child: TextButton(
          key: const ValueKey('fake-pan'),
          onPressed: () {
            onMove(_panTo);
            onIdle();
          },
          child: const Text('pan'),
        ),
      ),
    );

String _geocodeJson() => jsonEncode({
      'status': 'OK',
      'results': [
        {
          'place_id': 'geo1',
          'formatted_address': '12 Avenue de la Paix, Gombe, Kinshasa',
          'address_components': [
            {'long_name': '12', 'types': ['street_number']},
            {'long_name': 'Avenue de la Paix', 'types': ['route']},
            {'long_name': 'Gombe', 'types': ['sublocality_level_1']},
          ],
        }
      ],
    });

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  setUp(() => gapReset());
  tearDown(() {
    debugPosition = null;
    GeolocatorPlatform.instance = _original;
    gapTearDown();
  });

  group('currentPosition order', () {
    late _FakeGeolocator phone;
    setUp(() {
      phone = _FakeGeolocator();
      GeolocatorPlatform.instance = phone;
    });

    test('a recent last known position is returned at once, with no new fix asked for', () async {
      phone.lastKnown = _pos(-4.3, 15.3, age: const Duration(minutes: 2));
      phone.fresh = _pos(1, 1);
      final p = await currentPosition();
      expect((p.lat, p.lng), (-4.3, 15.3));
      expect(phone.calls, ['lastKnown']);
    });

    test('a last known position older than the limit is skipped for a balanced, time-limited fix', () async {
      phone.lastKnown = _pos(-4.3, 15.3, age: lastKnownMaxAge + const Duration(minutes: 1));
      phone.fresh = _pos(-4.5, 15.5);
      final p = await currentPosition();
      expect((p.lat, p.lng), (-4.5, 15.5));
      expect(phone.calls, ['lastKnown', 'current']);
      expect(phone.freshSettings?.accuracy, LocationAccuracy.medium);
      expect(phone.freshSettings?.timeLimit, freshFixTimeLimit);
      expect(freshFixTimeLimit, lessThan(const Duration(seconds: 10)));
    });

    test('no last known position: the fresh fix is used', () async {
      phone.fresh = _pos(-4.5, 15.5);
      final p = await currentPosition();
      expect((p.lat, p.lng), (-4.5, 15.5));
    });

    test('no fresh fix in time: the older last known position is used instead of failing', () async {
      phone.lastKnown = _pos(-4.3, 15.3, age: const Duration(hours: 5));
      phone.fresh = null;
      final p = await currentPosition();
      expect((p.lat, p.lng), (-4.3, 15.3));
      expect(phone.calls, ['lastKnown', 'current']);
    });

    test('no fresh fix and nothing remembered: unavailable', () async {
      phone.fresh = null;
      await expectLater(currentPosition(), throwsA(isA<LocationException>().having((e) => e.problem, 'problem', LocationProblem.unavailable)));
    });

    test('a platform without last known positions still gets a fresh fix', () async {
      phone.lastKnownError = UnsupportedError('no');
      phone.fresh = _pos(-4.5, 15.5);
      final p = await currentPosition();
      expect((p.lat, p.lng), (-4.5, 15.5));
    });

    test('permission paths are unchanged and never touch the position', () async {
      phone.servicesOn = false;
      await expectLater(currentPosition(), throwsA(isA<LocationException>().having((e) => e.problem, 'problem', LocationProblem.servicesOff)));

      phone.servicesOn = true;
      phone.permission = LocationPermission.deniedForever;
      await expectLater(currentPosition(), throwsA(isA<LocationException>().having((e) => e.problem, 'problem', LocationProblem.blocked)));

      phone.permission = LocationPermission.denied;
      phone.afterRequest = LocationPermission.denied;
      await expectLater(currentPosition(), throwsA(isA<LocationException>().having((e) => e.problem, 'problem', LocationProblem.denied)));
      expect(phone.calls, ['request']);

      phone.permission = LocationPermission.denied;
      phone.afterRequest = LocationPermission.deniedForever;
      await expectLater(currentPosition(), throwsA(isA<LocationException>().having((e) => e.problem, 'problem', LocationProblem.blocked)));

      phone.permission = LocationPermission.denied;
      phone.afterRequest = LocationPermission.whileInUse;
      phone.lastKnown = _pos(-4.3, 15.3);
      final p = await currentPosition();
      expect((p.lat, p.lng), (-4.3, 15.3));
    });
  });

  group('Picker opening', () {
    late int geocodes;
    late Future<http.Response> Function() geocodeAnswer;

    PlacesClient client() => PlacesClient(
          apiKey: 'K',
          client: MockClient((req) async {
            if (req.url.toString().contains('geocode')) {
              geocodes++;
              return geocodeAnswer();
            }
            return http.Response('{}', 404);
          }),
        );

    setUp(() {
      geocodes = 0;
      geocodeAnswer = () async => http.Response(_geocodeJson(), 200);
    });

    Future<void> open(WidgetTester t, {bool locate = false, ({double lat, double lng})? pin}) async {
      gapTallViewport(t);
      await Strings.setLang('en', persist: false);
      await t.pumpWidget(gapApp(LocationPickerScreen(initialPin: pin, client: client(), mapBuilder: _fakeMap, locateOnOpen: locate), lang: 'en'));
    }

    Finder streetField() => find.descendant(of: find.byKey(const ValueKey('picker-street')), matching: find.byType(TextField));

    testWidgets('"Locating you…" shows from the first frame while the map is already usable', (t) async {
      final fix = Completer<({double lat, double lng})>();
      debugPosition = () => fix.future;
      await open(t, locate: true);
      const s = Strings('en');
      expect(find.text(s.locLocating), findsOneWidget, reason: 'first frame, before the post-frame callback ran');
      expect(find.byKey(const ValueKey('fake-pan')), findsOneWidget, reason: 'the map is not waiting for the fix');
      expect(find.byKey(const ValueKey('picker-confirm')), findsOneWidget);
      fix.complete(_gps);
      await t.pumpAndSettle();
      expect(find.text(s.locLocating), findsNothing);
      expect(geocodes, 1);
    });

    testWidgets('a fix that arrives in time centres the pin on it', (t) async {
      PickedPlace? got;
      debugPosition = () async => _gps;
      gapTallViewport(t);
      await t.pumpWidget(gapApp(
        Builder(
          builder: (ctx) => TextButton(
            key: const ValueKey('host-open'),
            onPressed: () async => got = await Navigator.push<PickedPlace>(ctx, MaterialPageRoute(builder: (_) => LocationPickerScreen(client: client(), mapBuilder: _fakeMap))),
            child: const Text('open'),
          ),
        ),
        lang: 'en',
      ));
      await t.tap(find.byKey(const ValueKey('host-open')));
      await t.pumpAndSettle();
      await t.tap(find.text(const Strings('en').locConfirm));
      await t.pumpAndSettle();
      expect((got!.lat, got!.lng), (_gps.lat, _gps.lng));
    });

    testWidgets('a late fix does not undo a pin the customer already moved', (t) async {
      final fix = Completer<({double lat, double lng})>();
      debugPosition = () => fix.future;
      PickedPlace? got;
      gapTallViewport(t);
      await t.pumpWidget(gapApp(
        Builder(
          builder: (ctx) => TextButton(
            key: const ValueKey('host-open'),
            onPressed: () async => got = await Navigator.push<PickedPlace>(ctx, MaterialPageRoute(builder: (_) => LocationPickerScreen(client: client(), mapBuilder: _fakeMap))),
            child: const Text('open'),
          ),
        ),
        lang: 'en',
      ));
      await t.tap(find.byKey(const ValueKey('host-open')));
      await t.pump();
      await t.pump(const Duration(milliseconds: 400)); // the route transition (the locating spinner never settles)
      await t.tap(find.byKey(const ValueKey('fake-pan')));
      await t.pump(lookupDebounce);
      await t.pump();
      fix.complete(_gps);
      await t.pumpAndSettle();
      await t.tap(find.text(const Strings('en').locConfirm));
      await t.pumpAndSettle();
      expect((got!.lat, got!.lng), (_panTo.latitude, _panTo.longitude), reason: 'the late fix was ignored');
    });

    testWidgets('a late fix does not touch a street the customer typed, nor move the pin', (t) async {
      final fix = Completer<({double lat, double lng})>();
      debugPosition = () => fix.future;
      PickedPlace? got;
      gapTallViewport(t);
      await t.pumpWidget(gapApp(
        Builder(
          builder: (ctx) => TextButton(
            key: const ValueKey('host-open'),
            onPressed: () async => got = await Navigator.push<PickedPlace>(ctx, MaterialPageRoute(builder: (_) => LocationPickerScreen(client: client(), mapBuilder: _fakeMap))),
            child: const Text('open'),
          ),
        ),
        lang: 'en',
      ));
      await t.tap(find.byKey(const ValueKey('host-open')));
      await t.pump();
      await t.pump(const Duration(milliseconds: 400)); // the route transition (the locating spinner never settles)
      await t.enterText(streetField(), '7 Avenue Kasa-Vubu');
      fix.complete(_gps);
      await t.pumpAndSettle();
      expect(geocodes, 0, reason: 'the ignored fix triggered no lookup');
      await t.tap(find.text(const Strings('en').locConfirm));
      await t.pumpAndSettle();
      expect(got!.parts.line1, '7 Avenue Kasa-Vubu');
      expect((got!.lat, got!.lng), isNot((_gps.lat, _gps.lng)));
    });

    testWidgets('quick pans send one address lookup after the map rests', (t) async {
      await open(t, pin: (lat: -4.31, lng: 15.31));
      await t.pumpAndSettle();
      expect(geocodes, 1, reason: 'the opening lookup');
      for (var i = 0; i < 3; i++) {
        await t.tap(find.byKey(const ValueKey('fake-pan')));
        await t.pump(const Duration(milliseconds: 100));
      }
      expect(geocodes, 1, reason: 'still inside the pause');
      expect(find.text(const Strings('en').locFinding), findsOneWidget);
      await t.pump(lookupDebounce);
      await t.pumpAndSettle();
      expect(geocodes, 2, reason: 'three pans, one lookup');
      expect(find.text('12 Avenue de la Paix, Gombe, Kinshasa'), findsOneWidget);
    });

    testWidgets('a slow lookup falls back to the bare pin with the notice and never blocks Confirm', (t) async {
      final never = Completer<http.Response>();
      geocodeAnswer = () => never.future;
      PickedPlace? got;
      gapTallViewport(t);
      await t.pumpWidget(gapApp(
        Builder(
          builder: (ctx) => TextButton(
            key: const ValueKey('host-open'),
            onPressed: () async => got = await Navigator.push<PickedPlace>(
                ctx, MaterialPageRoute(builder: (_) => LocationPickerScreen(initialPin: (lat: -4.31, lng: 15.31), client: client(), mapBuilder: _fakeMap, locateOnOpen: false))),
            child: const Text('open'),
          ),
        ),
        lang: 'en',
      ));
      await t.tap(find.byKey(const ValueKey('host-open')));
      await t.pump(const Duration(milliseconds: 400)); // the route transition
      await t.pump();
      const s = Strings('en');
      expect(find.text(s.locFinding), findsOneWidget);
      // Confirm is not held back by the lookup that is still running.
      await t.enterText(streetField(), '7 Avenue Kasa-Vubu');
      await t.pump(reverseGeocodeTimeout + const Duration(seconds: 1));
      expect(reverseGeocodeTimeout, lessThanOrEqualTo(const Duration(seconds: 5)));
      expect(find.text(s.addrMapLookupFailed), findsOneWidget);
      await t.tap(find.text(s.locConfirm));
      await t.pumpAndSettle();
      expect(got, isNotNull);
      expect(got!.parts.line1, '7 Avenue Kasa-Vubu');
      expect((got!.lat, got!.lng), (-4.31, 15.31));
      await t.pump(reverseGeocodeTimeout);
    });

    testWidgets('Confirm while a lookup is pending returns the pin with the typed street only', (t) async {
      final never = Completer<http.Response>();
      PickedPlace? got;
      gapTallViewport(t);
      await t.pumpWidget(gapApp(
        Builder(
          builder: (ctx) => TextButton(
            key: const ValueKey('host-open'),
            onPressed: () async => got = await Navigator.push<PickedPlace>(
                ctx, MaterialPageRoute(builder: (_) => LocationPickerScreen(initialPin: (lat: -4.31, lng: 15.31), client: client(), mapBuilder: _fakeMap, locateOnOpen: false))),
            child: const Text('open'),
          ),
        ),
        lang: 'en',
      ));
      await t.tap(find.byKey(const ValueKey('host-open')));
      await t.pumpAndSettle();
      geocodeAnswer = () => never.future;
      await t.tap(find.byKey(const ValueKey('fake-pan')));
      await t.pump(const Duration(milliseconds: 50));
      await t.tap(find.text(const Strings('en').locConfirm));
      await t.pumpAndSettle();
      expect(got, isNotNull, reason: 'not blocked by the pending lookup');
      expect((got!.lat, got!.lng), (_panTo.latitude, _panTo.longitude));
      expect(got!.parts.commune, isNull, reason: 'the previous pin\'s commune is not carried over');
      await t.pump(reverseGeocodeTimeout + const Duration(seconds: 1));
    });
  });
}

final GeolocatorPlatform _original = GeolocatorPlatform.instance;
