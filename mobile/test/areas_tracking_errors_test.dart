// The rest of the final areas API on the app: the socket keeps the structured fields of a refusal, the customer's tracking
// legs (flat warehouse names, hop / hops, runReference, riderFirstName, with the old nested shape as the fallback) and the
// French texts of every error of docs/contracts/areas.md.
import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/server_errors.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/more/order_screens.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/delivery_quote.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/services/socket_service.dart';
import 'package:lipcart/util/journey.dart';

import 'gap_helpers.dart';

Future<Object?> _settle(dynamic ack) async {
  final c = Completer<dynamic>();
  SocketService.settleAck(c, ack);
  try {
    return await c.future;
  } catch (e) {
    return e;
  }
}

const _pickup = {'kind': 'pickup', 'status': 'delivered', 'pickedUpAt': '2026-10-24T08:00:00Z', 'receivedAt': '2026-10-24T09:00:00Z'};

/// A transfer leg as the final contract sends it: flat names, hop / hops, the run, the rider's first name.
Map<String, dynamic> _flatLeg({
  int hop = 1,
  int hops = 2,
  String from = 'Entrepôt Limete',
  String to = 'Entrepôt Kinshasa',
  String status = 'in_transit',
  String? run = 'TR-0042',
  String? rider = 'Jean',
  String pickedUp = '2026-10-24T11:00:00Z',
  String? received,
  bool nested = false,
}) =>
    {
      'kind': 'transfer',
      'status': status,
      'hop': hop,
      'hops': hops,
      if (run != null) ...{'runId': 'run-$run', 'runReference': run},
      'fromHubName': from,
      'toHubName': to,
      if (nested) ...{
        'fromHub': {'id': 'h-$from', 'name': from, 'city': 'Kinshasa'},
        'toHub': {'id': 'h-$to', 'name': to, 'city': 'Kinshasa'},
      },
      if (rider != null) 'riderFirstName': rider,
      'pickedUpAt': pickedUp,
      if (received != null) 'receivedAt': received,
    };

/// The same leg as before the flat fields: the warehouses only as objects.
Map<String, dynamic> _nestedLeg({int hop = 1, int hops = 2, String from = 'Entrepôt Limete', String to = 'Entrepôt Kinshasa', String status = 'in_transit'}) => {
      'kind': 'transfer',
      'status': status,
      'hop': hop,
      'hops': hops,
      'fromHub': {'id': 'h-$from', 'name': from, 'city': 'Kinshasa'},
      'toHub': {'id': 'h-$to', 'name': to, 'city': 'Kinshasa'},
      'pickedUpAt': '2026-10-24T11:00:00Z',
    };

