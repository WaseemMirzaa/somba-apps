// The label of the box a customer sends back: parsing `parcels:forReturn`, the store that keeps it, and the card on the
// return screen (QR, code, "write it on the package"), in English and French, at 200% text.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/more/aftersale_request.dart';
import 'package:lipcart/services/aftersale_models.dart';
import 'package:lipcart/services/aftersale_store.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/socket_service.dart';
import 'package:lipcart/theme/app_theme.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'aftersale_helpers.dart';
import 'button_rules.dart';
import 'gap_helpers.dart';

const _label = {'code': 'PKG-7KQ2M9XA', 'boxNo': 1, 'boxCount': 1, 'orderReference': 'SOM-1042'};

void main() {
  late AsFake server;

  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  setUp(() async {
    server = await asReset();
    server.handlers['disputes:get'] = (b) => disputeJson(id: b!['id'] as String, stage: 'pickup', pickupTaskId: 't1', messages: []);
    server.handlers['parcels:forReturn'] = (_) => _label;
  });
  tearDown(asTearDown);

  Future<void> open(WidgetTester tester, {String lang = 'en', double scale = 1}) async {
    await Strings.setLang(lang, persist: false);
    gapTallViewport(tester);
    await tester.pumpWidget(KeyedSubtree(
      key: UniqueKey(),
      child: MaterialApp(
        builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)), child: child!),
        theme: AppTheme.light(),
        locale: Locale(lang),
        supportedLocales: const [Locale('en'), Locale('fr')],
        localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
        home: const ReturnStatusScreen(requestId: 'd1'),
      ),
    ));
    await asSettle(tester);
  }

  group('parsing the answer', () {
    test('an object becomes a label', () {
      final p = ReturnParcel.tryParse(_label)!;
      expect((p.code, p.boxNo, p.boxCount, p.orderReference, p.isSingleBox), ('PKG-7KQ2M9XA', 1, 1, 'SOM-1042', true));
      expect(ReturnParcel.tryParse({'code': 'PKG-AAAA2222', 'boxNo': 2, 'boxCount': 3})!.isSingleBox, isFalse);
    });

    test('null, or a payload without a code, is no label', () {
      expect(ReturnParcel.tryParse(null), isNull);
      expect(ReturnParcel.tryParse(<String, dynamic>{}), isNull);
      expect(ReturnParcel.tryParse({'code': '  '}), isNull);
    });

    test('the socket ack: data null is "not yet", an error fails with the server message', () async {
      final none = Completer<dynamic>();
      SocketService.settleAck(none, {'ok': true, 'data': null});
      expect(ReturnParcel.tryParse(await none.future), isNull);

      final some = Completer<dynamic>();
      SocketService.settleAck(some, {'ok': true, 'data': _label});
      expect(ReturnParcel.tryParse(await some.future)!.code, 'PKG-7KQ2M9XA');

      final bad = Completer<dynamic>();
      SocketService.settleAck(bad, {'ok': false, 'error': 'Not found'});
      await expectLater(bad.future, throwsA(isA<ApiException>()));
    });
  });

  group('the store', () {
    test('null before the pickup exists, the code after, the same code on every read', () async {
      final store = AfterSaleStore.instance;
      server.handlers['parcels:forReturn'] = (_) => null;
      expect(await store.parcelForReturn('d1'), isNull);
      expect(store.parcelOf('d1'), isNull);

      server.handlers['parcels:forReturn'] = (_) => _label;
      expect((await store.parcelForReturn('d1'))!.code, 'PKG-7KQ2M9XA');
      expect(store.parcelOf('d1')!.code, 'PKG-7KQ2M9XA');

      final before = server.countOf('parcels:forReturn');
      expect((await store.parcelForReturn('d1'))!.code, 'PKG-7KQ2M9XA');
      expect(server.countOf('parcels:forReturn'), before, reason: 'a known label is not asked for again');
      expect(server.bodiesOf('parcels:forReturn').first, {'returnId': 'd1'});
    });

    test('a failure surfaces to the caller and leaves nothing cached', () async {
      server.handlers['parcels:forReturn'] = (_) => throw asServerError('Not found');
      await expectLater(AfterSaleStore.instance.parcelForReturn('d1'), throwsA(isA<ApiException>()));
      expect(AfterSaleStore.instance.parcelOf('d1'), isNull);
    });
  });

  group('the card', () {
    for (final lang in ['en', 'fr']) {
      testWidgets('shows the QR, the code, the box and the write-it line ($lang)', (tester) async {
        await open(tester, lang: lang);
        final s = Strings.current;
        expect(find.byKey(const ValueKey('return-parcel')), findsOneWidget);
        expect(find.byType(QrImageView), findsOneWidget);
        expect(find.byKey(const ValueKey('parcel-qr-PKG-7KQ2M9XA')), findsOneWidget);
        expect(tester.widget<Text>(find.byKey(const ValueKey('parcel-code'))).data, 'PKG-7KQ2M9XA');
        expect(tester.widget<Text>(find.byKey(const ValueKey('parcel-box'))).data, '${s.asPlBox(1, 1)} · SOM-1042');
        expect(tester.widget<Text>(find.byKey(const ValueKey('parcel-write'))).data, s.asPlWrite);
        expect(s.asPlWrite, lang == 'en' ? contains('Write this code on the package') : contains('Écrivez ce code sur le colis'));
        expect(find.byTooltip(s.asPlCopy), findsOneWidget);
        expectButtonRules(tester);
      });
    }

    testWidgets('"Box n of m" when the return has several boxes', (tester) async {
      server.handlers['parcels:forReturn'] = (_) => {..._label, 'boxNo': 2, 'boxCount': 3};
      await open(tester);
      expect(tester.widget<Text>(find.byKey(const ValueKey('parcel-box'))).data, 'Box 2 of 3 · SOM-1042');
    });

    for (final lang in ['en', 'fr']) {
      testWidgets('survives 200% text without overflow ($lang)', (tester) async {
        await open(tester, lang: lang, scale: 2);
        expect(tester.takeException(), isNull);
        expect(find.byKey(const ValueKey('parcel-code')), findsOneWidget);
        expect(find.byType(QrImageView), findsOneWidget);
      });
    }

    testWidgets('copy puts the code on the clipboard and says so', (tester) async {
      String? copied;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String?;
        return null;
      });
      addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
      await open(tester);
      await asTap(tester, 'parcel-copy');
      await asSettle(tester);
      expect(copied, 'PKG-7KQ2M9XA');
      expect(asSnack(tester), 'Code copied');
    });

    testWidgets('no label yet: a muted line, no QR', (tester) async {
      server.handlers['parcels:forReturn'] = (_) => null;
      await open(tester);
      expect(tester.widget<Text>(find.byKey(const ValueKey('parcel-pending'))).data, 'The label appears once your return is approved.');
      expect(find.byType(QrImageView), findsNothing);
    });

    testWidgets('no label yet, in French', (tester) async {
      server.handlers['parcels:forReturn'] = (_) => null;
      await open(tester, lang: 'fr');
      expect(find.text('L’étiquette apparaît dès que votre retour est approuvé.'), findsOneWidget);
    });

    testWidgets('a failure: a snackbar, and a retry that brings the label', (tester) async {
      var fail = true;
      server.handlers['parcels:forReturn'] = (_) => fail ? throw asServerError('Not found') : _label;
      await open(tester);
      expect(asSnack(tester), isNotNull);
      expect(find.byKey(const ValueKey('parcel-retry')), findsOneWidget);
      expect(find.byType(QrImageView), findsNothing);
      fail = false;
      await asTap(tester, 'parcel-retry');
      await asSettle(tester);
      expect(find.byType(QrImageView), findsOneWidget);
    });

    testWidgets('moving from approved to pickup fetches the label', (tester) async {
      var stage = 'approved';
      server.handlers['disputes:get'] = (b) => disputeJson(stage: stage, messages: []);
      server.handlers['parcels:forReturn'] = (_) => stage == 'pickup' ? _label : null;
      await open(tester);
      expect(find.byKey(const ValueKey('parcel-pending')), findsOneWidget);
      stage = 'pickup';
      AfterSaleStore.instance.onDisputePush(disputeJson(stage: 'pickup', updatedAt: '2026-10-25T10:00:00Z', messages: []));
      await asSettle(tester);
      expect(find.byType(QrImageView), findsOneWidget);
    });

    for (final stage in ['received', 'closed', 'awaiting_seller']) {
      testWidgets('hidden at stage $stage', (tester) async {
        server.handlers['disputes:get'] = (b) => disputeJson(stage: stage, messages: []);
        await open(tester);
        expect(find.byKey(const ValueKey('return-parcel')), findsNothing);
        expect(server.countOf('parcels:forReturn'), 0);
      });
    }

    testWidgets('hidden once the return is resolved', (tester) async {
      server.handlers['disputes:get'] = (b) => disputeJson(stage: 'pickup', status: 'resolved', messages: []);
      await open(tester);
      expect(find.byKey(const ValueKey('return-parcel')), findsNothing);
    });
  });
}
