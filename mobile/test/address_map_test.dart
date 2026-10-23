// Google Maps address picker: Places/Geocoding parsing and client, the pin on the address model,
// and the no-key fallback (the native map is never created without a key, so the form still works).
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/more/support_extra.dart';
import 'package:lipcart/services/maps_config.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/places_client.dart';
import 'package:lipcart/theme/app_theme.dart';

Widget _app(Widget child, String lang) => MaterialApp(
      theme: AppTheme.light(),
      locale: Locale(lang),
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      home: child,
    );

void main() {
  group('Places parsing', () {
    test('suggestions keep id, title and subtitle and skip malformed rows', () {
      final out = parseSuggestions({
        'suggestions': [
          {
            'placePrediction': {
              'placeId': 'abc',
              'structuredFormat': {'mainText': {'text': 'Avenue de la Paix'}, 'secondaryText': {'text': 'Gombe, Kinshasa'}},
            }
          },
          {'placePrediction': {'placeId': 'def', 'text': {'text': 'Fallback text'}}},
          {'queryPrediction': {}},
          {'placePrediction': {'structuredFormat': {}}},
        ],
      });
      expect(out.map((s) => s.placeId), ['abc', 'def']);
      expect(out.first.title, 'Avenue de la Paix');
      expect(out.first.subtitle, 'Gombe, Kinshasa');
      expect(out.last.title, 'Fallback text');
    });

    test('place details give coordinates and address parts', () {
      final p = parsePlaceDetails({
        'id': 'ChIJx',
        'formattedAddress': '42 Avenue de la Libération, Gombe, Kinshasa',
        'location': {'latitude': -4.31, 'longitude': 15.31},
        'addressComponents': [
          {'longText': '42', 'types': ['street_number']},
          {'longText': 'Avenue de la Libération', 'types': ['route']},
          {'longText': 'Gombe', 'types': ['sublocality_level_1', 'sublocality']},
          {'longText': 'Kinshasa', 'types': ['locality']},
          {'longText': 'DR Congo', 'types': ['country']},
        ],
      });
      expect((p.lat, p.lng, p.placeId), (-4.31, 15.31, 'ChIJx'));
      expect(p.parts.line1, '42 Avenue de la Libération');
      expect(p.parts.commune, 'Gombe');
      expect(p.parts.city, 'Kinshasa');
      expect(p.parts.country, 'DR Congo');
    });

    test('place details without a location are rejected', () {
      expect(() => parsePlaceDetails({'id': 'x'}), throwsA(isA<PlacesException>()));
    });

    test('geocode result fills parts; empty results keep the bare pin', () {
      final r = parseGeocode({
        'results': [
          {
            'place_id': 'p1',
            'formatted_address': '5 Boulevard du 30 Juin, Limete',
            'address_components': [
              {'long_name': '5', 'types': ['street_number']},
              {'long_name': 'Boulevard du 30 Juin', 'types': ['route']},
              {'long_name': 'Limete', 'types': ['sublocality_level_1']},
              {'long_name': 'Kinshasa', 'types': ['locality']},
            ],
          }
        ]
      }, -4.3, 15.3);
      expect(r.parts.line1, '5 Boulevard du 30 Juin');
      expect(r.parts.commune, 'Limete');
      final bare = parseGeocode({'results': []}, -4.3, 15.3);
      expect((bare.lat, bare.lng, bare.parts.line1), (-4.3, 15.3, null));
    });

    test('geo JSON rounds to 6 decimals and omits empty fields', () {
      const p = PickedPlace(lat: -4.322498123, lng: 15.3070009, placeId: 'x');
      expect(p.toGeoJson(), {'lat': -4.322498, 'lng': 15.307001, 'placeId': 'x'});
    });
  });

  group('PlacesClient', () {
    test('autocomplete sends the key header, regions and session token', () async {
      late http.Request seen;
      final c = PlacesClient(
        apiKey: 'K',
        client: MockClient((req) async {
          seen = req;
          return http.Response(jsonEncode({'suggestions': [{'placePrediction': {'placeId': 'a', 'text': {'text': 'T'}}}]}), 200);
        }),
      );
      final out = await c.autocomplete('Gombe', sessionToken: 'sess');
      expect(out.single.placeId, 'a');
      expect(seen.headers['X-Goog-Api-Key'], 'K');
      final body = jsonDecode(seen.body) as Map;
      expect(body['sessionToken'], 'sess');
      expect(body['includedRegionCodes'], ['cd', 'fr']);
    });

    test('short queries make no request', () async {
      var calls = 0;
      final c = PlacesClient(apiKey: 'K', client: MockClient((_) async {
        calls++;
        return http.Response('{}', 200);
      }));
      expect(await c.autocomplete('a', sessionToken: 's'), isEmpty);
      expect(calls, 0);
    });

    test('details asks only for the fields it needs', () async {
      late http.Request seen;
      final c = PlacesClient(apiKey: 'K', client: MockClient((req) async {
        seen = req;
        return http.Response(jsonEncode({'id': 'p', 'location': {'latitude': 1.0, 'longitude': 2.0}}), 200);
      }));
      final p = await c.details('p', sessionToken: 's');
      expect(p.lat, 1.0);
      expect(seen.headers['X-Goog-FieldMask'], 'id,formattedAddress,location,addressComponents');
    });

    test('API errors surface as PlacesException with Google\'s message', () async {
      final c = PlacesClient(apiKey: 'bad', client: MockClient((_) async => http.Response(jsonEncode({'error': {'message': 'API key not valid'}}), 403)));
      expect(() => c.autocomplete('Gombe', sessionToken: 's'), throwsA(predicate((e) => e.toString().contains('API key not valid'))));
    });

    test('reverse geocoding reports a rejected key', () async {
      final c = PlacesClient(apiKey: 'bad', client: MockClient((_) async => http.Response(jsonEncode({'status': 'REQUEST_DENIED', 'error_message': 'bad key'}), 200)));
      expect(() => c.reverseGeocode(1, 2), throwsA(isA<PlacesException>()));
    });
  });

  group('Address model', () {
    test('reads the pin the server returns', () {
      final a = AddressDto.fromJson({'id': '1', 'label': 'Home', 'line1': 'x', 'city': 'Kinshasa', 'geo': {'lat': -4.3, 'lng': 15.3, 'placeId': 'p', 'formatted': 'F'}});
      expect(a.hasPin, isTrue);
      expect((a.geo!.lat, a.geo!.lng, a.geo!.placeId), (-4.3, 15.3, 'p'));
    });
    test('addresses typed by hand have no pin', () {
      expect(AddressDto.fromJson({'id': '1', 'label': 'Home', 'line1': 'x', 'city': 'Kinshasa'}).hasPin, isFalse);
      expect(AddressDto.fromJson({'id': '1', 'label': 'H', 'line1': 'x', 'city': 'K', 'geo': null}).hasPin, isFalse);
    });
  });

  group('Without a Maps key', () {
    test('the map is off by default in tests', () => expect(MapsConfig.enabled, isFalse));

    for (final lang in ['en', 'fr']) {
      testWidgets('address form shows the notice, no pin card and no native map ($lang)', (t) async {
        await t.pumpWidget(_app(const AddressFormScreen(), lang));
        await t.pump();
        expect(find.byKey(const ValueKey('map-unavailable')), findsOneWidget);
        expect(find.byKey(const ValueKey('pick-location')), findsNothing);
        expect(find.text(Strings(lang).addrMapUnavailable), findsOneWidget);
      });

      testWidgets('address form still renders every field, no overflow, on a small phone ($lang)', (t) async {
        t.view.physicalSize = const Size(360 * 3, 740 * 3);
        t.view.devicePixelRatio = 3;
        addTearDown(t.view.reset);
        await t.pumpWidget(_app(const AddressFormScreen(), lang));
        await t.pump();
        expect(find.byKey(const ValueKey('map-unavailable')), findsOneWidget);
        await t.scrollUntilVisible(find.byKey(const ValueKey('save-address')), 300, scrollable: find.byType(Scrollable).first);
        expect(find.byKey(const ValueKey('save-address')), findsOneWidget);
        expect(find.byKey(const ValueKey('address-landmark')), findsOneWidget);
        expect(tester(t), isNull);
      });
    }
  });
}

Object? tester(WidgetTester t) => t.takeException();