OrderDto _order(List<Map<String, dynamic>> legs, {String status = 'shipped'}) => OrderDto.fromJson({
      'id': 'o1',
      'reference': 'SOM-2077',
      'status': status,
      'paymentMethod': 'wallet',
      'totalUsd': 10,
      'updatedAt': '2026-10-26T09:30:00Z',
      'destinationHubId': 'hub-kikwit',
      'originHubIds': ['hub-limete'],
      'tracking': {'legs': legs},
      'items': [
        {'productId': 'p1', 'productName': 'Item', 'qty': 1, 'priceUsd': 10, 'sellerId': 's1', 'fulfilment': 'received', 'receivedAt': '2026-10-24T09:00:00Z'}
      ],
    });

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  tearDown(gapTearDown);

  group('the socket keeps the structured fields of a refusal', () {
    test('{ ok: false, error, code, ...fields } fails with an ApiException that carries them', () async {
      final e = await _settle({
        'ok': false,
        'error': 'We don\'t deliver to Goma yet.',
        'code': 'not_served',
        'areaId': 'c-goma',
        'areaName': 'Goma',
        'areaNameEn': null,
        'servedCities': [
          {'id': 'c-kin', 'name': 'Kinshasa', 'nameEn': 'Kinshasa'}
        ],
      });
      expect(e, isA<ApiException>());
      final ex = e as ApiException;
      expect((ex.message, ex.code), ('We don\'t deliver to Goma yet.', 'not_served'));
      expect(ex.details.keys, unorderedEquals(['areaId', 'areaName', 'areaNameEn', 'servedCities']));
      final r = notServedOf(ex)!;
      expect((r.structured, r.areaId, r.areaName, r.servedCities.single.name), (true, 'c-goma', 'Goma', 'Kinshasa'));
    });

    test('a plain refusal is a message with no code and no details', () async {
      final ex = await _settle({'ok': false, 'error': 'Order not found.'}) as ApiException;
      expect((ex.message, ex.code), ('Order not found.', null));
      expect(ex.details, isEmpty);
    });

    test('a refusal with no message is the generic failure', () async {
      final ex = await _settle({'ok': false}) as ApiException;
      expect(ex.localKey, 'err_generic');
    });

    test('{ ok: true, data } completes with the data; anything else with the reply itself; a second ack is ignored', () async {
      expect(await _settle({'ok': true, 'data': {'feeUsd': 3}}), {'feeUsd': 3});
      expect(await _settle({'ok': true, 'data': <dynamic>[]}), <dynamic>[]);
      expect(await _settle(<dynamic>[1, 2]), [1, 2]);
      final c = Completer<dynamic>();
      SocketService.settleAck(c, {'ok': true, 'data': 1});
      SocketService.settleAck(c, {'ok': false, 'error': 'late'});
      expect(await c.future, 1);
    });

    test('a coded refusal is shown in French through the same message map', () async {
      await Strings.setLang('fr', persist: false);
      final ex = await _settle({'ok': false, 'error': 'We don\'t deliver to this area yet.', 'code': 'not_served', 'areaName': null}) as ApiException;
      expect(ex.toString(), 'Nous ne livrons pas encore à cette zone.');
      await Strings.setLang('en', persist: false);
      expect(ex.toString(), 'We don\'t deliver to this area yet.');
    });
  });

  group('the customer\'s tracking legs', () {
    test('the flat shape: warehouse names, hop / hops, the run and the rider\'s first name', () {
      final l = OrderLeg.fromJson(_flatLeg(rider: 'Jean-Pierre Mukendi'));
      expect((l.fromHubName, l.toHubName, l.hop, l.hops), ('Entrepôt Limete', 'Entrepôt Kinshasa', 1, 2));
      expect((l.runId, l.runReference), ('run-TR-0042', 'TR-0042'));
      expect(l.driverFirstName, 'Jean-Pierre', reason: 'a first name only, even if the server sent more');
      expect((l.fromHubId, l.toHubId), (null, null), reason: 'the flat contract has names only');
    });

    test('the old shape (the warehouses only as objects) gives the same names and ids, and no run', () {
      final l = OrderLeg.fromJson(_nestedLeg());
      expect((l.fromHubName, l.toHubName, l.fromHubId, l.toHubId), ('Entrepôt Limete', 'Entrepôt Kinshasa', 'h-Entrepôt Limete', 'h-Entrepôt Kinshasa'));
      expect((l.runId, l.runReference, l.driverFirstName), (null, null, null));
    });

    test('with both, the flat names win and the object fills what the flat fields do not carry', () {
      final l = OrderLeg.fromJson({
        ..._flatLeg(from: 'Entrepôt A', to: 'Entrepôt B'),
        'fromHub': {'id': 'h-a', 'name': 'Ancien A'},
        'toHub': {'id': 'h-b', 'name': 'Ancien B'},
      });
      expect((l.fromHubName, l.toHubName), ('Entrepôt A', 'Entrepôt B'));
      expect((l.fromHubId, l.toHubId), ('h-a', 'h-b'));
    });

    test('a leg with none of it (a pickup, an old server) parses with the defaults', () {
      final l = OrderLeg.fromJson({'kind': 'pickup', 'status': 'delivered'});
      expect((l.hop, l.hops, l.fromHubName, l.toHubName, l.runId, l.runReference, l.driverFirstName), (null, null, null, null, null, null, null));
      expect(OrderLeg.fromJson({'kind': 'transfer', 'status': 'x', 'runReference': '  '}).runReference, isNull);
    });

    test('a hop step carries its run, its warehouse and its driver; each hop has its own', () {
      final steps = orderJourney(_order([
        _pickup,
        _flatLeg(status: 'delivered', received: '2026-10-24T15:00:00Z'),
        _flatLeg(hop: 2, from: 'Entrepôt Kinshasa', to: 'Entrepôt Kikwit', run: 'TR-0050', rider: 'Marie', pickedUp: '2026-10-25T07:00:00Z'),
      ]));
      final hops = steps.where((s) => s.key == 'in_transfer').toList();
      expect(hops.map((s) => s.runs), [
        ['TR-0042'],
        ['TR-0050']
      ]);
      expect(hops.map((s) => s.hubNames), [
        ['Entrepôt Kinshasa'],
        ['Entrepôt Kikwit']
      ]);
      expect(hops.map((s) => s.drivers), [
        ['Jean'],
        ['Marie']
      ]);
      expect(steps.firstWhere((s) => s.key == 'at_hub').runs, isEmpty, reason: 'the relay warehouse step is about the place');
    });

    test('a hop split over two runs lists both once; legs of one run list it once; a hop with no run has none', () {
      final steps = orderJourney(_order([
        _pickup,
        _flatLeg(run: 'TR-0042'),
        _flatLeg(run: 'TR-0042'),
        _flatLeg(run: 'TR-0043', rider: 'Awa'),
      ]));
      expect(steps.firstWhere((s) => s.key == 'in_transfer').runs, ['TR-0042', 'TR-0043']);
      final plain = orderJourney(_order([_pickup, _flatLeg(run: null)]));
      expect(plain.firstWhere((s) => s.key == 'in_transfer').runs, isEmpty);
    });

    test('a single transfer (one hop) names its warehouse from the leg, not only from the warehouse directory', () {
      final steps = orderJourney(_order([_pickup, _flatLeg(hops: 1)]));
      final t = steps.firstWhere((s) => s.key == 'in_transfer');
      expect(t.hop, isNull);
      expect(t.hubNames, ['Entrepôt Kinshasa']);
      expect(t.runs, ['TR-0042']);
      expect(t.drivers, ['Jean']);
      expect(t.asCurrent().runs, ['TR-0042'], reason: 'the current step keeps them');
    });

    test('the order payload of the final contract parses its legs', () {
      final o = _order([_pickup, _flatLeg()]);
      expect(o.legs.map((l) => l.kind), ['pickup', 'transfer']);
      expect(o.legs.last.runReference, 'TR-0042');
    });

    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);

      Future<void> open(WidgetTester t, OrderDto o) async {
        await gapReset(lang: lang);
        gapTallViewport(t);
        await Strings.setLang(lang, persist: false);
        RealtimeStore.instance.orders
          ..clear()
          ..add(o);
        await t.pumpWidget(gapApp(OrderTrackingScreen(locale: Locale(lang), orderId: o.id), lang: lang));
        await t.pump(const Duration(milliseconds: 300));
      }

      testWidgets('the tracking shows the run, then the driver and the time, on the hop that left ($lang)', (t) async {
        await open(t, _order([_pickup, _flatLeg()]));
        final left = s.when(DateTime.parse('2026-10-24T11:00:00Z').toLocal());
        expect(find.text('${s.journeyRun('TR-0042')} · ${s.journeyDriver('Jean')} · $left'), findsOneWidget);
        expect(find.text('${lang == 'en' ? 'Run TR-0042' : 'Tournée TR-0042'} · ${lang == 'en' ? 'Driver: Jean' : 'Livreur : Jean'} · $left'), findsOneWidget);
        expect(find.text(s.journeyHopTransfer('Entrepôt Kinshasa')), findsOneWidget);
      });

      testWidgets('two hops: each shows its own run and driver ($lang)', (t) async {
        await open(t, _order([
          _pickup,
          _flatLeg(status: 'delivered', received: '2026-10-24T15:00:00Z'),
          _flatLeg(hop: 2, from: 'Entrepôt Kinshasa', to: 'Entrepôt Kikwit', run: 'TR-0050', rider: 'Marie', pickedUp: '2026-10-25T07:00:00Z'),
        ]));
        expect(find.text('${s.journeyRun('TR-0042')} · ${s.journeyDriver('Jean')} · ${s.when(DateTime.parse('2026-10-24T11:00:00Z').toLocal())}'), findsOneWidget);
        expect(find.text('${s.journeyRun('TR-0050')} · ${s.journeyDriver('Marie')} · ${s.when(DateTime.parse('2026-10-25T07:00:00Z').toLocal())}'), findsOneWidget);
        expect(find.text(s.journeyHopTransfer('Entrepôt Kikwit')), findsOneWidget);
        expect(find.text(s.journeyHopAt('Entrepôt Kinshasa')), findsOneWidget);
      });

      testWidgets('a leg that is not on a run shows no run ($lang)', (t) async {
        await open(t, _order([_pickup, _flatLeg(run: null)]));
        expect(find.textContaining(lang == 'en' ? 'Run ' : 'Tournée '), findsNothing);
        expect(find.text('${s.journeyDriver('Jean')} · ${s.when(DateTime.parse('2026-10-24T11:00:00Z').toLocal())}'), findsOneWidget);
      });

      testWidgets('old payload shape (nested warehouses only) shows the same warehouses, no run, no driver ($lang)', (t) async {
        await open(t, _order([_pickup, _nestedLeg(), _nestedLeg(hop: 2, from: 'Entrepôt Kinshasa', to: 'Entrepôt Kikwit')]));
        expect(find.text(s.journeyHopTransfer('Entrepôt Kinshasa')), findsOneWidget);
        expect(find.text(s.journeyHopTransfer('Entrepôt Kikwit')), findsOneWidget);
        expect(find.text(s.journeyHopAt('Entrepôt Kinshasa')), findsOneWidget);
        expect(find.textContaining(lang == 'en' ? 'Run ' : 'Tournée '), findsNothing);
        expect(find.textContaining(lang == 'en' ? 'Driver' : 'Livreur'), findsNothing);
      });

      testWidgets('flat and nested shapes read the same on screen ($lang)', (t) async {
        await open(t, _order([_pickup, _flatLeg(rider: null, run: null), _flatLeg(hop: 2, from: 'Entrepôt Kinshasa', to: 'Entrepôt Kikwit', rider: null, run: null)]));
        final flat = [for (final w in t.widgetList<Text>(find.byType(Text))) w.data];
        await open(t, _order([_pickup, _flatLeg(rider: null, run: null, nested: true), _flatLeg(hop: 2, from: 'Entrepôt Kinshasa', to: 'Entrepôt Kikwit', rider: null, run: null, nested: true)]));
        final both = [for (final w in t.widgetList<Text>(find.byType(Text))) w.data];
        expect(both, flat);
        await open(t, _order([_pickup, _nestedLeg(), _nestedLeg(hop: 2, from: 'Entrepôt Kinshasa', to: 'Entrepôt Kikwit')]));
        expect([for (final w in t.widgetList<Text>(find.byType(Text))) w.data], flat);
      });
    }
  });

  group('the errors of docs/contracts/areas.md in French', () {
    const fr = Strings('fr'), en = Strings('en');
    String f(String raw) => translateServerError(raw, fr);

    test('geography and coverage', () {
      expect(f('Hub not found.'), 'Entrepôt introuvable.');
      expect(f('Choose at least one area.'), 'Choisissez au moins une zone.');
      expect(f('Flat delivery fee must be a number between 0 and 500.'), contains('entre 0 et 500'));
      expect(f('An area with this name already exists here.'), 'Une zone portant ce nom existe déjà ici.');
      expect(f('An area with this code already exists.'), 'Une zone portant ce code existe déjà.');
      expect(f('Level must be one of: country, province, city, district, commune, quartier.'), contains('pays, province, ville, district, commune, quartier'));
      expect(f('Active must be true or false.'), 'La valeur « actif » doit être vraie ou fausse.');
      expect(f('This area is already covered by Entrepôt Limete.'), 'Cette zone est déjà couverte par Entrepôt Limete.');
      expect(f('A commune cannot be added under a quartier.'), 'Un niveau « commune » ne peut pas être ajouté sous un niveau « quartier ».');
      expect(f('A quartier cannot be added under a city.'), 'Un niveau « quartier » ne peut pas être ajouté sous un niveau « ville ».');
      expect(f('A country cannot be added under a district.'), 'Un niveau « pays » ne peut pas être ajouté sous un niveau « district ».');
    });

    test('routing and checkout', () {
      expect(f('Delivery between cities is not available right now.'), 'La livraison entre villes n’est pas disponible pour le moment.');
      expect(f('One seller in your cart cannot ship from their area yet.'), 'Un vendeur de votre panier ne peut pas encore expédier depuis sa zone.');
      expect(f('We don\'t deliver to this area yet.'), 'Nous ne livrons pas encore à cette zone.');
      expect(f('We don’t deliver to this area yet.'), 'Nous ne livrons pas encore à cette zone.', reason: 'typographic apostrophe');
      expect(f('We don\'t deliver to Lubumbashi yet.'), 'Nous ne livrons pas encore à Lubumbashi.');
      expect(f('Pin your delivery address on the map.'), 'Placez votre adresse de livraison sur la carte.');
      expect(f('Address not found.'), 'Adresse introuvable.', reason: 'delivery:quote with an unknown address id: thrown by the API, missing from the contract\'s list');
    });

    test('lanes and transfer runs', () {
      const expected = {
        'A lane connects two different warehouses.': 'Une ligne relie deux entrepôts différents.',
        'Lane not found.': 'Ligne introuvable.',
        'Transit time (hours) must be a number between 0 and 720.': 'Le temps de transit (en heures) doit être un nombre compris entre 0 et 720.',
        'Lane cost must be a number between 0 and 1000.': 'Le coût de la ligne doit être un nombre compris entre 0 et 1000.',
        'Bidirectional must be true or false.': 'La valeur « bidirectionnelle » doit être vraie ou fausse.',
        'This run has not left yet.': 'Cette tournée n’est pas encore partie.',
        'This run is already closed.': 'Cette tournée est déjà clôturée.',
        'Run not found.': 'Tournée introuvable.',
        'Choose at least one parcel.': 'Choisissez au moins un colis.',
        'Choose parcels of this run.': 'Choisissez des colis de cette tournée.',
        'Choose some of the parcels of this run, not all of them.': 'Choisissez une partie des colis de cette tournée, pas tous.',
        'That parcel is not in this run.': 'Ce colis ne fait pas partie de cette tournée.',
        'This run has no parcels left to send.': 'Cette tournée n’a plus de colis à envoyer.',
        'This rider works at another warehouse.': 'Ce livreur travaille dans un autre entrepôt.',
        'This parcel is part of a transfer run. Manage it from the run.': 'Ce colis fait partie d’une tournée de transfert. Gérez-le depuis la tournée.',
        'Parcel missing from run TR-0042.': 'Colis manquant dans la tournée TR-0042.',
        'Status must be in_transit.': 'Le statut doit être « en transit ».',
        'Only supervisors and managers can assign riders.': 'Seuls les superviseurs et les responsables peuvent attribuer des livreurs.',
        'This task belongs to another warehouse.': 'Cette tâche appartient à un autre entrepôt.',
        'This parcel is not due at your warehouse.': 'Ce colis n’est pas attendu dans votre entrepôt.',
        'Your account is not linked to a warehouse. Ask an administrator.': 'Votre compte n’est lié à aucun entrepôt. Demandez à un administrateur.',
        'Choose a warehouse.': 'Choisissez un entrepôt.',
      };
      expected.forEach((raw, french) => expect(f(raw), french, reason: raw));
    });

    test('English is left as the server wrote it', () {
      for (final raw in [
        'Delivery between cities is not available right now.',
        'This parcel is part of a transfer run. Manage it from the run.',
        'We don\'t deliver to this area yet.',
        'A commune cannot be added under a quartier.',
        'Active must be true or false.',
      ]) {
        expect(translateServerError(raw, en), raw);
      }
    });

    test('the generic "x must be true or false" switch message does not take over the contract\'s own', () {
      expect(f('Active must be true or false.'), isNot(contains('réglage')));
      expect(f('push must be true or false.'), contains('réglage'), reason: 'notification switches keep theirs');
    });

    test('every error the contract lists has a French text (the contract file is read when it is next to the app)', () {
      final file = File('../docs/contracts/areas.md');
      if (!file.existsSync()) {
        markTestSkipped('docs/contracts/areas.md is not next to the app');
        return;
      }
      final text = file.readAsStringSync();
      final section = text.substring(text.indexOf('## Errors'));
      final fills = {'{hub}': 'Entrepôt Limete', '{area}': 'Goma', '{ref}': 'TR-0042', '{level}': 'commune'};
      final errors = <String>{
        for (final m in RegExp(r'`([^`\n]+)`').allMatches(section))
          if (RegExp(r'^[A-Z][^`]*\.$').hasMatch(m[1]!)) fills.entries.fold(m[1]!, (s, e) => s.replaceAll(e.key, e.value)),
      };
      expect(errors.length, greaterThan(40), reason: 'the contract\'s Errors section was not read: $errors');
      final untranslated = [for (final e in errors) if (f(e) == e) e];
      expect(untranslated, isEmpty, reason: 'errors of the contract with no French text');
    });
  });
}
