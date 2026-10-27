// The address form's delivery area: Google's address components go to geo:resolve and fill Province > City > Commune,
// the pickers list served areas first (unserved ones greyed out "Coming soon"), names follow the app's language, an
// area nobody serves is flagged but can be saved, and an older server (no geography) keeps the typed fields.
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/more/support_extra.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/geo_directory.dart';
import 'package:lipcart/services/maps_config.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/places_client.dart';
import 'package:lipcart/services/realtime_store.dart';

import 'areas_helpers.dart';
import 'gap_helpers.dart';

/// Where Google's reverse geocoding is asked, and in which language (`language=` of each request).
final _googleUrls = <Uri>[];

http.Client _google({String commune = 'Gombe'}) => MockClient((req) async {
      _googleUrls.add(req.url);
      return http.Response(
          jsonEncode({
            'status': 'OK',
            'results': [
              {
                'place_id': 'geo1',
                'formatted_address': '12 Avenue de la Paix, $commune, Kinshasa',
                'address_components': [
                  {'long_name': '12', 'types': ['street_number']},
                  {'long_name': 'Avenue de la Paix', 'types': ['route']},
                  {'long_name': commune, 'types': ['sublocality_level_1', 'sublocality']},
                  {'long_name': 'Kinshasa', 'types': ['locality']},
                  {'long_name': 'Kinshasa', 'types': ['administrative_area_level_1']},
                  {'long_name': 'Democratic Republic of the Congo', 'types': ['country']},
                ],
              }
            ],
          }),
          200);
    });

