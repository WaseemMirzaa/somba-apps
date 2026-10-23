// Uber-style location picker (fixed centre pin, place search, mandatory exact street) and the address form
// rules that come with it: with maps available a pin and an exact street address are required to save.
// The native map cannot run in tests: a fake map stands in and "pans" by calling onMove + onIdle.
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/location_picker_screen.dart';
import 'package:lipcart/screens/more/support_extra.dart';
import 'package:lipcart/services/maps_config.dart';
import 'package:lipcart/services/places_client.dart';
import 'package:lipcart/services/realtime_store.dart';

import 'gap_helpers.dart';

/// Where the fake map's "pan" button moves the centre.
const _panTo = LatLng(-4.3301, 15.3122);

/// Google answers: reverse geocode gives a street with a number unless [bareGeocode] (area only).
PlacesClient _client({bool bareGeocode = false}) => PlacesClient(
      apiKey: 'K',
      client: MockClient((req) async {
        final u = req.url.toString();
        if (u.contains('geocode')) {
          return http.Response(
              jsonEncode({
                'status': 'OK',
                'results': [
                  {
                    'place_id': 'geo1',
                    'formatted_address': bareGeocode ? 'Gombe, Kinshasa' : '12 Avenue de la Paix, Gombe, Kinshasa',
                    'address_components': [
                      if (!bareGeocode) {'long_name': '12', 'types': ['street_number']},
                      if (!bareGeocode) {'long_name': 'Avenue de la Paix', 'types': ['route']},
                      {'long_name': 'Gombe', 'types': ['sublocality_level_1']},
                      {'long_name': 'Kinshasa', 'types': ['locality']},
                    ],
                  }
                ],
              }),
              200);
        }
        if (u.contains('autocomplete')) {
          final q = (jsonDecode(req.body) as Map)['input'] as String;
          return http.Response(
              jsonEncode({
                'suggestions': q.contains('zzz')
                    ? []
                    : [
                        {
                          'placePrediction': {
                            'placeId': 'lim1',
                            'structuredFormat': {'mainText': {'text': '5 Boulevard Lumumba'}, 'secondaryText': {'text': 'Limete, Kinshasa'}},
                          }
                        }
                      ],
              }),
              200);
        }
        if (u.contains('/places/lim1')) {
          return http.Response(
              jsonEncode({
                'id': 'lim1',
                'formattedAddress': '5 Boulevard Lumumba, Limete, Kinshasa',
                'location': {'latitude': -4.3555, 'longitude': 15.3444},
                'addressComponents': [
                  {'longText': '5', 'types': ['street_number']},
                  {'longText': 'Boulevard Lumumba', 'types': ['route']},
                  {'longText': 'Limete', 'types': ['sublocality_level_1']},
                  {'longText': 'Kinshasa', 'types': ['locality']},
                ],
              }),
              200);
        }
        return http.Response('{}', 404);
      }),
    );

