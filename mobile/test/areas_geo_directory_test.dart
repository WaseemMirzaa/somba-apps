// The geography the pickers read: the communes of a city in ONE call (`geo:communes`, each commune with its district)
// with the old per-district calls as the fallback for a server that rejects the event; partly served areas
// (`partiallyServed`) are selectable; the served cities (`geo:servedCities`) for the not-served notice.
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/more/area_picker.dart';
import 'package:lipcart/screens/more/support_extra.dart';
import 'package:lipcart/services/area_selection.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/geo_directory.dart';
import 'package:lipcart/services/geo_models.dart';
import 'package:lipcart/services/realtime_store.dart';

import 'areas_helpers.dart';
import 'gap_helpers.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  final dir = GeoDirectory.instance;
  final log = <String>[];

  setUp(() async {
    await gapReset();
    resetGeo();
    log.clear();
  });
  tearDown(() {
    GeoDirectory.eventProbeTimeout = const Duration(seconds: 4);
    resetGeo();
    gapTearDown();
  });

  List<String> names(List<CommuneOption> l) => [for (final c in l) c.area.id];
  List<String?> groups(List<CommuneOption> l) => [for (final c in l) c.district?.id];

  group('the communes of a city in one call', () {
    test('geo:communes { cityId } is the only request, and the district grouping comes from each commune\'s own district', () async {
      RealtimeStore.instance.debugCallRequest = areaCalls(log: log);
      final out = await dir.communesOf(areaOf('c-kin'));
      expect(log, ['geo:communes:c-kin'], reason: 'no geo:children for the city and its four districts');
      // the server lists them by name (Gombe, Limete, Matete, Ngaliema): the districts are interleaved; the picker gets them grouped
      expect(names(out), ['m-gombe', 'm-ngal', 'm-limete', 'm-matete']);
      expect(groups(out), ['d-luk', 'd-luk', 'd-mon', 'd-mon']);
      expect(out.first.district!.name, 'Lukunga');
      expect(out.first.area.parentId, 'd-luk');
    });

    test('the answer is cached per city; a geography change drops it', () async {
      RealtimeStore.instance.debugCallRequest = areaCalls(log: log);
      final city = areaOf('c-kin');
      await dir.communesOf(city);
      await dir.communesOf(city);
      expect(log, hasLength(1));
      expect(dir.cachedCommunes(city), isNotNull);
      RealtimeStore.instance.debugEmit('geo:updated', area('m-gombe', 'commune', 'Gombe'));
      expect(dir.cachedCommunes(city), isNull);
      await dir.communesOf(city);
      expect(log, hasLength(2));
    });

    test('two callers at once share the one request', () async {
      RealtimeStore.instance.debugCallRequest = areaCalls(log: log);
      final city = areaOf('c-kin');
      final both = await Future.wait([dir.communesOf(city), dir.communesOf(city)]);
      expect(log, hasLength(1));
      expect(names(both[0]), names(both[1]));
    });

    test('a city without districts lists its communes with no district; inactive communes are left out', () async {
      final geo = {
        'c-lub': [
          area('m-kat', 'commune', 'Katuba', parentId: 'c-lub'),
          {...area('m-old', 'commune', 'Ancienne', parentId: 'c-lub'), 'active': false},
          area('m-ken', 'commune', 'Kenya', parentId: 'c-lub'),
        ],
      };
      RealtimeStore.instance.debugCallRequest = areaCalls(geo: geo, log: log);
      final out = await dir.communesOf(AreaDto.fromJson(area('c-lub', 'city', 'Lubumbashi', childCount: 3)));
      expect(names(out), ['m-kat', 'm-ken']);
      expect(groups(out), [null, null]);
    });

    test('groups are ordered served first, then by name; the order inside a group is the server\'s', () {
      final served = areaOf('d-luk'), unserved = AreaDto.fromJson(area('d-aaa', 'district', 'Aaa', served: false));
      CommuneOption c(String id, AreaDto? d) => (area: AreaDto.fromJson(area(id, 'commune', id)), district: d);
      final out = groupByDistrict([c('x1', unserved), c('x2', served), c('x3', null), c('x4', served), c('x5', unserved)]);
      expect(names(out), ['x3', 'x2', 'x4', 'x1', 'x5']);
    });

    test('an answer that is not a list of communes is not trusted', () {
      expect(communesFrom('nope'), isNull);
      expect(communesFrom([area('d-luk', 'district', 'Lukunga')]), isNull, reason: 'districts only: an older server ignoring the event');
      expect(communesFrom(<dynamic>[]), isEmpty);
      expect(communesFrom([1, null, area('m-a', 'commune', 'A')])!.map((c) => c.area.id), ['m-a']);
    });
  });

  group('a server that rejects geo:communes (older server)', () {
    test('falls back to the city\'s children and each district\'s: the same grouped list', () async {
      RealtimeStore.instance.debugCallRequest = areaCalls(bulkCommunes: false, log: log);
      final out = await dir.communesOf(areaOf('c-kin'));
      expect(log, ['geo:communes:c-kin', 'geo:children:c-kin', 'geo:children:d-luk', 'geo:children:d-mon']);
      expect(names(out), ['m-gombe', 'm-ngal', 'm-limete', 'm-matete']);
      expect(groups(out), ['d-luk', 'd-luk', 'd-mon', 'd-mon']);
    });

    test('the rejection is remembered: the event is not asked again until a new session', () async {
      RealtimeStore.instance.debugCallRequest = areaCalls(bulkCommunes: false, log: log);
      await dir.communesOf(areaOf('c-kin'));
      dir.invalidate();
      log.clear();
      await dir.communesOf(areaOf('c-kin'));
      expect(log, isNot(contains('geo:communes:c-kin')));
      dir.hook.reset!();
      log.clear();
      await dir.communesOf(areaOf('c-kin'));
      expect(log.first, 'geo:communes:c-kin', reason: 'a new session meets a possibly newer server');
    });

    test('a server that never answers it costs one timeout, then the old way; the event is tried again next time', () async {
      GeoDirectory.eventProbeTimeout = const Duration(milliseconds: 30);
      final base = areaCalls(log: log);
      RealtimeStore.instance.debugCallRequest = (event, [body]) => event == 'geo:communes' ? Completer<dynamic>().future : base(event, body);
      final out = await dir.communesOf(areaOf('c-kin'));
      expect(names(out), ['m-gombe', 'm-ngal', 'm-limete', 'm-matete']);
      expect(log, contains('geo:children:d-mon'));
      dir.invalidate();
      log.clear();
      RealtimeStore.instance.debugCallRequest = areaCalls(log: log);
      await dir.communesOf(areaOf('c-kin'));
      expect(log, ['geo:communes:c-kin'], reason: 'a slow answer does not switch the new event off');
    });

    test('an answer made of districts (the event ignored) is read the old way', () async {
      final base = areaCalls(log: log, bulkCommunes: false);
      RealtimeStore.instance.debugCallRequest = (event, [body]) => event == 'geo:communes' ? Future.value(kGeo['c-kin']) : base(event, body);
      final out = await dir.communesOf(areaOf('c-kin'));
      expect(names(out), ['m-gombe', 'm-ngal', 'm-limete', 'm-matete']);
    });

    test('a city with areas below it that answers no commune (quartiers under the city) is read the old way', () async {
      final geo = {
        'c-x': [area('q-1', 'quartier', 'Q1', parentId: 'c-x'), area('q-2', 'quartier', 'Q2', parentId: 'c-x')],
      };
      RealtimeStore.instance.debugCallRequest = areaCalls(geo: geo, log: log);
      final out = await dir.communesOf(AreaDto.fromJson(area('c-x', 'city', 'Xville', childCount: 2)));
      expect(names(out), ['q-1', 'q-2']);
      expect(log, ['geo:communes:c-x', 'geo:children:c-x']);
      // but a city with nothing below it just has none
      log.clear();
      expect(await dir.communesOf(AreaDto.fromJson(area('c-empty', 'city', 'Vide'))), isEmpty);
      expect(log, ['geo:communes:c-empty']);
    });

    test('offline fails the same way as before: the error reaches the picker', () async {
      RealtimeStore.instance.debugCallRequest = (event, [body]) async => throw ApiException.local('err_no_connection');
      await expectLater(dir.communesOf(areaOf('c-kin')), throwsA(isA<ApiException>()));
      expect(dir.cachedCommunes(areaOf('c-kin')), isNull);
    });
  });

  group('partly served areas', () {
    final hk = area('p-hk', 'province', 'Haut-Katanga', nameEn: 'Upper Katanga', served: false, partiallyServed: true, childCount: 2);
    final geo = {
      '': [area('p-kin', 'province', 'Kinshasa', childCount: 1), hk, area('p-nk', 'province', 'Nord-Kivu', nameEn: 'North Kivu', served: false, childCount: 1)],
      'p-hk': [
        area('c-lub', 'city', 'Lubumbashi', parentId: 'p-hk', served: true),
        area('c-lik', 'city', 'Likasi', parentId: 'p-hk', served: false),
      ],
      'p-kin': [area('c-kin', 'city', 'Kinshasa', parentId: 'p-kin')],
      'p-nk': [area('c-goma', 'city', 'Goma', parentId: 'p-nk', served: false)],
    };

    test('the field is read, and is false when the server does not send it', () {
      expect(AreaDto.fromJson(hk).partiallyServed, isTrue);
      expect(AreaDto.fromJson(area('p-x', 'province', 'X', served: false)).partiallyServed, isFalse);
      expect(AreaDto.fromJson({'id': 'x', 'name': 'X'}).partiallyServed, isFalse);
      expect(AreaDto.fromJson({'id': 'x', 'name': 'X', 'partiallyServed': 'yes'}).partiallyServed, isFalse, reason: 'only true counts');
    });

    test('a partly served area is selectable; an unserved one is not; a served one is', () {
      expect(AreaDto.fromJson(hk).selectable, isTrue);
      expect(AreaDto.fromJson(geo['']![2]).selectable, isFalse);
      expect(AreaDto.fromJson(geo['']![0]).selectable, isTrue);
    });

    test('choosing one is neither "served" nor "not served" yet: the user narrows it down', () {
      final sel = AreaSelection()..choose(AreaDto.fromJson(hk));
      expect((sel.notServed, sel.needsMoreDetail), (false, true));
      sel.choose(AreaDto.fromJson(geo['p-hk']![0]));
      expect((sel.notServed, sel.needsMoreDetail), (false, false), reason: 'Lubumbashi is served');
      sel.choose(AreaDto.fromJson(geo['p-hk']![1]));
      expect((sel.notServed, sel.needsMoreDetail), (true, false), reason: 'Likasi is not');
      expect((AreaSelection()..choose(AreaDto.fromJson(geo['']![2]))).notServed, isTrue);
    });

    test('a pin that lands on a partly served province is not reported as not served', () {
      final r = AreaResolution.fromJson({'area': hk, 'chain': [hk], 'served': false, 'hubId': null, 'hubName': null, 'matchedBy': 'text'});
      final sel = AreaSelection()..setResolution(r);
      expect((sel.notServed, sel.needsMoreDetail), (false, true));
    });

    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);

      testWidgets('the sheet lists a partly served province as a normal row and an unserved one as "coming soon" ($lang)', (t) async {
        gapTallViewport(t);
        await Strings.setLang(lang, persist: false);
        AreaDto? picked;
        await t.pumpWidget(gapApp(
          Builder(
            builder: (c) => TextButton(
              onPressed: () async => picked = (await showAreaSheet(c, level: AreaLevel.province, options: [for (final a in geo['']!) (area: AreaDto.fromJson(a), group: null)]))?.area,
              child: const Text('open'),
            ),
          ),
          lang: lang,
        ));
        await t.tap(find.text('open'));
        await t.pumpAndSettle();
        expect(find.byKey(const ValueKey('area-soon-p-hk')), findsNothing, reason: 'partly served: not "coming soon"');
        expect(find.byKey(const ValueKey('area-soon-p-kin')), findsNothing);
        expect(find.byKey(const ValueKey('area-soon-p-nk')), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('area-soon-p-nk')), matching: find.text(s.areaComingSoon)), findsOneWidget);
        expect(find.text(lang == 'en' ? 'Upper Katanga' : 'Haut-Katanga'), findsOneWidget);
        await t.tap(find.byKey(const ValueKey('area-option-p-nk')));
        await t.pumpAndSettle();
        expect(picked, isNull, reason: 'a coming-soon row cannot be chosen');
        expect(find.byType(AreaSheet), findsOneWidget);
        await t.tap(find.byKey(const ValueKey('area-option-p-hk')));
        await t.pumpAndSettle();
        expect(picked?.id, 'p-hk');
      });

      testWidgets('the address form: a partly served province is picked, its cities follow, and a hint (not a refusal) asks for more ($lang)', (t) async {
        RealtimeStore.instance.debugCallRequest = areaCalls(geo: geo);
        gapTallViewport(t);
        await Strings.setLang(lang, persist: false);
        await t.pumpWidget(gapApp(AddressFormScreen(locale: Locale(lang)), lang: lang));
        await t.pump();
        await t.pump();
        await t.tap(find.byKey(const ValueKey('area-field-province')));
        await t.pumpAndSettle();
        await t.tap(find.byKey(const ValueKey('area-option-p-hk')));
        await t.pumpAndSettle();
        expect(find.descendant(of: find.byKey(const ValueKey('area-field-province')), matching: find.text(lang == 'en' ? 'Upper Katanga' : 'Haut-Katanga')), findsOneWidget);
        expect(find.byKey(const ValueKey('area-not-served')), findsNothing);
        expect(find.byKey(const ValueKey('area-partial')), findsOneWidget);
        expect(find.text(s.areaPartialHint(lang == 'en' ? 'Upper Katanga' : 'Haut-Katanga')), findsOneWidget);
        // two cities: nothing is chosen for you; Lubumbashi is served, Likasi is "coming soon"
        await t.tap(find.byKey(const ValueKey('area-field-city')));
        await t.pumpAndSettle();
        expect(find.byKey(const ValueKey('area-soon-c-lik')), findsOneWidget);
        expect(find.byKey(const ValueKey('area-soon-c-lub')), findsNothing);
        await t.tap(find.byKey(const ValueKey('area-option-c-lub')));
        await t.pumpAndSettle();
        expect(find.byKey(const ValueKey('area-partial')), findsNothing);
        expect(find.byKey(const ValueKey('area-not-served')), findsNothing);
      });
    }
  });

  group('the served cities', () {
    const rows = [
      {'id': 'c-kin', 'name': 'Kinshasa', 'nameEn': null, 'level': 'city'},
      {'id': 'c-lub', 'name': 'Lubumbashi', 'nameEn': 'Lubumbashi', 'level': 'city'},
      {'id': 'c-kw', 'name': 'Kikwit', 'nameEn': 'Kikwit Town', 'level': 'city'},
    ];

    test('geo:servedCities, in both languages, cached', () async {
      RealtimeStore.instance.debugCallRequest = areaCalls(servedCities: [...rows], log: log);
      final out = await dir.servedCities();
      expect(out.map((c) => c.name), ['Kinshasa', 'Lubumbashi', 'Kikwit']);
      expect(out.map((c) => c.nameFor('en')), ['Kinshasa', 'Lubumbashi', 'Kikwit Town']);
      expect(out.map((c) => c.nameFor('fr')), ['Kinshasa', 'Lubumbashi', 'Kikwit']);
      await dir.servedCities();
      expect(log, ['geo:servedCities']);
      expect(dir.cachedServedCities, hasLength(3));
      dir.invalidate();
      expect(dir.cachedServedCities, isNull);
    });

    test('a server without the event: the cities of the served and partly served provinces that are served or partly served', () async {
      final geo = {
        '': [
          area('p-kin', 'province', 'Kinshasa', childCount: 1),
          area('p-hk', 'province', 'Haut-Katanga', served: false, partiallyServed: true, childCount: 2),
          area('p-nk', 'province', 'Nord-Kivu', nameEn: 'North Kivu', served: false, childCount: 1),
        ],
        'p-kin': [area('c-kin', 'city', 'Kinshasa', parentId: 'p-kin')],
        'p-hk': [area('c-lub', 'city', 'Lubumbashi', parentId: 'p-hk'), area('c-lik', 'city', 'Likasi', parentId: 'p-hk', served: false)],
        'p-nk': [area('c-goma', 'city', 'Goma', parentId: 'p-nk', served: false)],
      };
      RealtimeStore.instance.debugCallRequest = areaCalls(geo: geo, servedCities: null, log: log);
      final out = await dir.servedCities();
      expect(out.map((c) => c.name), ['Kinshasa', 'Lubumbashi']);
      expect(log, isNot(contains('geo:children:p-nk')), reason: 'an unserved province is not walked');
    });

    test('nobody served: an empty list, not an error', () async {
      RealtimeStore.instance.debugCallRequest = areaCalls(servedCities: [], log: log);
      expect(await dir.servedCities(), isEmpty);
    });

    test('a failure with the socket down is thrown (the notice just goes without the list)', () async {
      RealtimeStore.instance.debugCallRequest = (event, [body]) async => throw ApiException.local('err_no_connection');
      await expectLater(dir.servedCities(), throwsA(isA<ApiException>()));
    });
  });
}
