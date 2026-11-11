// The profile stats row on the account page: a long franc wallet amount stays on ONE line, shrinks to its cell and never
// touches the vertical divider next to it (it used to wrap and overlap the divider).
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/market_profiles.dart';
import 'package:lipcart/screens/account_screen.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/theme/app_theme.dart';
import 'package:lipcart/util/format.dart';

import 'gap_helpers.dart';
import 'layout_checks.dart' show LayoutConfig, scaleText;

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts(); // real text widths, not the test font
  });

  for (final c in [
    const LayoutConfig(Size(320, 640), 'en', 1.0),
    const LayoutConfig(Size(360, 780), 'en', 1.0),
    const LayoutConfig(Size(360, 780), 'fr', 1.3),
    const LayoutConfig(Size(402, 874), 'en', 1.3),
  ]) {
    testWidgets('account stats: a huge wallet amount is one line and clear of the divider ($c)', (tester) async {
      addTearDown(tester.view.reset);
      await gapReset(lang: c.lang);
      marketNotifier.value = MarketProfileId.drc; // francs: the longest amounts
      RealtimeStore.instance.user = gapUser(phone: '+243812345678'); // a verified phone: no banners in the header
      RealtimeStore.instance.walletBalance = 987654.5; // about "FC 2,765,432,600"
      final amount = money(RealtimeStore.instance.walletBalance);

      final app = MaterialApp(
        theme: AppTheme.light(),
        locale: Locale(c.lang),
        supportedLocales: const [Locale('en'), Locale('fr')],
        localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
        builder: scaleText(c),
        home: AccountScreen(locale: Locale(c.lang), onLocaleChanged: (_) {}),
      );
      tester.view.physicalSize = c.size * 3;
      tester.view.devicePixelRatio = 3;
      await tester.pumpWidget(app);
      await tester.pump(const Duration(milliseconds: 600));
      expect(tester.takeException(), isNull, reason: 'no overflow or other layout error');

      final text = find.text(amount);
      expect(text, findsOneWidget, reason: 'the wallet amount "$amount" is shown');
      final widget = tester.widget<Text>(text);
      expect(widget.maxLines, 1);
      expect(widget.softWrap, false);

      // It is drawn to the right of the last divider and inside the screen, with a margin on both sides.
      final dividers = find.byWidgetPredicate((w) => w is Container && w.constraints == BoxConstraints.tightFor(width: 1, height: 30));
      expect(dividers, findsNWidgets(2));
      final lastDivider = tester.getRect(dividers.last);
      final box = tester.getRect(text);
      expect(box.left, greaterThanOrEqualTo(lastDivider.right + 4), reason: 'clear of the divider: $box vs $lastDivider');
      expect(box.right, lessThanOrEqualTo(c.size.width - 4), reason: 'inside the screen: $box');
      expect(box.height, lessThan(c.scale * 18 * 1.6), reason: 'one line, not two: $box');
    });
  }
}
