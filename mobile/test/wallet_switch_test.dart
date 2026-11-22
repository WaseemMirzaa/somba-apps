// The wallet switch (public setting `walletEnabled`, default on): while it is off the app shows nothing of the wallet.
// The account menu and the profile stat, the wallet screen (route guard), the checkout tile, the wallet refund choice and every
// text that names the wallet are gone; they come back when the admin switches it on again, live (`settings:updated`).
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/messages.dart';
import 'package:lipcart/l10n/messages_wallet_off.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/account_screen.dart';
import 'package:lipcart/screens/checkout_screen.dart';
import 'package:lipcart/screens/notice_router.dart';
import 'package:lipcart/screens/wallet_screen.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/theme/app_theme.dart';

import 'gap_helpers.dart';

void _setWallet(bool on) => RealtimeStore.instance
  ..applySettings({'walletEnabled': on ? 'true' : 'false'})
  ..notifyListeners();

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });

  setUp(() async {
    await gapReset();
    RealtimeStore.instance.walletBalance = 1000;
    RealtimeStore.instance.requirePinnedAddress = false;
    RealtimeStore.instance.user = gapUser(phone: '+243812345678');
  });

  tearDown(() {
    RealtimeStore.instance.applySettings({'walletEnabled': 'true'});
    gapTearDown();
  });

  group('the setting', () {
    test('is on by default, off only for "false", a push without the key changes nothing, and Strings follow it', () {
      final store = RealtimeStore.instance;
      expect(store.walletEnabled, isTrue);
      expect(Strings.walletOff, isFalse);
      store.applySettings({'fxRate': 2850});
      expect(store.walletEnabled, isTrue);
      store.applySettings({'walletEnabled': 'false'});
      expect(store.walletEnabled, isFalse);
      expect(Strings.walletOff, isTrue);
      store.applySettings({'fxRate': 2850});
      expect(store.walletEnabled, isFalse, reason: 'a push without the key keeps the value');
      store.applySettings({'walletEnabled': 'true'});
      expect(store.walletEnabled, isTrue);
      expect(Strings.walletOff, isFalse);
      store.applySettings({'walletEnabled': 'whatever'});
      expect(store.walletEnabled, isTrue, reason: 'anything but "false" is on');
    });
  });

  group('the texts that name the wallet', () {
    test('every one has a wallet-free twin in both languages, with the same placeholders, and the twin names no wallet', () {
      for (final e in kWalletOffKeys.entries) {
        final base = kMessages[e.key], twin = kMessages[e.value];
        expect(base, isNotNull, reason: '${e.key} exists');
        expect(twin, isNotNull, reason: '${e.value} exists');
        final holders = RegExp(r'\{(\w+)\}');
        for (final lang in [0, 1]) {
          final twinText = lang == 0 ? twin!.$1 : twin!.$2;
          final baseText = lang == 0 ? base!.$1 : base!.$2;
          expect(twinText.toLowerCase(), isNot(contains('wallet')), reason: e.value);
          expect(twinText.toLowerCase(), isNot(contains('portefeuille')), reason: e.value);
          // The twin never asks for an argument the caller does not pass.
          expect(holders.allMatches(twinText).map((m) => m[1]).toSet().difference(holders.allMatches(baseText).map((m) => m[1]).toSet()), isEmpty, reason: e.value);
        }
      }
    });

    test('Strings.t reads the twin while the wallet is off and the ordinary text when it is on', () {
      const en = Strings('en');
      expect(en.lineRefundedWallet('\$5'), contains('wallet'));
      _setWallet(false);
      expect(en.lineRefundedWallet('\$5'), 'Refunded \$5');
      expect(const Strings('fr').asExRefunded('5 \$'), isNot(contains('portefeuille')));
      expect(en.asExDiffPay('\$7'), contains('same price or less'));
      _setWallet(true);
      expect(en.lineRefundedWallet('\$5'), contains('wallet'));
    });
  });

  group('a wallet notice', () {
    test('opens the wallet while it is on and the inbox while it is off; an order notice is unchanged', () {
      bool none(String id) => false;
      expect(noticeRoute('payment', 'pay-1', hasOrder: none).dest, NoticeDest.wallet);
      expect(noticeRoute('payment', 'pay-1', hasOrder: none, walletEnabled: false).dest, NoticeDest.notifications);
      expect(noticeRoute('payment', 'o1', hasOrder: (id) => id == 'o1', walletEnabled: false).dest, NoticeDest.order);
    });
  });

  for (final lang in ['en', 'fr']) {
    testWidgets('account: the wallet menu entry and the profile stat go, live, and come back ($lang)', (tester) async {
      addTearDown(tester.view.reset);
      await Strings.setLang(lang, persist: false);
      final s = Strings(lang);
      tester.view.physicalSize = const Size(390 * 3, 1700 * 3);
      tester.view.devicePixelRatio = 3;
      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.light(),
        locale: Locale(lang),
        supportedLocales: const [Locale('en'), Locale('fr')],
        localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
        home: AccountScreen(locale: Locale(lang), onLocaleChanged: (_) {}),
      ));
      await tester.pump(const Duration(milliseconds: 400));
      // On: the menu entry and the stat both say "Wallet".
      expect(find.text(s.wallet), findsNWidgets(2));
      _setWallet(false);
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text(s.wallet), findsNothing, reason: 'no wallet menu entry, no wallet stat');
      expect(find.byIcon(Icons.account_balance_wallet_outlined), findsNothing);
      _setWallet(true);
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text(s.wallet), findsNWidgets(2), reason: 'switched on again: everything is back');
    });
  }

  testWidgets('the wallet screen is guarded: reached while off it shows only the clear sentence, and the balance when on', (tester) async {
    addTearDown(tester.view.reset);
    await Strings.setLang('en', persist: false);
    await tester.pumpWidget(gapApp(const WalletScreen(locale: Locale('en'))));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byKey(const ValueKey('wallet-balance')), findsOneWidget);
    _setWallet(false);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byKey(const ValueKey('wallet-balance')), findsNothing);
    expect(find.byKey(const ValueKey('wallet-topup')), findsNothing);
    expect(find.byKey(const ValueKey('wallet-off')), findsOneWidget);
    expect(find.text('The wallet is not available right now.'), findsOneWidget);
    _setWallet(true);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byKey(const ValueKey('wallet-balance')), findsOneWidget);
  });

  testWidgets('checkout: the pay-with-wallet tile is gone while off and back when on; a wallet choice made earlier falls back to mobile money', (tester) async {
    addTearDown(tester.view.reset);
    final store = RealtimeStore.instance;
    store.addresses.add(AddressDto(id: 'a1', label: 'Home', line1: '12 Avenue de la Paix', city: 'Kinshasa', commune: 'Gombe', isDefault: true, geo: (lat: -4.31, lng: 15.31, placeId: null, formatted: null)));
    await Strings.setLang('en', persist: false);
    ShopState.instance.addToCart(productByUuid('p1')!);
    tester.view.physicalSize = const Size(390 * 3, 1500 * 3);
    tester.view.devicePixelRatio = 3;
    await tester.pumpWidget(gapApp(const CheckoutScreen(locale: Locale('en'))));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byKey(const ValueKey('pay-wallet')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('pay-wallet')));
    await tester.pump();
    _setWallet(false);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byKey(const ValueKey('pay-wallet')), findsNothing);
    expect(find.byKey(const ValueKey('pay-airtel_money')), findsOneWidget);
    expect(find.byKey(const ValueKey('mm-phone')), findsOneWidget, reason: 'the selection fell back to mobile money');
    _setWallet(true);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byKey(const ValueKey('pay-wallet')), findsOneWidget);
  });
}
