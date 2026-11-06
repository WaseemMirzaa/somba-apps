// Help contact options (support ticket shortcut, phone, e-mail, WhatsApp from the platform settings) and "cash on
// delivery shows nowhere while `codEnabled` is not true" (order page, receipt, payment names).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/more/help_contact.dart';
import 'package:lipcart/screens/more/order_after_sale.dart' show receiptText;
import 'package:lipcart/screens/more/order_screens.dart';
import 'package:lipcart/screens/more/support_extra.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/util/payment_label.dart';

import 'button_rules.dart';
import 'engage_helpers.dart';
import 'gap_helpers.dart';

final _opened = <Uri>[];
String? _clipboard;

void _settings({String phone = '+243 970 000 000', String email = 'help@somba.example', String whatsapp = '+243 970 000 111'}) {
  RealtimeStore.instance.applySettings({'supportPhone': phone, 'supportEmail': email, 'supportWhatsapp': whatsapp});
  // ignore: invalid_use_of_protected_member
  RealtimeStore.instance.notifyListeners();
}

OrderDto _order({String method = 'cod', String status = 'confirmed'}) => OrderDto.fromJson({
      'id': 'o1',
      'reference': 'SOM-2042',
      'customerName': 'Aline Mbuyi',
      'status': status,
      'paymentMethod': method,
      'subtotalUsd': 20,
      'deliveryFeeUsd': 3,
      'totalUsd': 23,
      'createdAt': '2026-10-01T09:30:00',
      'items': [
        {'productId': 'p1', 'productName': 'Phone case', 'qty': 1, 'priceUsd': 20},
      ],
    });

