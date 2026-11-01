// Delivery areas: the models (and old payloads without area fields), the not-served notice, the French server errors
// and the area selection logic.
import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/l10n/server_errors.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/services/area_selection.dart';
import 'package:lipcart/services/auth_service.dart';
import 'package:lipcart/services/delivery_quote.dart';
import 'package:lipcart/services/geo_models.dart';
import 'package:lipcart/services/models.dart';

import 'areas_helpers.dart';
import 'gap_helpers.dart';

AddressDto _addressIn(List<String> ids, {bool? served = true}) => AddressDto.fromJson({
      'id': 'a1',
      'label': 'Home',
      'line1': '12 Avenue de la Paix',
      'city': 'Kinshasa',
      'commune': 'Gombe',
      'areaId': ids.last,
      'areaChain': chainOf(ids),
      if (served != null) 'served': served,
    });

void main() {
  const fr = Strings('fr'), en = Strings('en');

  group('AreaDto', () {
    test('shows the English name in English and the official name in French; English falls back to French', () {
      final nk = areaOf('p-nk');
      expect(nk.nameFor('en'), 'North Kivu');
      expect(nk.nameFor('fr'), 'Nord-Kivu');
      final kin = areaOf('p-kin');
      expect(kin.nameFor('en'), 'Kinshasa', reason: 'no English name: the official one');
      expect(kin.nameFor('fr'), 'Kinshasa');
    });

    test('an area is found by any of its names, ignoring accents, case, hyphens and spaces', () {
      final nk = areaOf('p-nk');
      expect(nk.isCalled('NORD KIVU'), isTrue);
      expect(nk.isCalled('north-kivu'), isTrue);
      expect(nk.isCalled('Goma'), isFalse);
      expect(AreaDto.fromJson({'id': '1', 'name': 'N’djili', 'aliases': ['Ndjili']}).isCalled('N\'djili'), isTrue);
      expect(AreaDto.fromJson({'id': '1', 'name': 'Équateur', 'nameEn': 'Equateur'}).isCalled('equateur'), isTrue);
    });

    test('an area is offered in a picker when it is served, or something inside it is', () {
      expect(areaOf('p-kin').selectable, isTrue);
      expect(areaOf('p-nk').selectable, isFalse);
      expect(AreaDto.fromJson(area('p-hk', 'province', 'Haut-Katanga', served: false, partiallyServed: true, childCount: 3)).selectable, isTrue);
    });

    test('a payload with only some fields still reads', () {
      final a = AreaDto.fromJson({'id': 'x', 'name': 'Gombe'});
      expect((a.served, a.childCount, a.nameFor('en'), a.googleName), (false, 0, 'Gombe', 'Gombe'));
      expect(a.aliases, isEmpty);
    });
  });

  group('addresses from older servers', () {
    test('no area fields: not served is unknown, shown as served; the line is the stored text', () {
      final a = AddressDto.fromJson({'id': '1', 'label': 'Home', 'line1': '12 Rue X', 'city': 'Kinshasa', 'commune': 'Gombe'});
      expect((a.areaId, a.served, a.notServed), (null, null, false));
      expect(a.areaChain, isEmpty);
      expect(a.oneLineIn('en'), a.oneLine);
      expect(a.oneLineIn('fr'), '12 Rue X, Gombe, Kinshasa');
      expect(a.areaNameIn('fr'), 'Gombe');
    });

    test('with the chain the line names the areas in the language of the app', () {
      final a = AddressDto.fromJson({
        'id': '1',
        'label': 'Home',
        'line1': '12 Rue X',
        'city': 'Goma',
        'areaId': 'c-goma',
        'areaChain': chainOf(['p-nk', 'c-goma']),
        'served': false,
      });
      expect(a.notServed, isTrue);
      expect(a.areaChain.map((e) => e.id), ['cd', 'p-nk', 'c-goma']);
      expect(a.oneLineIn('en'), '12 Rue X, Goma');
      expect(a.areaAt(AreaLevel.province)!.nameFor('en'), 'North Kivu');
      expect(a.areaNameIn('fr'), 'Goma');
    });

    test('an address in Gombe is named by its commune and city', () {
      final a = _addressIn(['p-kin', 'c-kin', 'd-luk', 'm-gombe']);
      expect(a.oneLineIn('fr'), '12 Avenue de la Paix, Gombe, Kinshasa');
      expect(a.notServed, isFalse);
    });
  });

  group('the account language in the payloads', () {
    test('a user without a language is not an English user', () {
      expect(BackendUser.fromJson({'id': 'u', 'email': 'a@b.c', 'name': 'A'}).locale, isNull);
      expect(BackendUser.fromJson({'id': 'u', 'locale': 'xx'}).locale, isNull);
      expect(BackendUser.fromJson({'id': 'u', 'locale': 'fr'}).locale, 'fr');
      expect(BackendUser.fromJson({'id': 'u', 'locale': 'en'}).locale, 'en');
    });

    test('a sign-in answer without a language leaves the user language unknown', () {
      final r = AuthResult.fromJson({
        'user': {'id': 'u', 'email': 'a@b.c', 'name': 'A', 'role': 'customer'},
        'accessToken': 'a',
        'refreshToken': 'r',
      });
      expect(r.user.locale, isNull);
    });
  });

  group('delivery quote', () {
    test('an older quote (no area fields) is served and has no origins', () {
      final q = DeliveryQuote.fromJson(gapQuoteJson());
      expect((q.served, q.destinationArea), (true, null));
      expect(q.origins, isEmpty);
      expect(q.destinationHubName, 'Kinshasa Hub');
    });

    test('the new fields are read', () {
      final q = DeliveryQuote.fromJson({
        ...gapQuoteJson(),
        'served': true,
        'destinationArea': area('m-limete', 'commune', 'Limete'),
        'destinationHubName': 'Entrepôt Limete',
        'origins': [
          {'sellerId': 's1', 'hubId': 'hub-kin', 'hubName': 'Entrepôt Kinshasa', 'areaName': 'Gombe'},
        ],
      });
      expect(q.destinationArea!.name, 'Limete');
      expect(q.destinationHubName, 'Entrepôt Limete');
      expect(q.origins.single.hubName, 'Entrepôt Kinshasa');
      expect(DeliveryQuote.fromJson({...gapQuoteJson(), 'served': false}).served, isFalse);
    });
  });

  group('the not-served notice from a message-only refusal (older servers)', () {
    NotServed? refusal(String msg) => notServedOf(ApiException(msg));

    test('the server\'s refusal is recognised, with or without a typographic apostrophe', () {
      expect(refusal('We don\'t deliver to Lubumbashi yet.')!.areaName, 'Lubumbashi');
      expect(refusal('We don’t deliver to North Kivu yet.')!.areaName, 'North Kivu');
      expect(refusal('We don\'t deliver to Lubumbashi yet.')!.structured, isFalse);
      expect(refusal('Order not found.'), isNull);
      expect(notServedOf(StateError('x')), isNull);
      expect(notServedOf(null), isNull);
    });

    test('"this area" is the server\'s word for an area it could not name: there is no name', () {
      final r = refusal('We don\'t deliver to this area yet.')!;
      expect((r.areaName, r.areaNameEn), (null, null));
    });

    test('it is worded in the user\'s language, naming the area in that language', () {
      final a = _addressIn(['p-nk', 'c-goma'], served: false);
      // The server named the province in French: an English user reads it in English.
      expect(notServedText(en, address: a, refusal: refusal('We don\'t deliver to Nord-Kivu yet.'))!.headline, 'We don’t deliver to North Kivu yet.');
      expect(notServedText(fr, address: a, refusal: refusal('We don\'t deliver to North Kivu yet.'))!.headline, 'Nous ne livrons pas encore à Nord-Kivu.');
      // An area the address does not have is quoted as the server wrote it.
      expect(notServedText(fr, address: a, refusal: refusal('We don\'t deliver to Lubumbashi yet.'))!.headline, 'Nous ne livrons pas encore à Lubumbashi.');
      // No server text yet: the address's own most specific area.
      expect(notServedText(en, address: a)!.headline, 'We don’t deliver to Goma yet.');
      expect(notServedText(en), isNull);
    });

    test('an area the server could not name falls back to the address\'s own area, else to a general sentence', () {
      final a = _addressIn(['p-nk', 'c-goma'], served: false);
      final unnamed = refusal('We don\'t deliver to this area yet.');
      expect(notServedText(en, address: a, refusal: unnamed)!.headline, 'We don’t deliver to Goma yet.');
      expect(notServedText(fr, refusal: unnamed)!.headline, fr.areaNotServedGeneric);
    });

    test('a served address, or a served quote, has no notice; a stale address flag is ignored once the quote answered', () {
      expect(notServedText(en, address: _addressIn(['p-kin', 'c-kin', 'd-luk', 'm-gombe'])), isNull);
      final stale = _addressIn(['p-nk', 'c-goma'], served: false);
      expect(notServedText(en, address: stale, quoteServed: true, useAddressFlag: false), isNull);
      expect(notServedText(en, address: stale, quoteServed: false, useAddressFlag: false), isNotNull);
    });

    test('the cities (read from the geo directory) follow the sentence in the user\'s language', () {
      const cities = [ServedCity(id: 'c1', name: 'Kinshasa'), ServedCity(id: 'c2', name: 'Kongo-Central', nameEn: 'Central Kongo')];
      final t = notServedText(en, refusal: refusal('We don\'t deliver to Goma yet.'), cities: cities)!;
      expect(t.headline, 'We don’t deliver to Goma yet.');
      expect(t.cities, 'We currently deliver in: Kinshasa, Central Kongo');
      expect(t.full, 'We don’t deliver to Goma yet. We currently deliver in: Kinshasa, Central Kongo');
      expect(notServedText(fr, refusal: refusal('We don\'t deliver to Goma yet.'), cities: cities)!.cities, 'Nous livrons actuellement à : Kinshasa, Kongo-Central');
    });
  });

  group('the not-served notice from the structured refusal', () {
    ApiException ack(Map<String, Object?> extra, {String error = 'We don\'t deliver to Nord-Kivu yet.'}) =>
        ApiException.fromAck({'ok': false, 'error': error, 'code': 'not_served', ...extra});

    final structured = ack({
      'areaId': 'p-nk',
      'areaName': 'Nord-Kivu',
      'areaNameEn': 'North Kivu',
      'servedCities': [
        {'id': 'c-kin', 'name': 'Kinshasa', 'nameEn': 'Kinshasa'},
        {'id': 'c-lub', 'name': 'Lubumbashi', 'nameEn': null},
        {'id': 'c-mat', 'name': 'Matadi', 'nameEn': 'Matadi Town'},
      ],
    });

    test('the ack keeps its code and structured fields on the exception', () {
      expect(structured.code, 'not_served');
      expect(structured.message, 'We don\'t deliver to Nord-Kivu yet.');
      expect(structured.details['areaId'], 'p-nk');
      expect(structured.details.containsKey('ok'), isFalse);
      expect(structured.details.containsKey('error'), isFalse);
      expect(structured.details.containsKey('code'), isFalse);
      expect(ApiException('plain').code, isNull);
      expect(ApiException('plain').details, isEmpty);
      expect(ApiException.fromAck({'ok': false}).localKey, 'err_generic');
    });

    test('the refusal carries both names, the area id and the served cities', () {
      final r = notServedOf(structured)!;
      expect((r.areaId, r.areaName, r.areaNameEn, r.structured), ('p-nk', 'Nord-Kivu', 'North Kivu', true));
      expect(r.servedCities.map((c) => c.name), ['Kinshasa', 'Lubumbashi', 'Matadi']);
      expect(r.servedCities.map((c) => c.nameFor('en')), ['Kinshasa', 'Lubumbashi', 'Matadi Town']);
      expect(r.nameFor('en'), 'North Kivu');
      expect(r.nameFor('fr'), 'Nord-Kivu');
    });

    test('English reads the English names, French the official ones, with no lookup in the address', () {
      // The address says nothing about Nord-Kivu: the names come from the refusal.
      final a = _addressIn(['p-kin', 'c-kin', 'd-luk', 'm-gombe']);
      final r = notServedOf(structured);
      final enText = notServedText(en, address: a, refusal: r)!;
      expect(enText.headline, 'We don’t deliver to North Kivu yet.');
      expect(enText.cities, 'We currently deliver in: Kinshasa, Lubumbashi, Matadi Town');
      final frText = notServedText(fr, address: a, refusal: r)!;
      expect(frText.headline, 'Nous ne livrons pas encore à Nord-Kivu.');
      expect(frText.cities, 'Nous livrons actuellement à : Kinshasa, Lubumbashi, Matadi');
    });

    test('the structured names win over the address chain (no area-chain rewrite)', () {
      // An address whose chain calls the same area something else: the server\'s names are shown as sent.
      final a = _addressIn(['p-nk', 'c-goma'], served: false);
      final r = notServedOf(ack({'areaId': 'p-nk', 'areaName': 'Nord-Kivu', 'areaNameEn': 'Kivu North'}));
      expect(notServedText(en, address: a, refusal: r)!.headline, 'We don’t deliver to Kivu North yet.');
    });

    test('an area with no English name is shown with its official name in English', () {
      final r = notServedOf(ack({'areaId': 'c-goma', 'areaName': 'Goma', 'areaNameEn': null}, error: 'We don\'t deliver to Goma yet.'));
      expect(notServedText(en, refusal: r)!.headline, 'We don’t deliver to Goma yet.');
    });

    test('nothing matched: no name, the address\'s own area or the general sentence; the cities still come', () {
      final r = notServedOf(ack({
        'areaId': null,
        'areaName': null,
        'areaNameEn': null,
        'servedCities': [{'id': 'c-kin', 'name': 'Kinshasa'}],
      }, error: 'We don\'t deliver to this area yet.'));
      expect(r!.areaName, isNull);
      expect(notServedText(en, refusal: r)!.headline, en.areaNotServedGeneric);
      expect(notServedText(en, address: _addressIn(['p-nk', 'c-goma'], served: false), refusal: r)!.headline, 'We don’t deliver to Goma yet.');
      expect(notServedText(fr, refusal: r)!.cities, 'Nous livrons actuellement à : Kinshasa');
    });

    test('a refusal that lists no city has no cities line; its own list wins over the directory\'s', () {
      final bare = notServedOf(ack({'areaId': 'p-nk', 'areaName': 'Nord-Kivu', 'areaNameEn': 'North Kivu', 'servedCities': <dynamic>[]}));
      expect(notServedText(en, refusal: bare)!.cities, isNull);
      const dir = [ServedCity(id: 'x', name: 'Boma')];
      expect(notServedText(en, refusal: bare, cities: dir)!.cities, 'We currently deliver in: Boma');
      expect(notServedText(en, refusal: notServedOf(structured), cities: dir)!.cities, isNot(contains('Boma')));
    });

    test('a long list is cut with "+N more"', () {
      final many = notServedOf(ack({
        'areaName': 'Goma',
        'servedCities': [for (var i = 1; i <= 9; i++) {'id': 'c$i', 'name': 'Ville $i'}],
      }, error: 'We don\'t deliver to Goma yet.'));
      expect(notServedText(en, refusal: many)!.cities, 'We currently deliver in: Ville 1, Ville 2, Ville 3, Ville 4, Ville 5, Ville 6, +3 more');
      expect(notServedText(fr, refusal: many)!.cities, endsWith('+3 autres'));
    });

    test('odd payloads are read safely', () {
      expect(ServedCity.listFrom('x'), isEmpty);
      expect(ServedCity.listFrom([1, null, {'id': 'a'}, {'id': 'b', 'name': ' '}, {'id': 'c', 'name': 'Boma'}]).map((c) => c.id), ['c']);
      final r = notServedOf(ApiException.fromAck({'ok': false, 'error': 'We don\'t deliver to Goma yet.', 'code': 'not_served', 'servedCities': 'nope', 'areaName': 7}));
      expect(r!.servedCities, isEmpty);
      expect(r.areaName, 'Goma', reason: 'an unusable field falls back to the area the message names');
    });

    test('a coded refusal is recognised even when the message differs', () {
      final r = notServedOf(ApiException.fromAck({'ok': false, 'error': 'Livraison indisponible.', 'code': 'not_served', 'areaName': 'Goma'}));
      expect(r!.areaName, 'Goma');
      expect(notServedOf(ApiException.fromAck({'ok': false, 'error': 'Order not found.', 'code': 'order_missing'})), isNull);
    });
  });

  group('contract errors in French', () {
    test('every error of docs/contracts/areas.md has a French text', () {
      const known = {
        'Choose where this warehouse is.': 'Choisissez l’emplacement de cet entrepôt.',
        'Area not found.': 'Zone introuvable.',
        'A warehouse cannot cover an area it is not allowed to serve.': 'Un entrepôt ne peut pas couvrir une zone qu’il n’est pas autorisé à desservir.',
        'Your pickup area is not served yet. You can prepare your store; sales open when we deliver there.':
            'Votre zone de ramassage n’est pas encore desservie. Vous pouvez préparer votre boutique ; les ventes ouvriront dès que nous livrerons dans cette zone.',
      };
      known.forEach((k, v) => expect(translateServerError(k, fr), v, reason: k));
      expect(translateServerError('This area is already covered by Entrepôt Limete.', fr), 'Cette zone est déjà couverte par Entrepôt Limete.');
      expect(translateServerError('We don\'t deliver to Lubumbashi yet.', fr), 'Nous ne livrons pas encore à Lubumbashi.');
      expect(translateServerError('We don\'t deliver to Lubumbashi yet.', en), 'We don\'t deliver to Lubumbashi yet.', reason: 'English as written');
    });

    test('an ApiException prints them in the current language', () async {
      await Strings.setLang('fr', persist: false);
      expect(ApiException('We don\'t deliver to Goma yet.').toString(), 'Nous ne livrons pas encore à Goma.');
      await Strings.setLang('en', persist: false);
      expect(ApiException('We don\'t deliver to Goma yet.').toString(), 'We don\'t deliver to Goma yet.');
    });
  });

  group('AreaSelection', () {
    test('a resolution fills province, city, commune and the hidden district; the deepest is the area id', () {
      final sel = AreaSelection()..setResolution(AreaResolution.fromJson(resolved(['p-kin', 'c-kin', 'd-luk', 'm-gombe', 'q-bat'])));
      expect((sel.province!.id, sel.city!.id, sel.commune!.id, sel.quartier!.id), ('p-kin', 'c-kin', 'm-gombe', 'q-bat'));
      expect(sel.areaId, 'q-bat');
      expect(sel.fromPin, isTrue);
      expect(sel.hubName, 'Entrepôt Kinshasa');
      expect(sel.notServed, isFalse);
    });

    test('choosing a level clears the ones below it and forgets the pin match', () {
      final sel = AreaSelection()..setResolution(AreaResolution.fromJson(resolved(['p-kin', 'c-kin', 'd-luk', 'm-gombe'])));
      sel.choose(areaOf('m-limete'), district: areaOf('d-mon'));
      expect((sel.commune!.id, sel.district!.id, sel.quartier), ('m-limete', 'd-mon', null));
      expect(sel.fromPin, isFalse);
      expect(sel.hubName, 'Entrepôt Limete', reason: 'the area\'s own warehouse once the pin match is gone');
      sel.choose(areaOf('p-nk'));
      expect((sel.province!.id, sel.city, sel.commune, sel.areaId), ('p-nk', null, null, 'p-nk'));
    });

    test('an unserved area is flagged, a pin match is trusted over the area flag', () {
      final sel = AreaSelection()..setResolution(AreaResolution.fromJson(resolved(['p-nk', 'c-goma'], served: false)));
      expect(sel.notServed, isTrue);
      expect(sel.hubName, isNull);
      expect(AreaSelection().notServed, isFalse, reason: 'nothing chosen yet');
    });

    test('a resolution that found nothing', () {
      final r = AreaResolution.fromJson(kNoMatch);
      expect(r.found, isFalse);
      expect(r.chain, isEmpty);
      expect(AreaResolution.fromJson('nope').found, isFalse);
      expect(AreaResolution.fromJson(<dynamic>[]).found, isFalse);
    });
  });
}