Widget _fakeMap(BuildContext context,
        {required LatLng initial, required ValueChanged<LatLng> onMove, required VoidCallback onIdle, required ValueChanged<GoogleMapController> onCreated}) =>
    Container(
      color: const Color(0xFFDDE7DD),
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

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  setUp(() => gapReset());
  tearDown(() {
    MapsConfig.debugEnabledOverride = null;
    gapTearDown();
  });

  Finder snack(String text) => find.descendant(of: find.byType(SnackBar), matching: find.text(text));

  /// Opens the picker on a host screen; the popped result lands in [result].
  Future<void> openPicker(WidgetTester t, {required String lang, PlacesClient? client, ({double lat, double lng})? pin, void Function(PickedPlace?)? onResult}) async {
    gapTallViewport(t);
    await Strings.setLang(lang, persist: false);
    await t.pumpWidget(gapApp(
      Builder(
        builder: (ctx) => Scaffold(
          body: Center(
            child: TextButton(
              key: const ValueKey('host-open'),
              onPressed: () async {
                final r = await Navigator.push<PickedPlace>(
                  ctx,
                  MaterialPageRoute(builder: (_) => LocationPickerScreen(initialPin: pin, client: client ?? _client(), mapBuilder: _fakeMap, locateOnOpen: false)),
                );
                onResult?.call(r);
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
      lang: lang,
    ));
    await t.tap(find.byKey(const ValueKey('host-open')));
    await t.pumpAndSettle();
  }

  String street(WidgetTester t) => t.widget<TextField>(find.descendant(of: find.byKey(const ValueKey('picker-street')), matching: find.byType(TextField))).controller!.text;

  group('Location picker', () {
    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);

      testWidgets('the address under the centre pin fills the street, and Confirm returns the pin ($lang)', (t) async {
        PickedPlace? got;
        await openPicker(t, lang: lang, pin: (lat: -4.31, lng: 15.31), onResult: (r) => got = r);
        expect(find.byKey(const ValueKey('center-pin')), findsOneWidget);
        expect(find.text(s.locTitle), findsOneWidget);
        expect(find.text('12 Avenue de la Paix, Gombe, Kinshasa'), findsOneWidget);
        expect(street(t), '12 Avenue de la Paix');
        await t.tap(find.byKey(const ValueKey('fake-pan')));
        await t.pumpAndSettle();
        await t.tap(find.text(s.locConfirm));
        await t.pumpAndSettle();
        expect(got, isNotNull);
        expect((got!.lat, got!.lng), (_panTo.latitude, _panTo.longitude), reason: 'the pin is where the map was left');
        expect(got!.parts.line1, '12 Avenue de la Paix');
        expect(got!.parts.commune, 'Gombe');
      });

      testWidgets('an area without a street cannot be confirmed until the exact street is typed ($lang)', (t) async {
        PickedPlace? got;
        await openPicker(t, lang: lang, client: _client(bareGeocode: true), pin: (lat: -4.31, lng: 15.31), onResult: (r) => got = r);
        expect(street(t), isEmpty);
        await t.tap(find.text(s.locConfirm));
        await t.pump();
        await t.pump(const Duration(milliseconds: 300));
        expect(snack(s.addrErrStreet), findsOneWidget);
        expect(find.text(s.addrErrStreet), findsNWidgets(2), reason: 'inline error beside the snackbar');
        expect(find.byType(LocationPickerScreen), findsOneWidget, reason: 'still open');
        void dismissSnack() => t.state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger)).removeCurrentSnackBar();
        dismissSnack();
        await t.pump();

        await t.enterText(find.descendant(of: find.byKey(const ValueKey('picker-street')), matching: find.byType(TextField)), '12');
        await t.tap(find.text(s.locConfirm));
        await t.pump();
        await t.pump(const Duration(milliseconds: 300));
        expect(snack(s.addrErrStreetExact), findsOneWidget, reason: 'a bare number is not a street');
        dismissSnack();
        await t.pump();

        await t.enterText(find.descendant(of: find.byKey(const ValueKey('picker-street')), matching: find.byType(TextField)), '7 Avenue Kasa-Vubu');
        // Moving the map again must not wipe what the customer typed.
        await t.tap(find.byKey(const ValueKey('fake-pan')));
        await t.pumpAndSettle();
        expect(street(t), '7 Avenue Kasa-Vubu');
        await t.tap(find.text(s.locConfirm));
        await t.pumpAndSettle();
        expect(got?.parts.line1, '7 Avenue Kasa-Vubu');
      });

      testWidgets('searching a place moves the pin there and takes its street ($lang)', (t) async {
        PickedPlace? got;
        await openPicker(t, lang: lang, pin: (lat: -4.31, lng: 15.31), onResult: (r) => got = r);
        await t.tap(find.byKey(const ValueKey('picker-search')));
        await t.pump();
        expect(find.byKey(const ValueKey('picker-current')), findsOneWidget);
        expect(find.byKey(const ValueKey('picker-card')), findsNothing, reason: 'search covers the map');
        await t.enterText(find.byKey(const ValueKey('picker-search')), 'lumumba');
        await t.pump(const Duration(milliseconds: 400));
        await t.pumpAndSettle();
        await t.tap(find.byKey(const ValueKey('picker-suggestion-lim1')));
        await t.pumpAndSettle();
        expect(find.byKey(const ValueKey('picker-card')), findsOneWidget);
        expect(street(t), '5 Boulevard Lumumba');
        expect(find.text('5 Boulevard Lumumba, Limete, Kinshasa'), findsOneWidget);
        await t.tap(find.text(s.locConfirm));
        await t.pumpAndSettle();
        expect((got!.lat, got!.lng), (-4.3555, 15.3444));
        expect(got!.parts.commune, 'Limete');
        expect(got!.placeId, 'lim1');
      });

      testWidgets('a search with no match says so ($lang)', (t) async {
        await openPicker(t, lang: lang, pin: (lat: -4.31, lng: 15.31));
        await t.tap(find.byKey(const ValueKey('picker-search')));
        await t.pump();
        await t.enterText(find.byKey(const ValueKey('picker-search')), 'zzzz');
        await t.pump(const Duration(milliseconds: 400));
        await t.pumpAndSettle();
        expect(find.byKey(const ValueKey('picker-no-results')), findsOneWidget);
        expect(find.text(s.locNoResults), findsOneWidget);
      });

      testWidgets('back from the picker returns nothing ($lang)', (t) async {
        var called = false;
        PickedPlace? got;
        await openPicker(t, lang: lang, pin: (lat: -4.31, lng: 15.31), onResult: (r) {
          called = true;
          got = r;
        });
        await t.tap(find.byKey(const ValueKey('picker-back')));
        await t.pumpAndSettle();
        expect(called, isTrue);
        expect(got, isNull);
      });
    }

    test('street rule: empty, too short and number-only are refused; number + street passes', () {
      const s = Strings('en');
      expect(streetAddressError('  ', s), s.addrErrStreet);
      expect(streetAddressError('12', s), s.addrErrStreetExact);
      expect(streetAddressError('12 b', s), isNull);
      expect(streetAddressError('Avenue de la Paix', s), isNull);
      expect(streetAddressError('12 Avenue de la Paix', s), isNull);
    });
  });

  group('Address form with maps available', () {
    setUp(() => MapsConfig.debugEnabledOverride = true);

    Future<void> openForm(WidgetTester t, String lang) async {
      gapTallViewport(t);
      await Strings.setLang(lang, persist: false);
      await t.pumpWidget(gapApp(AddressFormScreen(locale: Locale(lang), placesClient: _client(), mapBuilder: _fakeMap), lang: lang));
      await t.pump();
    }

    Finder field(int i) => find.byType(TextField).at(i);

    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);

      testWidgets('saving without a pin is refused with a snackbar and an inline error ($lang)', (t) async {
        final sent = <Map<String, dynamic>>[];
        RealtimeStore.instance.debugAddressRequest = (ev, [body]) async {
          sent.add(body!);
          return {'id': 'n1', ...body};
        };
        await openForm(t, lang);
        expect(find.byKey(const ValueKey('pick-location')), findsOneWidget);
        expect(find.byKey(const ValueKey('map-unavailable')), findsNothing);
        await t.enterText(field(2), '12 Avenue de la Paix');
        await t.tap(find.byKey(const ValueKey('save-address')));
        await t.pump();
        await t.pump(const Duration(milliseconds: 300));
        expect(snack(s.addrPinRequired), findsOneWidget);
        expect(find.byKey(const ValueKey('pin-error')), findsOneWidget);
        expect(sent, isEmpty);
      });

      testWidgets('a pin from the picker fills the form and is saved with the address ($lang)', (t) async {
        final sent = <Map<String, dynamic>>[];
        RealtimeStore.instance.debugAddressRequest = (ev, [body]) async {
          sent.add(body!);
          return {'id': 'n1', ...body};
        };
        await openForm(t, lang);
        await t.tap(find.byKey(const ValueKey('pick-location')));
        await t.pumpAndSettle();
        expect(find.byType(LocationPickerScreen), findsOneWidget);
        await t.tap(find.byKey(const ValueKey('fake-pan')));
        await t.pumpAndSettle();
        await t.tap(find.text(s.locConfirm));
        await t.pumpAndSettle();
        expect(find.byType(LocationPickerScreen), findsNothing);
        expect(find.text('12 Avenue de la Paix, Gombe, Kinshasa'), findsOneWidget, reason: 'the card shows the pinned address');
        expect(find.text('12 Avenue de la Paix'), findsOneWidget, reason: 'street field filled');
        expect(find.text('Gombe'), findsWidgets);
        await t.tap(find.byKey(const ValueKey('save-address')));
        await t.pumpAndSettle();
        expect(sent, hasLength(1));
        expect(sent.single['line1'], '12 Avenue de la Paix');
        expect(sent.single['commune'], 'Gombe');
        expect((sent.single['geo'] as Map)['lat'], _panTo.latitude);
        expect((sent.single['geo'] as Map)['lng'], _panTo.longitude);
      });

      testWidgets('the street must be exact on the form too ($lang)', (t) async {
        await openForm(t, lang);
        await t.enterText(field(2), '12');
        await t.tap(find.byKey(const ValueKey('save-address')));
        await t.pump();
        await t.pump(const Duration(milliseconds: 300));
        expect(find.text(s.addrErrStreetExact), findsWidgets);
      });
    }
  });
}
