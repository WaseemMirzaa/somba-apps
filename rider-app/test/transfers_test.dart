// Transfer runs and hops (docs/contracts/areas.md, "Multi-warehouse transfers"): one card per run with its parcels, the
// "On the road" action, hand-over at the receiving warehouse, "Hop 1/2 · A → B" labels, each driver seeing only their
// own runs, live `run:updated` pushes, older servers without runs, `Run.inTransit` and `rider:runStatus`, the warehouse's
// covered areas on the profile (`hub.coverage`, else `hubs:coverage`, else nothing), and the new errors in French.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/messages.dart';
import 'package:somba_rider/l10n/server_errors.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/deliveries_screen.dart';
import 'package:somba_rider/screens/profile_screen.dart';
import 'package:somba_rider/services/auth_service.dart' show ApiException;
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/rider_focus.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

import 'button_rules.dart';
import 'task_fixtures.dart';

/// "No `coverage` key at all" (null would be an explicit null).
const Object _absent = Object();

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
      await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
    }
  });

  final calls = <String>[];
  final sent = <String, Map<String, dynamic>?>{};
  late List<Map<String, dynamic>> serverTasks, serverRuns;
  Object? Function(String event, Map<String, dynamic>? body)? special;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await Strings.setLang('en', persist: false);
    calls.clear();
    sent.clear();
    serverTasks = [];
    serverRuns = [];
    special = null;
    final store = RiderStore.instance;
    store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean-Pierre Mukendi', role: 'rider', phone: '+243810000000');
    store.loaded = true;
    store.requireDeliveryCode = false;
    store.myTasks.clear();
    store.debugResetSession();
    store.transport = (event, body) async {
      calls.add(event);
      sent[event] = body;
      final custom = special?.call(event, body);
      if (custom != null) return custom;
      switch (event) {
        case 'rider:tasks':
          return serverTasks;
        case 'rider:runs':
          return serverRuns;
        case 'rider:earnings':
          return {'totalTasks': 3, 'delivered': 1, 'active': 2, 'codCollectedUsd': 0, 'earningsUsd': 2};
        case 'notifications:list':
          return [];
        case 'settings:get':
          return {'requireDeliveryCode': 'false'};
        case 'rider:assignment':
          return {'hub': {'id': 'h-kin', 'name': 'Entrepôt Kinshasa', 'city': 'Kinshasa', 'address': 'Boulevard du 30 Juin 8'}};
        case 'support:list':
          return [];
        default:
          return {'ok': true};
      }
    };
  });

  tearDown(() {
    final store = RiderStore.instance;
    store.transport = null;
    store.user = null;
    store.myTasks.clear();
    store.debugResetSession();
    store.notifications.clear();
    store.assignment = null;
    store.focus.value = null;
  });

  Future<void> settle() async {
    await pumpEventQueue();
  }

  group('parsing', () {
    test('a run: ids, names, counts, status and times', () {
      final r = TransferRun.fromJson(runJson('a1', received: 12, missing: 1, taskIds: ['t1', 't2'], extra: {'dispatchedAt': '2026-10-26T08:00:00.000Z'}));
      expect((r.reference, r.fromHubName, r.toHubName, r.status), ('TR-00A1', 'Entrepôt Kinshasa', 'Entrepôt Limete', 'dispatched'));
      expect((r.count, r.receivedCount, r.missingCount), (18, 12, 1));
      expect(r.taskIds, ['t1', 't2']);
      expect(r.dispatchedAt, DateTime.parse('2026-10-26T08:00:00.000Z').toLocal());
      expect((r.isDispatched, r.isActive, r.isClosed, r.inTransit), (true, true, false, false));
    });

    test('a fully received run is no longer active; the French count agrees with one parcel', () {
      final r = TransferRun.fromJson({'id': 'x', 'status': 'arrived', 'count': 1, 'receivedCount': 1});
      expect((r.allReceived, r.isActive), (true, false));
      expect(TransferRun.fromJson({'id': 'x', 'status': 'arrived', 'count': 2, 'receivedCount': 1}).isActive, isTrue);
      expect(Strings('fr').runReceived(1, 1), '1 colis sur 1 réceptionné');
      expect(Strings('fr').runReceived(15, 18), '15 colis sur 18 réceptionnés');
      expect(Strings('en').runReceived(1, 1), '1 of 1 parcels scanned in');
    });

    test('the count falls back to the parcel ids', () {
      expect(TransferRun.fromJson({'id': 'x', 'taskIds': ['a', 'b', 'c']}).count, 3);
      expect(TransferRun.fromJson({'id': 'x', 'status': 'closed'}).isActive, isFalse);
    });

    test('Run.inTransit, inTransitAt, receivedCount and missingCount are read from the final payload', () {
      final r = TransferRun.fromJson(runJson('a1', received: 12, missing: 2, extra: {'inTransit': true, 'inTransitAt': '2026-10-26T09:30:00.000Z'}));
      expect((r.inTransit, r.receivedCount, r.missingCount), (true, 12, 2));
      expect(r.inTransitAt, DateTime.parse('2026-10-26T09:30:00.000Z').toLocal());
      final waiting = TransferRun.fromJson(runJson('a2', extra: {'inTransit': false, 'inTransitAt': null}));
      expect(waiting.inTransit, isFalse);
      expect(waiting.inTransitAt, isNull);
    });

    test('an old payload without inTransit is not on the road: false by default, counts 0', () {
      final r = TransferRun.fromJson({'id': 'x', 'reference': 'TR-1', 'status': 'dispatched', 'count': 2});
      expect((r.inTransit, r.receivedCount, r.missingCount), (false, 0, 0));
      expect(r.inTransitAt, isNull);
    });

    test('an older payload may still say it differently: only a time, or the road as a status', () {
      final timed = TransferRun.fromJson({'id': 'x', 'status': 'dispatched', 'inTransitAt': '2026-10-26T09:30:00Z'});
      expect(timed.inTransit, isTrue);
      final s = TransferRun.fromJson({'id': 'x', 'status': 'in_transit', 'count': 2});
      expect((s.status, s.inTransit), ('dispatched', true));
      // the flag, when the server sends it, decides
      expect(TransferRun.fromJson({'id': 'x', 'status': 'dispatched', 'inTransit': false, 'inTransitAt': '2026-10-26T09:30:00Z'}).inTransit, isFalse);
      expect(TransferRun.fromJson({'id': 'x', 'status': 'dispatched', 'inTransit': 'yes'}).inTransit, isFalse, reason: 'not a bool: ignored');
    });

    test('a list is read from a bare list or from {runs}; rows without an id are dropped', () {
      expect(TransferRun.listFrom([runJson('a'), {'reference': 'no id'}, 5, null]).map((r) => r.id), ['a']);
      expect(TransferRun.listFrom({'runs': [runJson('b')]}).map((r) => r.id), ['b']);
      expect(TransferRun.listFrom('nope'), isEmpty);
    });

    test('a leg knows its run and its hop; an older leg has neither', () {
      final t = DeliveryTaskDto.fromJson(parcelJson('t1', 'a1', hop: 1, hops: 2));
      expect((t.runId, t.runReference, t.hop, t.hops, t.isRelayHop), ('a1', 'TR-00A1', 1, 2, true));
      final old = leg('transfer', id: 'old');
      expect((old.runId, old.hop, old.hops, old.isRelayHop), (null, null, null, false));
      expect(DeliveryTaskDto.fromJson(parcelJson('t2', 'a1', hop: 1, hops: 1)).isRelayHop, isFalse, reason: 'a single hop is a plain transfer');
    });

    test('a push without the order keeps the run and hop of the leg', () {
      final fresh = DeliveryTaskDto.fromJson({...parcelJson('t1', 'a1', hop: 2, hops: 3), 'order': null}..remove('order'));
      final merged = fresh.withOrderFrom(DeliveryTaskDto.fromJson(parcelJson('t1', 'a1', hop: 2, hops: 3)));
      expect((merged.runId, merged.hop, merged.hops), ('a1', 2, 3));
    });

    test('covered areas: sorted widest first, named in either language', () {
      final list = CoverageArea.listFrom([
        {'id': 'c', 'level': 'commune', 'name': 'Limete'},
        {'id': 'p', 'level': 'province', 'name': 'Nord-Kivu', 'nameEn': 'North Kivu'},
        {'id': 'x', 'level': 'city', 'name': ''},
        'junk',
      ]);
      expect(list.map((a) => a.id), ['p', 'c']);
      expect(list.first.nameFor('en'), 'North Kivu');
      expect(list.first.nameFor('fr'), 'Nord-Kivu');
      expect(list.last.nameFor('en'), 'Limete', reason: 'no English name: the official one');
    });

    test('the assignment carries the hub area and its coverage (Area & {feeOverrideUsd})', () {
      final a = RiderAssignment.fromJson({
        'hub': {
          'id': 'h',
          'name': 'E',
          'city': 'Kinshasa',
          'address': 'Boulevard du 30 Juin 8',
          'lat': -4.3,
          'lng': 15.3,
          'areaId': 'area-gombe',
          'coverage': [
            {'id': 'c', 'code': 'CD-KN-LMT', 'level': 'commune', 'name': 'Limete', 'nameEn': null, 'feeOverrideUsd': 4},
            {'id': 'p', 'code': 'CD-KN', 'level': 'province', 'name': 'Kinshasa', 'nameEn': 'Kinshasa', 'feeOverrideUsd': null},
          ]
        }
      });
      expect((a.hubId, a.hubName, a.hubAreaId), ('h', 'E', 'area-gombe'));
      expect(a.coverage!.map((x) => x.id), ['p', 'c'], reason: 'widest first');
      expect(a.areas, hasLength(2));
      expect(a.withCoverage(const []).hubAreaId, 'area-gombe', reason: 'a coverage read keeps the rest');
    });

    test('an assignment from an old server has neither areaId nor coverage: unknown, empty, no crash', () {
      final a = RiderAssignment.fromJson({'hub': {'id': 'h', 'name': 'E'}});
      expect(a.hubAreaId, isNull);
      expect(a.coverage, isNull);
      expect(a.areas, isEmpty);
      expect(a.hasHub, isTrue);
      for (final j in <Map<String, dynamic>>[{}, {'hub': null}, {'hub': 'junk'}, {'hub': {'coverage': 'junk'}}]) {
        final x = RiderAssignment.fromJson(j);
        expect(x.coverage, isNull, reason: '$j');
        expect(x.areas, isEmpty, reason: '$j');
        expect(x.hubAreaId, isNull, reason: '$j');
      }
    });

    test('an empty coverage is a warehouse with no area yet, not an unknown one', () {
      final a = RiderAssignment.fromJson({'hub': {'id': 'h', 'name': 'E', 'coverage': []}});
      expect(a.coverage, isNotNull);
      expect(a.coverage, isEmpty);
    });
  });

  group('the store', () {
    test('a refresh reads this driver\'s runs and nobody else\'s; their parcels fold into the run card', () async {
      serverTasks = [
        parcelJson('t1', 'a1', hop: 1, hops: 2),
        parcelJson('t2', 'a1', hop: 1, hops: 2, reference: 'SOM-1043'),
        legJson('delivery', id: 'plain', status: 'assigned'),
      ];
      serverRuns = [runJson('a1', taskIds: ['t1', 't2'], count: 2), runJson('b2', riderId: 'someone-else')];
      final store = RiderStore.instance;
      await store.refresh();
      await settle();
      expect(store.runs.map((r) => r.id), ['a1'], reason: 'another driver\'s run is never shown');
      expect(store.activeRuns, hasLength(1));
      expect(store.active.map((t) => t.id), ['plain'], reason: 'the parcels of a known run are inside its card');
      expect(store.tasksOfRun(store.runs.single).map((t) => t.id), ['t1', 't2']);
      expect(store.myTasks, hasLength(3), reason: 'still in the list (the GPS and the earnings need them)');
    });

    test('a closed run is in Done; its parcels do not show twice', () async {
      serverTasks = [parcelJson('t1', 'a1', status: 'delivered')];
      serverRuns = [runJson('a1', status: 'closed', taskIds: ['t1'], count: 1, received: 1)];
      final store = RiderStore.instance;
      await store.refresh();
      await settle();
      expect(store.activeRuns, isEmpty);
      expect(store.finishedRuns.single.id, 'a1');
      expect(store.finished, isEmpty);
    });

    test('a run the warehouse fully scanned in moves to Done before it is closed; a partly received one stays active', () async {
      serverTasks = [parcelJson('t1', 'a1', status: 'delivered'), parcelJson('t2', 'b2', status: 'delivered'), parcelJson('t3', 'b2', status: 'in_transit')];
      serverRuns = [
        runJson('a1', status: 'arrived', taskIds: ['t1'], count: 1, received: 1),
        runJson('b2', status: 'arrived', taskIds: ['t2', 't3'], count: 2, received: 1),
      ];
      final store = RiderStore.instance;
      await store.refresh();
      await settle();
      expect(store.activeRuns.map((r) => r.id), ['b2']);
      expect(store.finishedRuns.map((r) => r.id), ['a1']);
    });

    test('an older server (no runs): the call fails quietly and every leg shows on its own', () async {
      serverTasks = [parcelJson('t1', 'a1')];
      special = (event, body) => event == 'rider:runs' ? throw ApiException('Unknown event.') : null;
      final store = RiderStore.instance;
      await store.refresh();
      await settle();
      expect(store.runs, isEmpty);
      expect(store.active.map((t) => t.id), ['t1']);
      expect(store.loaded, isTrue);
    });

    test('run:updated adds, updates and drops runs; a run given to another driver leaves', () {
      final store = RiderStore.instance;
      store.applyRunPush(runJson('a1', status: 'planned'));
      expect(store.runs.single.status, 'planned');
      store.applyRunPush(runJson('a1', status: 'dispatched'));
      expect(store.runs, hasLength(1));
      expect(store.runs.single.status, 'dispatched');
      store.applyRunPush(runJson('b2', riderId: 'someone-else'));
      expect(store.runs.map((r) => r.id), ['a1'], reason: 'not this driver\'s');
      store.applyRunPush(runJson('a1', riderId: 'someone-else'));
      expect(store.runs, isEmpty, reason: 'reassigned');
      store.applyRunPush('garbage');
      store.applyRunPush({'status': 'x'});
      expect(store.runs, isEmpty);
    });

    test('"On the road" is rider:runStatus { runId, status: in_transit }; the Run it replies with is the new state', () async {
      serverRuns = [runJson('a1', taskIds: ['t1'], count: 1)];
      serverTasks = [parcelJson('t1', 'a1')];
      final store = RiderStore.instance;
      await store.refresh();
      await settle();
      expect(store.runs.single.inTransit, isFalse);
      expect(store.runOnRoad(store.runs.single), isFalse);
      // the final server: the reply is the Run with inTransit, and the next read says the same
      serverRuns = [runJson('a1', taskIds: ['t1'], count: 1, extra: {'inTransit': true, 'inTransitAt': '2026-10-26T09:30:00.000Z'})];
      special = (event, body) => event == 'rider:runStatus' ? serverRuns.single : null;
      await store.markRunOnRoad('a1');
      await settle();
      expect(sent['rider:runStatus'], {'runId': 'a1', 'status': 'in_transit'});
      expect(calls, contains('rider:runs'));
      expect(store.runs.single.inTransit, isTrue);
      expect(store.runs.single.inTransitAt, isNotNull);
      expect(store.runOnRoad(store.runs.single), isTrue);
    });

    test('an older server that answers without the flag: the run is still shown on the road, until a read says so', () async {
      serverRuns = [runJson('a1', taskIds: ['t1'], count: 1)];
      serverTasks = [parcelJson('t1', 'a1')];
      final store = RiderStore.instance;
      await store.refresh();
      await settle();
      special = (event, body) => event == 'rider:runStatus' ? {'ok': true} : null; // no Run, no inTransit
      await store.markRunOnRoad('a1');
      await settle();
      expect(store.runs.single.inTransit, isFalse, reason: 'the payload never said so');
      expect(store.runOnRoad(store.runs.single), isTrue, reason: 'the driver said so here');
      // the run read again (still without the flag): the driver's word stands
      await store.refresh();
      await settle();
      expect(store.runOnRoad(store.runs.single), isTrue);
      // the server catches up: its state takes over
      serverRuns = [runJson('a1', taskIds: ['t1'], count: 1, extra: {'inTransit': true})];
      await store.refresh();
      await settle();
      expect(store.runs.single.inTransit, isTrue);
      expect(store.runOnRoad(store.runs.single), isTrue);
    });

    test('a run:updated push with inTransit puts the run on the road', () {
      final store = RiderStore.instance;
      store.applyRunPush(runJson('a1', taskIds: ['t1'], count: 1));
      expect(store.runOnRoad(store.runs.single), isFalse);
      store.applyRunPush(runJson('a1', taskIds: ['t1'], count: 1, extra: {'inTransit': true, 'inTransitAt': '2026-10-26T09:30:00Z'}));
      expect(store.runs.single.inTransit, isTrue);
      expect(store.runOnRoad(store.runs.single), isTrue);
    });

    test('a refused "On the road" throws what the server said', () async {
      special = (event, body) => event == 'rider:runStatus' ? throw ApiException('This run has already left.') : null;
      expect(() => RiderStore.instance.markRunOnRoad('a1'), throwsA(isA<ApiException>()));
    });

    test('a run is on the road when every parcel is in transit, or the server says so', () async {
      final store = RiderStore.instance;
      store.runs.add(TransferRun.fromJson(runJson('a1', taskIds: ['t1', 't2'], count: 2)));
      store.myTasks.addAll([DeliveryTaskDto.fromJson(parcelJson('t1', 'a1', status: 'in_transit')), DeliveryTaskDto.fromJson(parcelJson('t2', 'a1', status: 'picked_up'))]);
      expect(store.runOnRoad(store.runs.single), isFalse);
      store.myTasks[1] = DeliveryTaskDto.fromJson(parcelJson('t2', 'a1', status: 'in_transit'));
      expect(store.runOnRoad(store.runs.single), isTrue);
    });

    test('the hop of a run comes from the run, else from its parcels; none on a single hop', () {
      final store = RiderStore.instance;
      store.runs.add(TransferRun.fromJson(runJson('a1', taskIds: ['t1'], count: 1)));
      store.myTasks.add(DeliveryTaskDto.fromJson(parcelJson('t1', 'a1', hop: 2, hops: 3)));
      final h = store.runHop(store.runs.single)!;
      expect((h.hop, h.hops), (2, 3));
      store.runs.add(TransferRun.fromJson(runJson('b1', extra: {'hop': 1, 'hops': 2})));
      expect(store.runHop(store.runs.last)!.hop, 1);
      store.runs.add(TransferRun.fromJson(runJson('c1', extra: {'hop': 1, 'hops': 1})));
      expect(store.runHop(store.runs.last), isNull);
    });

    test('a run notification opens the Active list', () {
      expect(riderFocusFor('run', entityId: 'a1'), RiderFocus.deliveries(RiderFocus.active, taskId: 'a1'));
    });

    test('sign-out forgets the runs', () async {
      final store = RiderStore.instance;
      store.runs.add(TransferRun.fromJson(runJson('a1')));
      store.transport = (event, body) async => {'ok': true};
      await store.logout();
      expect(store.runs, isEmpty);
    });
  });

  group('the home warehouse\'s covered areas', () {
    /// An assignment answer with (or without) the final contract's fields.
    Map<String, dynamic> hubAnswer({Object? coverage = _absent, String? areaId = 'area-gombe'}) => {
          'hub': {
            'id': 'h-kin',
            'name': 'Entrepôt Kinshasa',
            'city': 'Kinshasa',
            'address': 'Boulevard du 30 Juin 8',
            'lat': -4.3,
            'lng': 15.3,
            if (areaId != null) 'areaId': areaId,
            if (!identical(coverage, _absent)) 'coverage': coverage,
          }
        };
    final provinceAndCommune = [
      {'id': 'p', 'level': 'province', 'name': 'Kinshasa', 'feeOverrideUsd': null},
      {'id': 'c', 'level': 'commune', 'name': 'Limete', 'feeOverrideUsd': 4},
    ];

    test('hub.coverage in rider:assignment is used as it is: no second question, hub.areaId kept', () async {
      special = (event, body) => event == 'rider:assignment' ? hubAnswer(coverage: provinceAndCommune) : null;
      final store = RiderStore.instance;
      await store.refresh();
      await settle();
      expect(calls, isNot(contains('hubs:coverage')));
      expect(store.assignment!.coverage!.map((a) => a.id), ['p', 'c']);
      expect(store.assignment!.hubAreaId, 'area-gombe');
    });

    test('hub.coverage = [] is a warehouse with no area yet: known, empty, no second question', () async {
      special = (event, body) => event == 'rider:assignment' ? hubAnswer(coverage: []) : null;
      final store = RiderStore.instance;
      await store.refresh();
      await settle();
      expect(calls, isNot(contains('hubs:coverage')));
      expect(store.assignment!.coverage, isNotNull);
      expect(store.assignment!.coverage, isEmpty);
    });

    test('without hub.coverage, hubs:coverage { hubId } fills it in (any rider of the hub may ask)', () async {
      special = (event, body) {
        if (event == 'rider:assignment') return hubAnswer();
        if (event == 'hubs:coverage') return {'hubId': 'h-kin', 'areas': provinceAndCommune};
        return null;
      };
      final store = RiderStore.instance;
      await store.refresh();
      await settle();
      expect(sent['hubs:coverage'], {'hubId': 'h-kin'});
      expect(store.assignment!.coverage!.map((a) => a.id), ['p', 'c']);
      expect(store.assignment!.hasHub, isTrue);
      expect(store.assignment!.hubAreaId, 'area-gombe', reason: 'the rest of the assignment survives the coverage read');
    });

    test('an old assignment (no areaId either) is completed the same way', () async {
      special = (event, body) => event == 'hubs:coverage' ? {'hubId': 'h-kin', 'areas': provinceAndCommune} : null;
      final store = RiderStore.instance; // the default answer has neither areaId nor coverage
      await store.refresh();
      await settle();
      expect(store.assignment!.hubAreaId, isNull);
      expect(store.assignment!.coverage!.map((a) => a.id), ['p', 'c']);
    });

    test('neither field (an old server): the warehouse alone, empty coverage, no crash, nothing remembered', () async {
      special = (event, body) => event == 'hubs:coverage' ? throw ApiException('Not allowed.') : null;
      final store = RiderStore.instance;
      await store.refresh();
      await settle();
      expect(store.loaded, isTrue);
      expect(store.assignment!.hasHub, isTrue);
      expect(store.assignment!.coverage, isNull);
      expect(store.assignment!.areas, isEmpty);
    });

    test('a refusal is not remembered: the next full read asks again and shows what the server now allows', () async {
      var allowed = false;
      special = (event, body) {
        if (event != 'hubs:coverage') return null;
        if (!allowed) throw ApiException('Not allowed.');
        return {'hubId': 'h-kin', 'areas': provinceAndCommune};
      };
      final store = RiderStore.instance;
      await store.refresh();
      await settle();
      expect(store.assignment!.coverage, isNull);
      allowed = true;
      await store.refresh();
      await settle();
      expect(calls.where((c) => c == 'hubs:coverage'), hasLength(2));
      expect(store.assignment!.coverage!.map((a) => a.id), ['p', 'c']);
    });

    test('an unknown event or any other failure is retried on the next full read; a light read does not ask', () async {
      special = (event, body) => event == 'hubs:coverage' ? throw ApiException('The server did not respond.') : null;
      final store = RiderStore.instance;
      await store.refresh();
      await store.refresh();
      await store.refresh(light: true);
      await settle();
      expect(calls.where((c) => c == 'hubs:coverage'), hasLength(2));
      expect(store.assignment!.hasHub, isTrue);
    });

    test('an answer without a list of areas changes nothing', () async {
      special = (event, body) => event == 'hubs:coverage' ? {'ok': true} : null;
      final store = RiderStore.instance;
      await store.refresh();
      await settle();
      expect(store.assignment!.coverage, isNull);
      special = (event, body) => event == 'hubs:coverage' ? {'hubId': 'h-kin', 'areas': 'junk'} : null;
      await store.refresh();
      await settle();
      expect(store.assignment!.coverage, isNull);
    });

    test('the coverage already known stays while it is read again, and is dropped when the warehouse changes', () async {
      var failing = false;
      var hub = 'h-kin';
      special = (event, body) {
        if (event == 'rider:assignment') {
          return {'hub': {'id': hub, 'name': 'Entrepôt $hub', 'city': 'Kinshasa'}};
        }
        if (event == 'hubs:coverage') {
          if (failing) throw ApiException('The server did not respond.');
          return {'hubId': hub, 'areas': provinceAndCommune};
        }
        return null;
      };
      final store = RiderStore.instance;
      await store.refresh();
      await settle();
      expect(store.assignment!.coverage, hasLength(2));
      failing = true;
      await store.refresh();
      await settle();
      expect(store.assignment!.coverage, hasLength(2), reason: 'same warehouse, the read failed: keep what we know');
      hub = 'h-lim';
      await store.refresh();
      await settle();
      expect(store.assignment!.hubId, 'h-lim');
      expect(store.assignment!.coverage, isNull, reason: 'another warehouse: the old list is not its coverage');
    });

    test('a rider without a warehouse asks nothing', () async {
      special = (event, body) => event == 'rider:assignment' ? {'hub': null} : null;
      final store = RiderStore.instance;
      await store.refresh();
      await settle();
      expect(calls, isNot(contains('hubs:coverage')));
      expect(store.assignment!.hasHub, isFalse);
    });

    test('an older server without rider:assignment: the call fails quietly', () async {
      special = (event, body) => event == 'rider:assignment' ? throw ApiException('Unknown event.') : null;
      final store = RiderStore.instance;
      await store.refresh();
      await settle();
      expect(store.loaded, isTrue);
      expect(store.assignment, isNull);
      expect(calls, isNot(contains('hubs:coverage')));
    });
  });

  Future<void> show(WidgetTester t, String lang, {Widget? home, double height = 1800}) async {
    await Strings.setLang(lang, persist: false);
    t.view.physicalSize = Size(360 * 3, height * 3);
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    await t.pumpWidget(KeyedSubtree(
        key: UniqueKey(),
        child: MaterialApp(
          locale: Locale(lang),
          supportedLocales: const [Locale('en'), Locale('fr')],
          localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
          theme: AppTheme.light(),
          home: home ?? const Scaffold(body: DeliveriesScreen()),
        )));
    await t.pump(const Duration(milliseconds: 600));
  }

  void seed({List<TransferRun> runs = const [], List<Map<String, dynamic>> parcels = const [], List<DeliveryTaskDto> tasks = const []}) {
    final store = RiderStore.instance;
    store.runs
      ..clear()
      ..addAll(runs);
    store.myTasks
      ..clear()
      ..addAll([for (final p in parcels) DeliveryTaskDto.fromJson(p), ...tasks]);
  }

  for (final lang in ['en', 'fr']) {
    final s = Strings(lang);

    group('run cards ($lang)', () {
      testWidgets('one card per run: "Transfer to <warehouse> · 18 parcels", from, the parcel list, hand-over at the receiving warehouse', (t) async {
        seed(
          runs: [TransferRun.fromJson(runJson('a1', taskIds: ['t1', 't2']))],
          parcels: [parcelJson('t1', 'a1'), parcelJson('t2', 'a1', reference: 'SOM-1043')],
        );
        await show(t, lang);
        expect(find.byKey(const ValueKey('run-a1')), findsOneWidget);
        expect(find.byKey(const ValueKey('task-t1')), findsNothing, reason: 'the parcels are inside the run\'s card');
        expect(find.text('TR-00A1'), findsOneWidget);
        expect(find.text(s.runTitle('Entrepôt Limete', 18)), findsOneWidget);
        expect(find.text(lang == 'en' ? 'Transfer to Entrepôt Limete · 18 parcels' : 'Transfert vers Entrepôt Limete · 18 colis'), findsOneWidget);
        expect(find.text(s.legTransferFrom('Entrepôt Kinshasa')), findsOneWidget);
        expect(find.text(s.kindRun), findsOneWidget);
        expect(find.text(s.runStatusLoaded), findsOneWidget);
        expect(find.text(s.handoverAt('Entrepôt Limete')), findsOneWidget);
        expect(find.byKey(const ValueKey('run-waiting-scan-a1')), findsNothing, reason: 'not on the road yet');
        // the parcel list opens on a tap
        expect(find.text(s.runParcels(2)), findsOneWidget);
        expect(find.byKey(const ValueKey('run-parcel-t1')), findsNothing);
        await t.tap(find.byKey(const ValueKey('run-parcels-a1')));
        await t.pump();
        expect(find.byKey(const ValueKey('run-parcel-t1')), findsOneWidget);
        expect(find.textContaining('SOM-1043'), findsOneWidget);
        expect(find.textContaining('2× '), findsWidgets, reason: 'the items of the parcel');
        await t.tap(find.byKey(const ValueKey('run-parcels-a1')));
        await t.pump();
        expect(find.byKey(const ValueKey('run-parcel-t1')), findsNothing);
      });

      testWidgets('"On the road" marks the whole run; then the card waits for the warehouse to scan it in', (t) async {
        SharedPreferences.setMockInitialValues({'somba.rider.bgLocationExplained': true});
        seed(runs: [TransferRun.fromJson(runJson('a1', taskIds: ['t1'], count: 1))], parcels: [parcelJson('t1', 'a1')]);
        await show(t, lang);
        expect(find.text(s.actRunOnRoad), findsOneWidget);
        expect(find.byKey(const ValueKey('run-next-a1')), findsOneWidget);
        expectButtonRules(t);
        // the server marks the parcels in transit and says so in the run it returns
        special = (event, body) {
          if (event == 'rider:runStatus') return runJson('a1', taskIds: ['t1'], count: 1, extra: {'inTransit': true});
          if (event == 'rider:tasks') return [parcelJson('t1', 'a1', status: 'in_transit')];
          if (event == 'rider:runs') return [runJson('a1', taskIds: ['t1'], count: 1, extra: {'inTransit': true})];
          return null;
        };
        await t.tap(find.byKey(const ValueKey('run-next-a1')));
        await t.pump();
        await t.pump(const Duration(milliseconds: 400));
        expect(sent['rider:runStatus'], {'runId': 'a1', 'status': 'in_transit'});
        expect(find.byKey(const ValueKey('run-next-a1')), findsNothing, reason: 'it is on the road now');
        expect(find.text(s.runStatusOnRoad), findsOneWidget);
        expect(find.byKey(const ValueKey('run-waiting-scan-a1')), findsOneWidget);
        expect(find.text(s.waitingScan), findsOneWidget);
        expect(find.descendant(of: find.byType(SnackBar), matching: find.text(s.doneRunOnRoad)), findsOneWidget, reason: 'a completed action says so');
      });

      testWidgets('Run.inTransit shows the "On the road" badge, with no action left, waiting for the warehouse to scan it in', (t) async {
        seed(
          runs: [TransferRun.fromJson(runJson('a1', taskIds: ['t1'], count: 1, extra: {'inTransit': true, 'inTransitAt': '2026-10-26T09:30:00.000Z'}))],
          parcels: [parcelJson('t1', 'a1', status: 'in_transit')],
        );
        await show(t, lang);
        expect(find.descendant(of: find.byKey(const ValueKey('run-status-a1')), matching: find.text(s.runStatusOnRoad)), findsOneWidget);
        expect(find.text(lang == 'en' ? 'On the road' : 'En route'), findsOneWidget);
        expect(find.text(s.runStatusLoaded), findsNothing);
        expect(find.byKey(const ValueKey('run-next-a1')), findsNothing, reason: 'nothing left to mark');
        expect(find.byKey(const ValueKey('run-waiting-scan-a1')), findsOneWidget);
      });

      testWidgets('a dispatched run whose payload has no inTransit (old server) is "Loaded", with the action to mark it on the road', (t) async {
        seed(runs: [TransferRun.fromJson(runJson('a1', taskIds: ['t1'], count: 1))], parcels: [parcelJson('t1', 'a1')]);
        await show(t, lang);
        expect(find.descendant(of: find.byKey(const ValueKey('run-status-a1')), matching: find.text(s.runStatusLoaded)), findsOneWidget);
        expect(find.byKey(const ValueKey('run-next-a1')), findsOneWidget);
        expect(find.byKey(const ValueKey('run-waiting-scan-a1')), findsNothing);
        expect(find.descendant(of: find.byKey(const ValueKey('run-status-a1')), matching: find.text(s.runStatusOnRoad)), findsNothing, reason: 'the action says "On the road", the badge does not');
      });

      testWidgets('inTransit: false is the same as absent', (t) async {
        seed(runs: [TransferRun.fromJson(runJson('a1', count: 1, extra: {'inTransit': false, 'inTransitAt': null}))]);
        await show(t, lang);
        expect(find.text(s.runStatusLoaded), findsOneWidget);
        expect(find.byKey(const ValueKey('run-next-a1')), findsOneWidget);
      });

      testWidgets('the live push flips the card from "Loaded" to "On the road"', (t) async {
        seed(runs: [TransferRun.fromJson(runJson('a1', taskIds: ['t1'], count: 1))], parcels: [parcelJson('t1', 'a1')]);
        await show(t, lang);
        expect(find.text(s.runStatusLoaded), findsOneWidget);
        RiderStore.instance.applyRunPush(runJson('a1', taskIds: ['t1'], count: 1, extra: {'inTransit': true, 'inTransitAt': '2026-10-26T09:30:00.000Z'}));
        await t.pump();
        expect(find.text(s.runStatusLoaded), findsNothing);
        expect(find.descendant(of: find.byKey(const ValueKey('run-status-a1')), matching: find.text(s.runStatusOnRoad)), findsOneWidget);
        expect(find.byKey(const ValueKey('run-next-a1')), findsNothing);
      });

      testWidgets('a run that has arrived keeps saying so even though inTransit stays true; the counts come from the payload', (t) async {
        seed(runs: [TransferRun.fromJson(runJson('a1', status: 'arrived', count: 18, received: 15, missing: 1, extra: {'inTransit': true, 'inTransitAt': '2026-10-26T09:30:00.000Z'}))]);
        await show(t, lang);
        expect(find.descendant(of: find.byKey(const ValueKey('run-status-a1')), matching: find.text(s.runStatusArrived)), findsOneWidget);
        expect(find.text(s.runStatusOnRoad), findsNothing);
        expect(find.text(s.runReceived(15, 18)), findsOneWidget);
        expect(find.text(s.runMissing(1)), findsOneWidget);
      });

      testWidgets('a refusal is explained in a snackbar in the user\'s language', (t) async {
        SharedPreferences.setMockInitialValues({'somba.rider.bgLocationExplained': true});
        seed(runs: [TransferRun.fromJson(runJson('a1', count: 1))]);
        special = (event, body) => event == 'rider:runStatus' ? throw ApiException('This run has already left.') : null;
        await show(t, lang);
        await t.tap(find.byKey(const ValueKey('run-next-a1')));
        await t.pump();
        await t.pump(const Duration(milliseconds: 400));
        expect(find.descendant(of: find.byType(SnackBar), matching: find.text(s.serverError('This run has already left.'))), findsOneWidget);
        expect(find.byKey(const ValueKey('run-next-a1')), findsOneWidget, reason: 'nothing changed: the action stays');
      });

      testWidgets('a run still being prepared has no action; the warehouse loads it', (t) async {
        seed(runs: [TransferRun.fromJson(runJson('a1', status: 'planned', count: 5))]);
        await show(t, lang);
        expect(find.text(s.runStatusPlanned), findsOneWidget);
        expect(find.byKey(const ValueKey('run-next-a1')), findsNothing);
        expect(find.byKey(const ValueKey('run-handover-a1')), findsNothing);
        expect(find.text(s.runWaitLoad), findsOneWidget);
      });

      testWidgets('after the hand-over: the warehouse is scanning, with its progress; missing parcels are flagged', (t) async {
        seed(runs: [TransferRun.fromJson(runJson('a1', status: 'arrived', count: 18, received: 15, missing: 1))]);
        await show(t, lang);
        expect(find.text(s.runStatusArrived), findsOneWidget);
        expect(find.text(s.runReceived(15, 18)), findsOneWidget);
        expect(find.byKey(const ValueKey('run-waiting-scan-a1')), findsOneWidget);
        expect(find.byKey(const ValueKey('run-next-a1')), findsNothing);
        expect(find.text(s.runMissing(1)), findsOneWidget);
        expect(find.text(lang == 'en' ? '1 parcel missing from this run' : '1 colis manquant dans cette tournée'), findsOneWidget);
      });

      testWidgets('every parcel scanned in: the run moves to Done and says the hand-over is complete', (t) async {
        seed(runs: [TransferRun.fromJson(runJson('a1', status: 'arrived', count: 2, received: 2))]);
        await show(t, lang);
        expect(find.byKey(const ValueKey('run-a1')), findsNothing, reason: 'nothing left for the driver to do');
        await t.tap(find.byKey(const ValueKey('tab-1')));
        await t.pump();
        expect(find.byKey(const ValueKey('run-all-in-a1')), findsOneWidget);
        expect(find.text(s.runAllIn), findsOneWidget);
        expect(find.byKey(const ValueKey('run-waiting-scan-a1')), findsNothing);
        expect(find.text(lang == 'en' ? 'Handed over at Entrepôt Limete' : 'Remis à Entrepôt Limete'), findsWidgets);
      });

      testWidgets('a closed run is on the Done tab, not on Active', (t) async {
        seed(runs: [TransferRun.fromJson(runJson('a1', status: 'closed', count: 18, received: 17, missing: 1))]);
        await show(t, lang);
        expect(find.byKey(const ValueKey('run-a1')), findsNothing);
        expect(find.byKey(const ValueKey('empty-tasks')), findsOneWidget);
        await t.tap(find.byKey(const ValueKey('tab-1')));
        await t.pump(const Duration(milliseconds: 300));
        expect(find.byKey(const ValueKey('run-a1')), findsOneWidget);
        expect(find.text(s.runStatusClosed), findsOneWidget);
        expect(find.text(s.runMissing(1)), findsOneWidget);
        expect(find.byKey(const ValueKey('run-next-a1')), findsNothing);
      });

      testWidgets('the tabs count runs with the legs', (t) async {
        seed(
          runs: [TransferRun.fromJson(runJson('a1', count: 1)), TransferRun.fromJson(runJson('z9', status: 'closed', count: 1))],
          tasks: [leg('delivery', id: 'd1', status: 'assigned')],
        );
        await show(t, lang);
        expect(find.text('${s.tabActive} · 2'), findsOneWidget);
        expect(find.text('${s.tabDone} · 1'), findsOneWidget);
      });
    });

    group('hop labels ($lang)', () {
      testWidgets('a transfer leg of a two-hop route says "Hop 1/2 · From → To"', (t) async {
        seed(parcels: [
          {...legJson('transfer', id: 'x', status: 'assigned'), 'hop': 1, 'hops': 2}
        ]);
        await show(t, lang);
        expect(find.byKey(const ValueKey('hop-x')), findsOneWidget);
        expect(find.text(s.hopRoute(1, 2, 'Entrepôt de Limete', 'Entrepôt de Gombe')), findsOneWidget);
        expect(find.text(lang == 'en' ? 'Hop 1/2 · Entrepôt de Limete → Entrepôt de Gombe' : 'Étape 1/2 · Entrepôt de Limete → Entrepôt de Gombe'), findsOneWidget);
      });

      testWidgets('a plain transfer (one hop, or an older server) has no hop label', (t) async {
        seed(tasks: [leg('transfer', id: 'x')], parcels: [
          {...legJson('transfer', id: 'y', status: 'assigned'), 'hop': 1, 'hops': 1}
        ]);
        await show(t, lang);
        expect(find.byKey(const ValueKey('hop-x')), findsNothing);
        expect(find.byKey(const ValueKey('hop-y')), findsNothing);
        expect(find.textContaining(lang == 'en' ? 'Hop ' : 'Étape '), findsNothing);
      });

      testWidgets('a run of a two-hop route carries the same label', (t) async {
        seed(runs: [TransferRun.fromJson(runJson('a1', taskIds: ['t1'], count: 1, from: 'Entrepôt Limete', to: 'Entrepôt Kinshasa'))], parcels: [parcelJson('t1', 'a1', hop: 1, hops: 2)]);
        await show(t, lang);
        expect(find.byKey(const ValueKey('hop-run-a1')), findsOneWidget);
        expect(find.text(s.hopRoute(1, 2, 'Entrepôt Limete', 'Entrepôt Kinshasa')), findsOneWidget);
      });

      testWidgets('without the names of the ends the label is just "Hop 1/2"', (t) async {
        seed(runs: [TransferRun.fromJson(runJson('a1', count: 1, extra: {'hop': 2, 'hops': 3, 'fromHubName': null, 'toHubName': null}))]);
        await show(t, lang);
        expect(find.text(s.hopOf(2, 3)), findsOneWidget);
      });
    });

    group('each hop has its own driver ($lang)', () {
      /// What the server sends to [riderId]: only that driver's run and parcels.
      Future<void> asDriver(WidgetTester t, String riderId) async {
        final store = RiderStore.instance;
        store.user = BackendUser(id: riderId, email: '$riderId@somba.app', name: 'Driver $riderId', role: 'rider');
        // The server would filter; the app must not show a run that is not this driver's even if one slipped in.
        final all = [
          runJson('hop1', riderId: 'rA', riderName: 'Jean', from: 'Entrepôt Limete', to: 'Entrepôt Kinshasa', taskIds: ['t1'], count: 1),
          runJson('hop2', riderId: 'rB', riderName: 'Marie', from: 'Entrepôt Kinshasa', to: 'Entrepôt Kikwit', taskIds: ['t2'], count: 1),
        ];
        special = (event, body) {
          if (event == 'rider:runs') return all;
          if (event == 'rider:tasks') return [if (riderId == 'rA') parcelJson('t1', 'hop1', hop: 1, hops: 2), if (riderId == 'rB') parcelJson('t2', 'hop2', hop: 2, hops: 2)];
          return null;
        };
        await store.refresh();
        await t.pump(const Duration(milliseconds: 10)); // the runs are read after the queue
        await show(t, lang);
      }

      testWidgets('driver A sees hop 1 only', (t) async {
        await asDriver(t, 'rA');
        expect(find.byKey(const ValueKey('run-hop1')), findsOneWidget);
        expect(find.byKey(const ValueKey('run-hop2')), findsNothing);
        expect(find.text(s.hopRoute(1, 2, 'Entrepôt Limete', 'Entrepôt Kinshasa')), findsOneWidget);
        expect(find.text(s.runTitle('Entrepôt Kinshasa', 1)), findsOneWidget);
      });

      testWidgets('driver B sees hop 2 only', (t) async {
        await asDriver(t, 'rB');
        expect(find.byKey(const ValueKey('run-hop2')), findsOneWidget);
        expect(find.byKey(const ValueKey('run-hop1')), findsNothing);
        expect(find.text(s.hopRoute(2, 2, 'Entrepôt Kinshasa', 'Entrepôt Kikwit')), findsOneWidget);
        expect(find.text(s.runTitle('Entrepôt Kikwit', 1)), findsOneWidget);
      });
    });
  }

  group('the profile shows the covered areas', () {
    Future<void> profile(WidgetTester t, String lang, RiderAssignment a) async {
      RiderStore.instance.assignment = a;
      await show(t, lang, home: Scaffold(body: ProfileScreen(locale: Locale(lang), onLocaleChanged: (_) {})));
    }

    RiderAssignment withAreas(List<Map<String, dynamic>> areas) =>
        RiderAssignment.fromJson({'hub': {'id': 'h', 'name': 'Entrepôt Kinshasa', 'city': 'Kinshasa', 'coverage': areas}});

    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);

      testWidgets('names in the rider\'s language ($lang)', (t) async {
        await profile(t, lang, withAreas([
          {'id': 'p', 'level': 'province', 'name': 'Nord-Kivu', 'nameEn': 'North Kivu'},
          {'id': 'c', 'level': 'commune', 'name': 'Limete'},
        ]));
        expect(find.byKey(const ValueKey('warehouse-coverage')), findsOneWidget);
        expect(find.text(s.coverageTitle), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('coverage-p')), matching: find.text(lang == 'en' ? 'North Kivu' : 'Nord-Kivu')), findsOneWidget);
        expect(find.text(lang == 'en' ? 'Nord-Kivu' : 'North Kivu'), findsNothing);
        expect(find.descendant(of: find.byKey(const ValueKey('coverage-c')), matching: find.text('Limete')), findsOneWidget);
      });

      testWidgets('a long list shows the first eight and "+N more" ($lang)', (t) async {
        await profile(t, lang, withAreas([
          for (var i = 1; i <= 11; i++) {'id': 'c$i', 'level': 'commune', 'name': 'Commune ${i.toString().padLeft(2, '0')}'},
        ]));
        expect(find.byKey(const ValueKey('coverage-c8')), findsOneWidget);
        expect(find.byKey(const ValueKey('coverage-c9')), findsNothing);
        expect(find.text(s.coverageMore(3)), findsOneWidget);
      });

      testWidgets('a warehouse with no area yet says so ($lang)', (t) async {
        await profile(t, lang, withAreas([]));
        expect(find.byKey(const ValueKey('coverage-none')), findsOneWidget);
        expect(find.text(s.coverageNone), findsOneWidget);
      });

      testWidgets('when the server does not tell the rider, just the warehouse ($lang)', (t) async {
        await profile(t, lang, const RiderAssignment(hubId: 'h', hubName: 'Entrepôt Kinshasa', hubCity: 'Kinshasa'));
        expect(find.byKey(const ValueKey('where-i-work')), findsOneWidget);
        expect(find.text('Entrepôt Kinshasa · Kinshasa'), findsOneWidget);
        expect(find.byKey(const ValueKey('warehouse-coverage')), findsNothing);
        expect(find.text(s.coverageTitle), findsNothing);
      });

      testWidgets('the coverage the store read with hubs:coverage (no hub.coverage in the assignment) is on the profile ($lang)', (t) async {
        special = (event, body) => event == 'hubs:coverage'
            ? {
                'hubId': 'h-kin',
                'areas': [
                  {'id': 'p', 'level': 'province', 'name': 'Nord-Kivu', 'nameEn': 'North Kivu'},
                  {'id': 'c', 'level': 'commune', 'name': 'Limete', 'feeOverrideUsd': 4},
                ]
              }
            : null;
        await RiderStore.instance.refresh();
        await t.pump(const Duration(milliseconds: 10)); // (pumpEventQueue would wait forever in the test clock)
        await show(t, lang, home: Scaffold(body: ProfileScreen(locale: Locale(lang), onLocaleChanged: (_) {})));
        expect(find.byKey(const ValueKey('warehouse-coverage')), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('coverage-p')), matching: find.text(lang == 'en' ? 'North Kivu' : 'Nord-Kivu')), findsOneWidget);
        expect(find.byKey(const ValueKey('coverage-c')), findsOneWidget);
      });

      testWidgets('neither hub.coverage nor hubs:coverage (old server): the warehouse alone, no coverage block, no crash ($lang)', (t) async {
        special = (event, body) => event == 'hubs:coverage' ? throw ApiException('Unknown event.') : null;
        await RiderStore.instance.refresh();
        await t.pump(const Duration(milliseconds: 10));
        await show(t, lang, home: Scaffold(body: ProfileScreen(locale: Locale(lang), onLocaleChanged: (_) {})));
        expect(find.text('Entrepôt Kinshasa · Kinshasa'), findsOneWidget);
        expect(find.byKey(const ValueKey('warehouse-coverage')), findsNothing);
        expect(find.byKey(const ValueKey('coverage-none')), findsNothing);
      });
    }
  });

  group('errors and texts', () {
    const fr = Strings('fr');

    test('every error of the contract has a French text', () {
      expect(translateServerError('This run has already left.', fr), 'Cette tournée est déjà partie.');
      expect(translateServerError('This run has not left yet.', fr), 'Cette tournée n’est pas encore partie.');
      expect(translateServerError('This run is already closed.', fr), 'Cette tournée est déjà clôturée.');
      expect(translateServerError('Run not found.', fr), 'Tournée introuvable.');
      expect(translateServerError('Status must be in_transit.', fr), 'Le statut doit être « en route ».');
      expect(translateServerError('This parcel is part of a transfer run. Manage it from the run.', fr), 'Ce colis fait partie d’une tournée de transfert. Gérez-le depuis la tournée.');
      expect(translateServerError('Only parcels waiting at this warehouse can join this run.', fr), contains('rejoindre cette tournée'));
      expect(translateServerError('Choose a driver for this run first.', fr), 'Choisissez d’abord un livreur pour cette tournée.');
      expect(translateServerError('This rider works at another warehouse.', fr), 'Ce livreur travaille dans un autre entrepôt.');
      expect(translateServerError('Riders only.', fr), 'Réservé aux livreurs.');
      expect(translateServerError('Parcel missing from run TR-0042.', fr), 'Colis manquant dans la tournée TR-0042.');
      expect(translateServerError('These warehouses are not connected by any lane.', fr), 'Ces entrepôts ne sont reliés par aucune ligne.');
      expect(translateServerError('This area is already covered by Entrepôt Limete.', fr), 'Cette zone est déjà couverte par Entrepôt Limete.');
      expect(translateServerError('Choose where this warehouse is.', fr), 'Choisissez l’emplacement de cet entrepôt.');
      expect(translateServerError('Area not found.', fr), 'Zone introuvable.');
      expect(translateServerError('We don\'t deliver to Goma yet.', fr), 'Nous ne livrons pas encore à Goma.');
      expect(translateServerError('We don\'t deliver to this area yet.', fr), 'Nous ne livrons pas encore dans cette zone.');
      expect(translateServerError('Parcel missing from run TR-0042.', const Strings('en')), 'Parcel missing from run TR-0042.');
    });

    test('every new text exists in English and French', () {
      for (final k in kMessages.keys.where((k) => k.startsWith('run_') || k.startsWith('hop_') || k.startsWith('coverage_') || k.contains('run_on_road') || k == 'kind_run')) {
        final m = kMessages[k]!;
        expect(m.$1.trim(), isNotEmpty, reason: k);
        expect(m.$2.trim(), isNotEmpty, reason: k);
        expect(m.$1, isNot(equals(m.$2)), reason: '$k has the same text in both languages');
      }
    });
  });
}
