// The after-sale store: lists, details with their thread, the calls it makes, and the live pushes (through the
// feature hook, like the app does).
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/services/aftersale_store.dart';
import 'package:lipcart/services/feature_hooks.dart';
import 'package:lipcart/services/realtime_store.dart';

import 'aftersale_helpers.dart';

void main() {
  late AsFake server;
  final store = AfterSaleStore.instance;

  setUpAll(() => initializeDateFormatting());
  setUp(() async {
    server = await asReset();
  });
  tearDown(asTearDown);

  group('loading', () {
    test('the list is newest first and loads the three kinds of request', () async {
      server.handlers['disputes:list'] = (_) => [
            disputeJson(id: 'a', reference: 'RET-A', createdAt: '2026-10-01T00:00:00Z'),
            disputeJson(id: 'b', reference: 'RET-B', createdAt: '2026-10-20T00:00:00Z'),
            oldDisputeJson(id: 'c'),
          ];
      server.handlers['replacements:mine'] = (_) => [replacementJson(id: 'r1'), replacementJson(id: 'r2', createdAt: '2026-10-25T00:00:00Z')];
      server.handlers['exchanges:mine'] = (_) => [exchangeJson()];
      await store.loadAll();
      expect(store.disputes.map((d) => d.id), ['b', 'a', 'c']);
      expect(store.replacements.map((r) => r.id), ['r2', 'r1']);
      expect(store.exchanges.single.id, 'x1');
      expect(store.disputesLoaded && store.replacementsLoaded && store.exchangesLoaded, isTrue);
      expect(store.openCount, 3 + 2 + 1);
    });

    test('a failing list does not stop the others (hydrate swallows it)', () async {
      server.handlers['disputes:list'] = (_) => throw asServerError('boom');
      server.handlers['replacements:mine'] = (_) => [replacementJson()];
      await store.loadAll();
      expect(store.disputesLoaded, isFalse);
      expect(store.replacements, hasLength(1));
    });

    test('a reloaded list keeps the thread of a request that was opened', () async {
      server.handlers['disputes:get'] = (_) => disputeJson(messages: [msgJ('m1')]);
      server.handlers['disputes:list'] = (_) => [disputeJson(stage: 'escalated')];
      await store.fetchDispute('d1');
      await store.loadDisputes();
      final d = store.disputeById('d1')!;
      expect(d.stage, 'escalated');
      expect(d.messages, hasLength(1));
    });

    test('fetching a request asks disputes:get with its id; tryFetch answers null on failure', () async {
      server.handlers['disputes:get'] = (b) => b!['id'] == 'd1' ? disputeJson() : throw asServerError('Dispute not found.');
      expect((await store.fetchDispute('d1')).reference, 'RET-1001');
      expect(await store.tryFetchDispute('nope'), isNull);
      server.handlers['replacements:get'] = (_) => replacementJson();
      server.handlers['exchanges:get'] = (_) => throw asServerError('Exchange not found.');
      expect((await store.tryFetchReplacement('r1'))!.reference, 'REP-2001');
      expect(await store.tryFetchExchange('x1'), isNull);
    });
  });

  group('calls', () {
    test('eligibility, open (with siblings), reply, escalate and cancel send the contract payloads', () async {
      server.handlers['disputes:eligibility'] = (_) => eligibilityJson();
      server.handlers['disputes:open'] = (_) => {...disputeJson(id: 'n1'), 'siblings': ['n2', 'n3']};
      server.handlers['disputes:reply'] = (b) => msgJ('m9', role: 'customer', text: b!['message'] as String);
      server.handlers['disputes:escalate'] = (_) => disputeJson(stage: 'escalated');
      server.handlers['disputes:cancel'] = (_) => disputeJson(status: 'rejected', stage: 'closed', resolution: 'Cancelled by the customer');

      final e = await store.eligibility('o1');
      expect(e.eligible, isTrue);
      expect(server.bodiesOf('disputes:eligibility').single, {'orderId': 'o1'});

      final res = await store.open(
        orderId: 'o1',
        type: 'return',
        reason: 'Torn sole',
        category: 'damaged',
        items: [
          {'itemId': 'oi1', 'qty': 2}
        ],
        attachments: ['/uploads/a.jpg'],
        refundTo: 'phone',
      );
      expect(res.isSplit, isTrue);
      expect(res.siblings, ['n2', 'n3']);
      expect(res.dispute.id, 'n1');
      expect(server.bodiesOf('disputes:open').single, {
        'orderId': 'o1',
        'type': 'return',
        'reason': 'Torn sole',
        'category': 'damaged',
        'items': [
          {'itemId': 'oi1', 'qty': 2}
        ],
        'attachments': ['/uploads/a.jpg'],
        'refundTo': 'phone',
      });
      expect(store.disputes.map((d) => d.id), contains('n1'), reason: 'the new request is in the list at once');

      await store.fetchDispute('d1');
      await store.reply('d1', 'Here it is', attachments: ['/uploads/b.jpg']);
      expect(server.bodiesOf('disputes:reply').single, {'id': 'd1', 'message': 'Here it is', 'attachments': ['/uploads/b.jpg']});
      await store.escalate('d1', note: '  please help ');
      expect(server.bodiesOf('disputes:escalate').single, {'id': 'd1', 'note': 'please help'});
      await store.escalate('d1');
      expect(server.bodiesOf('disputes:escalate').last, {'id': 'd1'});
      await store.cancel('d1');
      expect(server.bodiesOf('disputes:cancel').single, {'id': 'd1'});
      expect(store.disputeById('d1')!.wasCancelled, isTrue);
    });

    test('a dispute without lines or photos sends neither key (the whole order)', () async {
      server.handlers['disputes:open'] = (_) => disputeJson(type: 'dispute');
      await store.open(orderId: 'o1', type: 'dispute', reason: 'Never arrived', category: 'not_received');
      expect(server.bodiesOf('disputes:open').single, {'orderId': 'o1', 'type': 'dispute', 'reason': 'Never arrived', 'category': 'not_received'});
    });

    test('replacements:create and exchanges:create send the contract payloads and land in the lists', () async {
      server.handlers['replacements:create'] = (_) => replacementJson();
      server.handlers['exchanges:create'] = (_) => exchangeJson();
      await store.createReplacement(orderId: 'o1', sku: 'p1', productName: 'Shoe', reason: 'Torn', condition: 'damaged', qty: 2, attachments: ['/uploads/a.jpg']);
      expect(server.bodiesOf('replacements:create').single,
          {'orderId': 'o1', 'sku': 'p1', 'productName': 'Shoe', 'reason': 'Torn', 'condition': 'damaged', 'qty': 2, 'attachments': ['/uploads/a.jpg']});
      await store.createExchange(orderId: 'o1', fromSku: 'p1', fromName: 'Shoe', toSku: 'p1', toName: 'Shoe', toVariant: 'Size: 42', qty: 1, reason: 'Too small');
      expect(server.bodiesOf('exchanges:create').single,
          {'orderId': 'o1', 'fromSku': 'p1', 'fromName': 'Shoe', 'toSku': 'p1', 'toName': 'Shoe', 'toVariant': 'Size: 42', 'qty': 1, 'reason': 'Too small'});
      expect(store.replacements.single.id, 'r1');
      expect(store.exchanges.single.id, 'x1');
    });
  });

  group('live pushes through the feature hook', () {
    test('the module is registered and binds the contract events', () {
      final hooks = buildFeatureHooks().where((h) => h.name == 'aftersale').toList();
      expect(hooks, hasLength(1));
      expect(hooks.single.pushes.keys, containsAll(['dispute:created', 'dispute:updated', 'dispute:message', 'replacement:updated', 'exchange:updated']));
      expect(hooks.single.hydrate, isNotNull);
      expect(hooks.single.reset, isNotNull);
    });

    test('dispute:created adds a request, dispute:updated changes it', () {
      RealtimeStore.instance.debugEmit('dispute:created', disputeJson(id: 'z', reference: 'DP-5', type: 'dispute'));
      expect(store.disputeById('z')!.reference, 'DP-5');
      RealtimeStore.instance.debugEmit('dispute:updated', disputeJson(id: 'z', reference: 'DP-5', type: 'dispute', stage: 'seller_replied', updatedAt: '2026-10-25T00:00:00Z'));
      expect(store.disputes, hasLength(1));
      expect(store.disputeById('z')!.stage, 'seller_replied');
    });

    test('an older copy never replaces a newer one', () {
      RealtimeStore.instance.debugEmit('dispute:updated', disputeJson(stage: 'escalated', updatedAt: '2026-10-25T10:00:00Z'));
      RealtimeStore.instance.debugEmit('dispute:updated', disputeJson(stage: 'awaiting_seller', updatedAt: '2026-10-25T09:00:00Z'));
      expect(store.disputeById('d1')!.stage, 'escalated');
    });

    test('an update keeps the thread already fetched', () async {
      server.handlers['disputes:get'] = (_) => disputeJson(messages: [msgJ('m1'), msgJ('m2')]);
      await store.fetchDispute('d1');
      RealtimeStore.instance.debugEmit('dispute:updated', disputeJson(stage: 'approved', updatedAt: '2026-10-26T00:00:00Z'));
      final d = store.disputeById('d1')!;
      expect(d.stage, 'approved');
      expect(d.messages, hasLength(2));
    });

    test('dispute:message appends to an opened thread once, however many times it is delivered', () async {
      server.handlers['disputes:get'] = (_) => disputeJson(messages: [msgJ('m1')]);
      await store.fetchDispute('d1');
      final push = {'disputeId': 'd1', 'message': msgJ('m2', text: 'We can help')};
      RealtimeStore.instance.debugEmit('dispute:message', push);
      RealtimeStore.instance.debugEmit('dispute:message', push);
      final d = store.disputeById('d1')!;
      expect(d.messages!.map((m) => m.id), ['m1', 'm2']);
      expect(d.messageCount, 2);
    });

    test('my own reply is not doubled when its push arrives too', () async {
      server.handlers['disputes:get'] = (_) => disputeJson(messages: []);
      server.handlers['disputes:reply'] = (_) => msgJ('m7', role: 'customer', text: 'Hi');
      await store.fetchDispute('d1');
      await store.reply('d1', 'Hi');
      RealtimeStore.instance.debugEmit('dispute:message', {'disputeId': 'd1', 'message': msgJ('m7', role: 'customer', text: 'Hi')});
      expect(store.disputeById('d1')!.messages, hasLength(1));
    });

    test('a message for a request whose thread was never opened is ignored (the screen fetches it)', () {
      RealtimeStore.instance.debugEmit('dispute:created', disputeJson());
      RealtimeStore.instance.debugEmit('dispute:message', {'disputeId': 'd1', 'message': msgJ('m1')});
      expect(store.disputeById('d1')!.messages, isNull);
    });

    test('bad pushes are ignored', () {
      RealtimeStore.instance.debugEmit('dispute:updated', 'nonsense');
      RealtimeStore.instance.debugEmit('dispute:message', {'disputeId': '', 'message': 3});
      RealtimeStore.instance.debugEmit('replacement:updated', null);
      expect(store.disputes, isEmpty);
      expect(store.replacements, isEmpty);
    });

    test('replacement:updated and exchange:updated add and update', () {
      RealtimeStore.instance.debugEmit('replacement:updated', replacementJson(status: 'approved', updatedAt: '2026-10-25T00:00:00Z'));
      RealtimeStore.instance.debugEmit('replacement:updated', replacementJson(status: 'dispatched', deliveryTaskId: 't1', updatedAt: '2026-10-26T00:00:00Z'));
      expect(store.replacements.single.status, 'dispatched');
      expect(store.replacements.single.deliveryTaskId, 't1');
      RealtimeStore.instance.debugEmit('exchange:updated', exchangeJson(status: 'approved'));
      expect(store.exchanges.single.status, 'approved');
    });

    test('listeners are told of every change', () {
      var n = 0;
      void bump() => n++;
      store.addListener(bump);
      RealtimeStore.instance.debugEmit('dispute:created', disputeJson());
      RealtimeStore.instance.debugEmit('exchange:updated', exchangeJson());
      store.removeListener(bump);
      expect(n, 2);
    });

    test('signing out forgets everything', () async {
      RealtimeStore.instance.debugEmit('dispute:created', disputeJson());
      RealtimeStore.instance.debugEmit('exchange:updated', exchangeJson());
      for (final h in buildFeatureHooks()) {
        h.reset?.call();
      }
      expect(store.disputes, isEmpty);
      expect(store.exchanges, isEmpty);
      expect(store.disputeById('d1'), isNull);
    });
  });
}