Widget _fakeMap(BuildContext context,
        {required LatLng initial, required ValueChanged<LatLng> onMove, required VoidCallback onIdle, required ValueChanged<GoogleMapController> onCreated}) =>
    Align(
      alignment: Alignment.topLeft,
      child: Padding(
        padding: const EdgeInsets.only(top: 120),
        child: TextButton(
          key: const ValueKey('fake-pan'),
          onPressed: () {
            onMove(const LatLng(-4.3301, 15.3122));
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
  final saved = <Map<String, dynamic>>[];
  final resolves = <Map<String, dynamic>>[];

  setUp(() async {
    await gapReset();
    resetGeo();
    saved.clear();
    resolves.clear();
    _googleUrls.clear();
    RealtimeStore.instance.debugAddressRequest = (ev, [body]) async {
      // create: the body; update: {id, patch}
      final sent = ev == 'addresses:update' ? Map<String, dynamic>.from(body!['patch'] as Map) : body!;
      saved.add(sent);
      return {'id': ev == 'addresses:update' ? body['id'] : 'n1', 'label': 'Home', 'line1': 'x', 'city': 'Kinshasa', ...sent};
    };
  });
  tearDown(() {
    MapsConfig.debugEnabledOverride = null;
    resetGeo();
    gapTearDown();
  });

  void serve({Object? Function(Map<String, dynamic>? body)? resolve}) =>
      RealtimeStore.instance.debugCallRequest = areaCalls(resolve: resolve, resolves: resolves);

  Future<void> open(WidgetTester t, String lang, {AddressDto? existing, bool maps = false, String commune = 'Gombe'}) async {
    gapTallViewport(t);
    await Strings.setLang(lang, persist: false);
    MapsConfig.debugEnabledOverride = maps;
    await t.pumpWidget(gapApp(
      AddressFormScreen(
          locale: Locale(lang), existing: existing, placesClient: maps ? PlacesClient(apiKey: 'K', language: lang, client: _google(commune: commune)) : null, mapBuilder: maps ? _fakeMap : null),
      lang: lang,
    ));
    await t.pump();
    await t.pump();
  }

  Finder field(String level) => find.byKey(ValueKey('area-field-$level'));
  Finder inField(String level, String text) => find.descendant(of: field(level), matching: find.text(text));
  Finder option(String id) => find.byKey(ValueKey('area-option-$id'));
  Finder textField(int i) => find.byType(TextField).at(i);
  Finder snack(String text) => find.descendant(of: find.byType(SnackBar), matching: find.text(text));

  /// Pin on the map, as in the real flow: open the picker, pan, confirm.
  Future<void> pinOnMap(WidgetTester t, Strings s) async {
    await t.tap(find.byKey(const ValueKey('pick-location')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('fake-pan')));
    await t.pumpAndSettle();
    await t.tap(find.text(s.locConfirm));
    await t.pumpAndSettle();
  }

  Future<void> save(WidgetTester t) async {
    await t.tap(find.byKey(const ValueKey('save-address')));
    await t.pump();
    await t.pump(const Duration(milliseconds: 400));
  }

  for (final lang in ['en', 'fr']) {
    final s = Strings(lang);

    group('the pin fills the delivery area ($lang)', () {
      testWidgets('Google\'s components go to geo:resolve and the chain fills Province, City and Commune', (t) async {
        serve(resolve: (_) => resolved(['p-kin', 'c-kin', 'd-luk', 'm-gombe']));
        await open(t, lang, maps: true);
        await pinOnMap(t, s);

        expect(resolves, hasLength(1));
        final body = resolves.single;
        final comps = (body['components'] as List).cast<Map>();
        expect(comps.firstWhere((c) => (c['types'] as List).contains('sublocality_level_1'))['long_name'], 'Gombe');
        expect(comps.firstWhere((c) => (c['types'] as List).contains('locality'))['long_name'], 'Kinshasa');
        expect(comps.firstWhere((c) => (c['types'] as List).contains('administrative_area_level_1'))['long_name'], 'Kinshasa');
        expect(body['pin'], {'lat': -4.3301, 'lng': 15.3122});
        expect(body['text'], {'commune': 'Gombe', 'city': 'Kinshasa', 'province': 'Kinshasa'});

        expect(inField('province', 'Kinshasa'), findsOneWidget);
        expect(inField('city', 'Kinshasa'), findsOneWidget);
        expect(inField('commune', 'Gombe'), findsOneWidget);
        expect(find.byKey(const ValueKey('area-from-pin')), findsOneWidget);
        expect(find.text(s.checkoutFromHub('Entrepôt Kinshasa')), findsOneWidget, reason: 'the warehouse that delivers here');
        expect(find.byKey(const ValueKey('area-not-served')), findsNothing);
        expect(find.text(s.addrCommune), findsOneWidget, reason: 'only the commune picker: the typed commune field is gone');
        expect(find.byType(TextField), findsNWidgets(4), reason: 'label, phone, street, landmark: no typed city or commune');
      });

      testWidgets('saving sends areaId and the names in Google\'s spelling, with the pin', (t) async {
        serve(resolve: (_) => resolved(['p-kin', 'c-kin', 'd-luk', 'm-gombe']));
        await open(t, lang, maps: true);
        await pinOnMap(t, s);
        await save(t);
        expect(saved, hasLength(1));
        expect(saved.single['areaId'], 'm-gombe');
        expect(saved.single['commune'], 'Gombe');
        expect(saved.single['city'], 'Kinshasa');
        expect(saved.single['region'], 'Kinshasa');
        expect(saved.single['line1'], '12 Avenue de la Paix');
        expect((saved.single['geo'] as Map)['lat'], -4.3301);
        expect(snack(s.addrSaved), findsOneWidget);
      });

      testWidgets('a pin in an area nobody serves is flagged, and the address can still be saved', (t) async {
        serve(resolve: (_) => resolved(['p-nk', 'c-goma'], served: false));
        await open(t, lang, maps: true, commune: 'Goma');
        await pinOnMap(t, s);
        expect(inField('province', lang == 'en' ? 'North Kivu' : 'Nord-Kivu'), findsOneWidget);
        expect(inField('city', 'Goma'), findsOneWidget);
        expect(find.byKey(const ValueKey('area-not-served')), findsOneWidget);
        expect(find.text(s.areaNotServed('Goma')), findsOneWidget);
        expect(find.text(s.areaNotServedSave), findsOneWidget);
        expect(find.byKey(const ValueKey('area-hub')), findsNothing);
        await save(t);
        expect(saved.single['areaId'], 'c-goma');
        expect(snack(s.addrSaved), findsOneWidget);
      });

      testWidgets('a pin that matches no area keeps the typed city and commune, and says so', (t) async {
        serve(resolve: (_) => kNoMatch);
        await open(t, lang, maps: true);
        await pinOnMap(t, s);
        expect(find.byKey(const ValueKey('area-no-match')), findsOneWidget);
        expect(find.text(s.areaNoMatch), findsOneWidget);
        expect(find.byType(TextField), findsNWidgets(6), reason: 'the typed commune and city stand in');
        await save(t);
        expect(saved.single.containsKey('areaId'), isFalse);
        expect(saved.single['city'], 'Kinshasa', reason: 'typed (filled from the pin)');
        expect(saved.single['commune'], 'Gombe');
      });

      testWidgets('a failed match tells the user and leaves the form usable', (t) async {
        RealtimeStore.instance.debugCallRequest = (event, [body]) async {
          if (event == 'geo:resolve') throw ApiException('Area not found.');
          return areaCalls()(event, body);
        };
        await open(t, lang, maps: true);
        await pinOnMap(t, s);
        expect(snack(s.serverError('Area not found.')), findsOneWidget);
        expect(find.byType(TextField), findsNWidgets(6), reason: 'typed fields as a fallback');
      });
    });

    group('the pickers ($lang)', () {
      testWidgets('served provinces come first, the others are greyed out as coming soon and cannot be chosen', (t) async {
        serve();
        await open(t, lang);
        expect(find.byKey(const ValueKey('area-section')), findsOneWidget);
        await t.tap(field('province'));
        await t.pumpAndSettle();
        expect(find.text(s.areaSheetTitle('province')), findsOneWidget);
        final nk = lang == 'en' ? 'North Kivu' : 'Nord-Kivu';
        final kc = lang == 'en' ? 'Kongo Central' : 'Kongo-Central';
        expect(find.text(nk), findsOneWidget);
        expect(find.text(kc), findsOneWidget);
        // served first: Kinshasa and Kongo-Central sit above Nord-Kivu
        double y(String id) => t.getTopLeft(option(id)).dy;
        expect(y('p-kin'), lessThan(y('p-nk')));
        expect(y('p-kc'), lessThan(y('p-nk')));
        expect(find.byKey(const ValueKey('area-soon-p-nk')), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('area-soon-p-nk')), matching: find.text(s.areaComingSoon)), findsOneWidget);
        expect(find.byKey(const ValueKey('area-soon-p-kin')), findsNothing);
        await t.tap(option('p-nk'));
        await t.pumpAndSettle();
        expect(find.text(s.areaSheetTitle('province')), findsOneWidget, reason: 'an unserved province cannot be chosen: the sheet stays');
        expect(find.descendant(of: field('province'), matching: find.text(nk)), findsNothing);
      });

      testWidgets('a long list can be searched, in the language of the app', (t) async {
        serve();
        await open(t, lang);
        await t.tap(field('province'));
        await t.pumpAndSettle();
        expect(find.byKey(const ValueKey('area-search')), findsOneWidget);
        await t.enterText(find.byKey(const ValueKey('area-search')), lang == 'en' ? 'north' : 'nord');
        await t.pump();
        expect(option('p-nk'), findsOneWidget);
        expect(option('p-kin'), findsNothing);
        await t.enterText(find.byKey(const ValueKey('area-search')), 'zzzz');
        await t.pump();
        expect(find.byKey(const ValueKey('area-none')), findsOneWidget);
        expect(find.text(s.areaNoneFound), findsOneWidget);
      });

      testWidgets('province, then city (chosen for you when it is the only one), then commune grouped by district, then save', (t) async {
        serve();
        await open(t, lang);
        expect(find.byKey(const ValueKey('area-field-commune')), findsNothing, reason: 'no city yet');
        await t.tap(field('province'));
        await t.pumpAndSettle();
        await t.tap(option('p-kin'));
        await t.pumpAndSettle();
        expect(inField('province', 'Kinshasa'), findsOneWidget);
        expect(inField('city', 'Kinshasa'), findsOneWidget, reason: 'Kinshasa has one city: no second tap');

        await t.tap(field('commune'));
        await t.pumpAndSettle();
        expect(find.byKey(const ValueKey('area-group-d-luk')), findsOneWidget);
        expect(find.byKey(const ValueKey('area-group-d-mon')), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('area-group-d-mon')), matching: find.text('Mont-Amba')), findsOneWidget);
        for (final c in ['m-gombe', 'm-ngal', 'm-limete', 'm-matete']) {
          expect(option(c), findsOneWidget);
        }
        await t.tap(option('m-limete'));
        await t.pumpAndSettle();
        expect(inField('commune', 'Limete'), findsOneWidget);
        expect(find.byKey(const ValueKey('area-field-quartier')), findsNothing, reason: 'Limete has no quartiers');
        expect(find.text(s.checkoutFromHub('Entrepôt Limete')), findsOneWidget);
        expect(find.byKey(const ValueKey('area-from-pin')), findsNothing, reason: 'picked by hand');

        await t.enterText(textField(2), '5 Boulevard Lumumba');
        await save(t);
        expect(saved.single['areaId'], 'm-limete');
        expect(saved.single['commune'], 'Limete');
        expect(saved.single['city'], 'Kinshasa');
        expect(saved.single['region'], 'Kinshasa');
        expect(saved.single.containsKey('geo'), isFalse, reason: 'no pin was set');
        expect(snack(s.addrSaved), findsOneWidget);
      });

      testWidgets('a commune with quartiers offers them, optionally', (t) async {
        serve();
        await open(t, lang);
        await t.tap(field('province'));
        await t.pumpAndSettle();
        await t.tap(option('p-kin'));
        await t.pumpAndSettle();
        await t.tap(field('commune'));
        await t.pumpAndSettle();
        await t.tap(option('m-gombe'));
        await t.pumpAndSettle();
        expect(field('quartier'), findsOneWidget);
        await t.tap(field('quartier'));
        await t.pumpAndSettle();
        await t.tap(option('q-bat'));
        await t.pumpAndSettle();
        expect(inField('quartier', 'Batetela'), findsOneWidget);
        await t.enterText(textField(2), '5 Boulevard Lumumba');
        await save(t);
        expect(saved.single['areaId'], 'q-bat', reason: 'the most specific area');
        expect(saved.single['commune'], 'Gombe');
      });

      testWidgets('changing the province clears the city and commune below it', (t) async {
        serve();
        await open(t, lang);
        await t.tap(field('province'));
        await t.pumpAndSettle();
        await t.tap(option('p-kin'));
        await t.pumpAndSettle();
        await t.tap(field('commune'));
        await t.pumpAndSettle();
        await t.tap(option('m-limete'));
        await t.pumpAndSettle();
        await t.tap(field('province'));
        await t.pumpAndSettle();
        await t.tap(option('p-kc'));
        await t.pumpAndSettle();
        expect(find.descendant(of: field('city'), matching: find.text('Kinshasa')), findsNothing);
        expect(find.byKey(const ValueKey('area-field-commune')), findsNothing);
      });

      testWidgets('a city is required: a snackbar and an inline error, nothing saved', (t) async {
        serve();
        await open(t, lang);
        await t.enterText(textField(2), '5 Boulevard Lumumba');
        await save(t);
        expect(saved, isEmpty);
        expect(snack(s.addrErrCity), findsOneWidget);
        expect(find.text(s.addrErrCity), findsNWidgets(2), reason: 'inline error beside the snackbar');
      });

      testWidgets('the city picker waits for a province', (t) async {
        serve();
        await open(t, lang);
        await t.tap(field('city'));
        await t.pumpAndSettle();
        expect(find.text(s.areaSheetTitle('city')), findsNothing);
      });

      testWidgets('editing an address pre-selects its areas and keeps its area id', (t) async {
        serve();
        final a = AddressDto.fromJson({
          'id': 'a1',
          'label': 'Home',
          'line1': '12 Avenue de la Paix',
          'commune': 'Gombe',
          'city': 'Kinshasa',
          'areaId': 'm-gombe',
          'areaChain': chainOf(['p-kin', 'c-kin', 'd-luk', 'm-gombe']),
          'served': true,
        });
        await open(t, lang, existing: a);
        expect(inField('province', 'Kinshasa'), findsOneWidget);
        expect(inField('commune', 'Gombe'), findsOneWidget);
        expect(field('quartier'), findsOneWidget);
        await save(t);
        expect(saved.single['areaId'], 'm-gombe');
      });

      testWidgets('an address saved before areas keeps its typed city and commune until an area is chosen', (t) async {
        serve();
        final a = AddressDto.fromJson({'id': 'a1', 'label': 'Home', 'line1': '12 Avenue de la Paix', 'commune': 'Limete', 'city': 'Kinshasa'});
        await open(t, lang, existing: a);
        expect(find.byType(TextField), findsNWidgets(6));
        expect(textFieldValue(t, 4), 'Limete');
        await save(t);
        expect(saved.single['city'], 'Kinshasa');
        expect(saved.single['commune'], 'Limete');
        expect(saved.single.containsKey('areaId'), isFalse, reason: 'the server works it out from the text');
      });

      testWidgets('areas that cannot be loaded are reported in a snackbar', (t) async {
        serve();
        await open(t, lang);
        RealtimeStore.instance.debugCallRequest = (event, [body]) async {
          if (event == 'geo:children') throw ApiException('Area not found.');
          return const <dynamic>[];
        };
        resetGeo();
        await t.tap(field('province'));
        await t.pumpAndSettle();
        expect(snack(s.serverError('Area not found.')), findsOneWidget);
        expect(find.text(s.areaSheetTitle('province')), findsNothing);
      });
    });
  }

  group('names follow the language of the app', () {
    testWidgets('chosen areas and the sheets switch between the English and the official name', (t) async {
      serve();
      gapTallViewport(t);
      MapsConfig.debugEnabledOverride = false;
      const form = AddressFormScreen();
      Future<void> pump(String lang) async {
        await Strings.setLang(lang, persist: false);
        await t.pumpWidget(gapApp(form, lang: lang));
        await t.pump();
        await t.pump();
      }

      await pump('fr');
      await t.tap(field('province'));
      await t.pumpAndSettle();
      expect(find.text('Nord-Kivu'), findsOneWidget);
      expect(find.text('North Kivu'), findsNothing);
      expect(find.text('Bientôt'), findsWidgets);
      await t.tap(option('p-kc'));
      await t.pumpAndSettle();
      expect(inField('province', 'Kongo-Central'), findsOneWidget);

      // The language changes under the open form: the chosen province is renamed, and so is the list.
      await pump('en');
      expect(inField('province', 'Kongo Central'), findsOneWidget);
      expect(inField('province', 'Kongo-Central'), findsNothing);
      await t.tap(field('province'));
      await t.pumpAndSettle();
      expect(find.text('North Kivu'), findsOneWidget);
      expect(find.text('Nord-Kivu'), findsNothing);
      expect(find.text('Coming soon'), findsWidgets);
      expect(find.text('Bientôt'), findsNothing);
      expect(find.text('Choose a province'), findsOneWidget);
    });
  });

  group('older servers', () {
    testWidgets('no geography (empty answer): the typed city and commune, exactly as before', (t) async {
      RealtimeStore.instance.debugCallRequest = gapCalls();
      await open(t, 'en');
      expect(find.byKey(const ValueKey('area-section')), findsNothing);
      expect(find.byType(TextField), findsNWidgets(6));
      await t.enterText(textField(2), '5 Boulevard Lumumba');
      await save(t);
      expect(saved.single['city'], 'Kinshasa');
      expect(saved.single.containsKey('areaId'), isFalse);
      expect(saved.single.containsKey('region'), isFalse);
    });

    testWidgets('an unknown event (the server refuses it): the same, and no error is shown', (t) async {
      RealtimeStore.instance.debugCallRequest = (event, [body]) async {
        if (event.startsWith('geo:')) throw ApiException('Unknown event.');
        return const <dynamic>[];
      };
      await open(t, 'fr');
      expect(find.byKey(const ValueKey('area-section')), findsNothing);
      expect(find.byType(SnackBar), findsNothing);
      expect(find.byType(TextField), findsNWidgets(6));
    });
  });

  group('the geography is kept fresh', () {
    testWidgets('a coverage change drops the cached areas so "served" is read again', (t) async {
      serve();
      await open(t, 'en');
      expect(GeoDirectory.instance.cached(null), isNotNull);
      RealtimeStore.instance.debugEmit('coverage:updated', {'hubId': 'hub-kin', 'areaIds': ['p-nk']});
      expect(GeoDirectory.instance.cached(null), isNull);
      await t.pump();
    });

    testWidgets('a geography change does too', (t) async {
      serve();
      await open(t, 'en');
      RealtimeStore.instance.debugEmit('geo:updated', area('m-gombe', 'commune', 'Gombe'));
      expect(GeoDirectory.instance.cached(null), isNull);
    });
  });

  group('Google is asked in the language of the app', () {
    for (final lang in ['en', 'fr']) {
      test('reverse geocoding carries language=$lang', () async {
        final urls = <Uri>[];
        final c = PlacesClient(
            apiKey: 'K',
            language: lang,
            client: MockClient((req) async {
              urls.add(req.url);
              return http.Response(jsonEncode({'status': 'OK', 'results': []}), 200);
            }));
        await c.reverseGeocode(-4.3, 15.3);
        expect(urls.single.queryParameters['language'], lang);
      });

      testWidgets('the address form\'s picker asks Google with language=$lang', (t) async {
        serve(resolve: (_) => resolved(['p-kin', 'c-kin', 'd-luk', 'm-gombe']));
        gapTallViewport(t);
        await Strings.setLang(lang, persist: false);
        MapsConfig.debugEnabledOverride = true;
        // No client is passed in: the picker builds its own, in Strings.current's language. Its HTTP goes to the mock.
        await http.runWithClient(() async {
          await t.pumpWidget(gapApp(AddressFormScreen(locale: Locale(lang), mapBuilder: _fakeMap), lang: lang));
          await t.pump();
          await t.pump();
          await t.tap(find.byKey(const ValueKey('pick-location')));
          await t.pumpAndSettle();
        }, _google);
        expect(_googleUrls.where((u) => u.path.contains('geocode')), isNotEmpty);
        expect(_googleUrls.where((u) => u.path.contains('geocode')).every((u) => u.queryParameters['language'] == lang), isTrue);
      });
    }
  });
}

String textFieldValue(WidgetTester t, int i) => t.widget<TextField>(find.byType(TextField).at(i)).controller!.text;
