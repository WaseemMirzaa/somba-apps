// C-01 for the wallet top-up: one intent = one key. The app sends `clientRequestId` with `wallet:topup`, reuses it for
// every retry of the same intent (a double tap, a timeout, "failed to reach the network"), and makes a new one when the
// amount / network / phone change or when the attempt reached a final outcome. The fake server below answers like the
// real one (api/src/payments/payments.service.ts `startTopUp` + `earlierTopUp`): the same key is the same top-up.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/wallet_screen.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/models.dart' show PaymentDto;
import 'package:lipcart/services/realtime_store.dart';

import 'gap_helpers.dart';

/// The server's key rule (api/src/payments/topup-request.ts `TOPUP_REQUEST_ID`).
final _serverKeyRule = RegExp(r'^[A-Za-z0-9_-]{8,64}$');

const _sameKeyOtherTopUp = 'This top-up reference was already used for a different top-up.';

/// A fake `wallet:topup` server: writes one payment per key, answers a repeat with that payment, refuses a key reused
/// for another amount or network, and replays a failed first attempt's reason.
class _FakeServer {
  /// Every `wallet:topup` request that arrived, in order.
  final sent = <Map<String, dynamic>>[];

  /// The "database": one row per key.
  final byKey = <String, Map<String, dynamic>>{};

  /// What the next request does instead of the normal answer (a timeout, a refusal…); consumed once.
  Future<dynamic> Function()? next;

  Future<dynamic> call(String event, [Map<String, dynamic>? body]) async {
    expect(event, 'wallet:topup');
    sent.add(Map.of(body!));
    final hook = next;
    next = null;
    if (hook != null) return hook();
    return handle(body);
  }

  dynamic handle(Map<String, dynamic> body) {
    final key = body['clientRequestId'] as String;
    final earlier = byKey[key];
    if (earlier != null) {
      if (earlier['method'] != body['method'] || (earlier['amountUsd'] as num) != (body['amountUsd'] as num)) {
        throw ApiException(_sameKeyOtherTopUp);
      }
      if (earlier['status'] == 'failed') throw ApiException(earlier['failureReason'] as String);
      return earlier;
    }
    return byKey[key] = {
      'id': 'pay-${byKey.length + 1}',
      'reference': 'TOP-${byKey.length + 1}',
      'purpose': 'topup',
      'method': body['method'],
      'amountUsd': body['amountUsd'],
      'status': 'pending',
    };
  }

  List<String> get keys => [for (final b in sent) b['clientRequestId'] as String];
}