Future<void> _help(WidgetTester tester, {String lang = 'en', double scale = 1}) async {
  gapTallViewport(tester);
  await Strings.setLang(lang, persist: false);
  await tester.pumpWidget(gapAppScaled(HelpScreen(locale: Locale(lang)), lang: lang, scale: scale));
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  setUp(() async {
    await engageReset();
    _opened.clear();
    _clipboard = null;
    debugLaunch = (uri) async {
      _opened.add(uri);
      return true;
    };
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') _clipboard = (call.arguments as Map)['text'] as String?;
      return null;
    });
  });
  tearDown(() {
    debugLaunch = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null);
    RealtimeStore.instance
      ..applySettings({'supportPhone': '', 'supportEmail': '', 'supportWhatsapp': '', 'codEnabled': 'false'})
      ..orders.clear();
    engageTearDown();
  });

  group('Help: contact options', () {
    testWidgets('the ticket shortcut stays, and the phone, e-mail and WhatsApp the platform publishes are listed', (tester) async {
      _settings();
      await _help(tester);
      expect(find.text('Contact support'), findsOneWidget, reason: 'the support ticket shortcut');
      expect(find.text('Contact us'), findsOneWidget);
      for (final (id, label, value) in [('phone', 'Call us', '+243 970 000 000'), ('email', 'Send an e-mail', 'help@somba.example'), ('whatsapp', 'Chat on WhatsApp', '+243 970 000 111')]) {
        final row = find.byKey(ValueKey('help-contact-$id'));
        expect(row, findsOneWidget, reason: id);
        expect(find.descendant(of: row, matching: find.text(label)), findsOneWidget);
        expect(find.descendant(of: row, matching: find.text(value)), findsOneWidget);
      }
      expect(find.text('How do I contact support?'), findsOneWidget, reason: 'the FAQ is still there');
    });

    testWidgets('each row opens the right link: tel:, mailto: and the wa.me chat', (tester) async {
      _settings();
      await _help(tester);
      for (final id in ['phone', 'email', 'whatsapp']) {
        await tester.tap(find.byKey(ValueKey('help-contact-$id')));
        await tester.pump();
      }
      expect(_opened.map((u) => u.toString()), ['tel:+243970000000', 'mailto:help@somba.example', 'https://wa.me/243970000111']);
    });

    testWidgets('only what is set is offered; with nothing set the section is gone', (tester) async {
      _settings(phone: '', whatsapp: '');
      await _help(tester);
      expect(find.byKey(const ValueKey('help-contact-email')), findsOneWidget);
      expect(find.byKey(const ValueKey('help-contact-phone')), findsNothing);
      expect(find.byKey(const ValueKey('help-contact-whatsapp')), findsNothing);
      _settings(phone: '', email: '', whatsapp: '');
      await _help(tester);
      expect(find.text('Contact us'), findsNothing);
      expect(find.byKey(const ValueKey('help-contacts')), findsNothing);
      expect(find.text('Contact support'), findsOneWidget);
    });

    testWidgets('a change an admin makes while Help is open shows at once', (tester) async {
      await _help(tester);
      expect(find.byKey(const ValueKey('help-contact-phone')), findsNothing);
      RealtimeStore.instance.applySettings({'supportPhone': '+243 970 123 456'});
      // ignore: invalid_use_of_protected_member
      RealtimeStore.instance.notifyListeners();
      await tester.pump();
      expect(find.byKey(const ValueKey('help-contact-phone')), findsOneWidget);
    });

    testWidgets('a device that cannot open the link copies the value and says so (French too)', (tester) async {
      _settings();
      debugLaunch = (uri) async => false;
      await _help(tester, lang: 'fr');
      await tester.tap(find.byKey(const ValueKey('help-contact-email')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(_clipboard, 'help@somba.example');
      expect(find.text('Impossible de l’ouvrir sur cet appareil. Copié : help@somba.example'), findsOneWidget);
      debugLaunch = (uri) async => throw PlatformException(code: 'x');
      await tester.pump(const Duration(seconds: 5));
      await tester.tap(find.byKey(const ValueKey('help-contact-phone')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(_clipboard, '+243 970 000 000');
    });

    testWidgets('in French at 130% text on a narrow phone: no overflow, one filled button, no icon on a label button', (tester) async {
      _settings();
      tester.view.physicalSize = const Size(360 * 3, 780 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await Strings.setLang('fr', persist: false);
      await tester.pumpWidget(gapAppScaled(const HelpScreen(), lang: 'fr', scale: 1.3));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Nous contacter'), findsOneWidget);
      expect(find.text('Discuter sur WhatsApp'), findsOneWidget);
      expect(tester.takeException(), isNull);
      expectButtonRules(tester);
    });

    test('the WhatsApp link wants digits only, country code first; a number too short makes none', () {
      expect(whatsappLink('+243 970 000 111').toString(), 'https://wa.me/243970000111');
      expect(whatsappLink('(0)970-000-111').toString(), 'https://wa.me/0970000111');
      expect(whatsappLink('12'), isNull);
    });
  });

  group('cash on delivery is hidden while codEnabled is not true', () {
    for (final lang in ['en', 'fr']) {
      testWidgets('the order page names no cash method and no "pay on delivery" ($lang)', (tester) async {
        await Strings.setLang(lang, persist: false);
        final s = Strings(lang);
        RealtimeStore.instance.codEnabled = false;
        RealtimeStore.instance.orders.add(_order());
        gapTallViewport(tester);
        await tester.pumpWidget(gapApp(OrderDetailScreen(locale: Locale(lang), orderId: 'o1'), lang: lang));
        await tester.pump(const Duration(milliseconds: 300));
        expect(find.textContaining(s.payCod), findsNothing);
        expect(find.textContaining(s.orderPayOnDelivery), findsNothing);
        expect(find.textContaining(s.t('payment')), findsWidgets, reason: 'a plain "Payment" instead');
      });

      testWidgets('with the platform setting on it still reads as before ($lang)', (tester) async {
        await Strings.setLang(lang, persist: false);
        final s = Strings(lang);
        RealtimeStore.instance.codEnabled = true;
        RealtimeStore.instance.orders.add(_order(status: 'pending'));
        RealtimeStore.instance.payments.add(PaymentDto(id: 'pay1', reference: 'PAY-1', orderId: 'o1', orderReference: 'SOM-2042', method: 'cod', amountUsd: 23, status: 'pending'));
        addTearDown(RealtimeStore.instance.payments.clear);
        gapTallViewport(tester);
        await tester.pumpWidget(gapApp(OrderDetailScreen(locale: Locale(lang), orderId: 'o1'), lang: lang));
        await tester.pump(const Duration(milliseconds: 300));
        expect(find.text('${s.orderPayOnDelivery} · ${s.payCod}'), findsOneWidget);
      });
    }

    test('the receipt and every payment name follow the same rule', () {
      const en = Strings('en');
      expect(receiptText(en, _order()), isNot(contains('Cash on Delivery')));
      expect(receiptText(en, _order()), contains('Paid with: Payment'));
      expect(receiptText(en, _order(method: 'airtel_money')), contains('Airtel Money'));
      expect(shownPaymentLabel(en, 'cod', codEnabled: false), 'Payment');
      expect(shownPaymentLabel(en, 'cod', codEnabled: true), 'Cash on Delivery');
      expect(shownPaymentLabel(en, 'wallet', codEnabled: false), en.paymentLabel('wallet'));
      expect(showsCod(true, codEnabled: false), isFalse);
      expect(showsCod(true, codEnabled: true), isTrue);
      expect(showsCod(false, codEnabled: true), isFalse);
    });

    test('nothing in the FAQ or the help text mentions cash', () {
      for (final lang in ['en', 'fr']) {
        final s = Strings(lang);
        final text = [s.faqPayQ, s.faqPayA, s.faqFeesA, s.faqFailedA, s.faqContactA].join(' ').toLowerCase();
        expect(text, isNot(contains('cash')));
        expect(text, isNot(contains('espèces')));
        expect(text, isNot(contains('à la livraison')));
      }
    });
  });
}