void main() {
  setUpAll(() => initializeDateFormatting());

  late _FakeServer server;
  late RealtimeStore store;

  setUp(() async {
    await gapReset();
    store = RealtimeStore.instance;
    store.payments.clear();
    store.failedTopups.clear();
    store.endTopUpAttempt();
    server = _FakeServer();
    store.debugCallRequest = server.call;
  });

  tearDown(() {
    store.endTopUpAttempt();
    store.payments.clear();
    store.failedTopups.clear();
    gapTearDown();
  });

  const phone = '+243 81 234 5678';
  Future<PaymentDto> topUp([double amount = 20, String method = 'airtel_money', String number = phone]) =>
      store.topUpWallet(amount, method: method, phone: number);

  group('the key', () {
    test('it is sent with wallet:topup, and the server accepts its format', () async {
      await topUp();
      expect(server.sent.single['clientRequestId'], matches(_serverKeyRule));
      expect(server.sent.single['amountUsd'], 20);
      expect(server.sent.single['method'], 'airtel_money');
      expect(server.sent.single['phone'], phone);
    });

    test('a retry after "no response" or "no connection" carries the SAME key and does not open a second top-up', () async {
      server.next = () async => throw ApiException.local('err_no_response');
      await expectLater(topUp(), throwsA(isA<ApiException>()));
      expect(store.topUpAttemptKey, isNotNull, reason: 'the outcome is unknown: the attempt stays open');

      server.next = () async => throw ApiException.local('err_no_connection');
      await expectLater(topUp(), throwsA(isA<ApiException>()));

      final p = await topUp();
      expect(server.keys.toSet(), hasLength(1), reason: 'every retry of the same intent carries one key');
      expect(server.keys, hasLength(3));
      expect(server.byKey, hasLength(1), reason: 'the server wrote one top-up');
      expect(p.id, 'pay-1');
      expect(store.payments.where((x) => x.purpose == 'topup'), hasLength(1));
    });

    test('a double tap (two calls in flight) sends one key and creates one top-up', () async {
      await Future.wait([topUp(), topUp()]);
      expect(server.keys.toSet(), hasLength(1));
      expect(server.byKey, hasLength(1));
    });

    test('the same key comes back after the sheet is closed and reopened with the same values (the attempt lives on the store)', () async {
      server.next = () async => throw ApiException.local('err_no_response');
      await expectLater(topUp(), throwsA(isA<ApiException>()));
      final first = store.topUpAttemptKey;
      expect(store.topUpKey(20, method: 'airtel_money', phone: phone), first);
      expect(store.topUpKey(20, method: 'airtel_money', phone: ' $phone '), first, reason: 'stray spaces are not a new intent');
    });

    test('an unexpected (non-API) failure keeps the key too: the retry is safe because the key makes it idempotent', () async {
      server.next = () async => throw StateError('socket closed');
      await expectLater(topUp(), throwsA(isA<StateError>()));
      final first = store.topUpAttemptKey;
      await topUp();
      expect(server.keys, [first, first]);
    });

    test('a different amount, network or phone is a new intent with a new key (never the refused "already used" reply)', () async {
      server.next = () async => throw ApiException.local('err_no_response');
      await expectLater(topUp(), throwsA(isA<ApiException>()));
      final k1 = store.topUpAttemptKey;

      server.next = () async => throw ApiException.local('err_no_response');
      await expectLater(topUp(25), throwsA(isA<ApiException>()));
      final k2 = store.topUpAttemptKey;
      expect(k2, isNot(k1), reason: 'amount changed');

      server.next = () async => throw ApiException.local('err_no_response');
      await expectLater(topUp(25, 'mpesa'), throwsA(isA<ApiException>()));
      final k3 = store.topUpAttemptKey;
      expect(k3, isNot(k2), reason: 'network changed');

      server.next = () async => throw ApiException.local('err_no_response');
      await expectLater(topUp(25, 'mpesa', '+243 99 111 2222'), throwsA(isA<ApiException>()));
      expect(store.topUpAttemptKey, isNot(k3), reason: 'phone changed');
      expect(server.byKey, isEmpty);
    });

    test('after a success the next top-up is a new intent with a new key, even for the same values', () async {
      final a = await topUp();
      expect(store.topUpAttemptKey, isNull, reason: 'a final outcome ends the attempt');
      final b = await topUp();
      expect(server.keys.toSet(), hasLength(2));
      expect(a.id, isNot(b.id), reason: 'two deliberate top-ups are two top-ups');
      expect(server.byKey, hasLength(2));
    });

    test('after a refusal the user must act on, the retry gets a new key (the server would replay the old failure for the old one)', () async {
      server.next = () async => throw ApiException('You already have pending top-ups. Approve or wait for them to expire first.');
      await expectLater(topUp(), throwsA(isA<ApiException>()));
      expect(store.topUpAttemptKey, isNull);
      await topUp();
      expect(server.keys.toSet(), hasLength(2));
    });

    test('a failed first attempt that the server recorded: the retry is a new attempt, not the replayed failure', () async {
      // The first request failed at the provider: the server recorded it under key 1 and answered with the reason.
      server.next = () async {
        server.byKey['recorded'] = {'method': 'airtel_money', 'amountUsd': 20, 'status': 'failed', 'failureReason': 'Payment failed.'};
        throw ApiException('Payment failed.');
      };
      await expectLater(topUp(), throwsA(isA<ApiException>()));
      final p = await topUp();
      expect(p.status, 'pending', reason: 'a new key, so the server does not replay "Payment failed."');
    });

    test('signing out drops the attempt', () async {
      server.next = () async => throw ApiException.local('err_no_response');
      await expectLater(topUp(), throwsA(isA<ApiException>()));
      expect(store.topUpAttemptKey, isNotNull);
      await store.logout();
      expect(store.topUpAttemptKey, isNull);
    });

    test('which failures leave the outcome open', () {
      expect(RealtimeStore.topUpOutcomeUnknown(ApiException.local('err_no_response')), isTrue);
      expect(RealtimeStore.topUpOutcomeUnknown(ApiException.local('err_no_connection')), isTrue);
      expect(RealtimeStore.topUpOutcomeUnknown(ApiException('Payment failed.')), isFalse);
      expect(RealtimeStore.topUpOutcomeUnknown(ApiException.refusal('Verify first', code: 'verification_required')), isFalse);
      expect(RealtimeStore.topUpOutcomeUnknown(StateError('x')), isTrue);
    });
  });

  group('the fake server behaves like the real one (so the tests above mean something)', () {
    test('same key + a different amount or network is refused with the documented message', () async {
      await topUp();
      final key = server.keys.single;
      for (final other in [
        {'amountUsd': 30.0, 'method': 'airtel_money'},
        {'amountUsd': 20.0, 'method': 'mpesa'},
      ]) {
        expect(() => server.handle({'clientRequestId': key, 'phone': phone, ...other}), throwsA(isA<ApiException>().having((e) => e.message, 'message', _sameKeyOtherTopUp)));
      }
    });
  });

  group('the wallet screen', () {
    Future<void> openSheet(WidgetTester tester) async {
      gapTallViewport(tester);
      store.user = gapUser(phone: phone);
      await tester.pumpWidget(gapApp(const WalletScreen(locale: Locale('en'))));
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tap(find.byKey(const ValueKey('wallet-topup')));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
    }

    Future<void> submit(WidgetTester tester) async {
      await tester.ensureVisible(find.byKey(const ValueKey('topup-submit'))); // the sheet scrolls
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('topup-submit')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));
    }

    testWidgets('a retry after a timeout sends the same key; the next top-up after success sends a new one', (tester) async {
      await openSheet(tester);
      server.next = () async => throw ApiException.local('err_no_response');
      await submit(tester);
      expect(find.byKey(const ValueKey('topup-submit')), findsOneWidget, reason: 'the sheet stays open on a failure');
      expect(find.byType(SnackBar), findsOneWidget, reason: 'the failure is said out loud');
      await tester.pump(const Duration(seconds: 6)); // the error snackbar goes away; the next one is not queued behind it
      await submit(tester);
      expect(server.keys, hasLength(2));
      expect(server.keys.toSet(), hasLength(1), reason: 'the retry is the same intent');
      expect(server.byKey, hasLength(1));
      expect(find.byKey(const ValueKey('topup-submit')), findsNothing, reason: 'it started: the sheet closed');
      expect(find.text(Strings('en').topupApproveToast), findsOneWidget);
      expect(find.byKey(const ValueKey('topup-pending')), findsOneWidget);

      await tester.pump(const Duration(seconds: 5));
      await tester.tap(find.byKey(const ValueKey('wallet-topup')));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      await submit(tester);
      expect(server.keys.toSet(), hasLength(2), reason: 'a new deliberate top-up');
      expect(server.byKey, hasLength(2));
    });

    testWidgets('changing the amount between taps changes the key', (tester) async {
      await openSheet(tester);
      server.next = () async => throw ApiException.local('err_no_response');
      await submit(tester);
      await tester.enterText(find.byKey(const ValueKey('topup-amount')), '35');
      await submit(tester);
      expect(server.keys.toSet(), hasLength(2));
      expect(server.sent.last['amountUsd'], 35);
    });
  });
}
