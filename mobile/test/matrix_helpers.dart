// Registers the layout matrix for a set of screens (shared by layout_matrix_*_test.dart files, not a test itself):
// each screen is pumped at 360 and 402 pt, in English and French, at text scale 1.0 and 1.3, with the app's real
// fonts, and fails on any overflow, wrapped or cut button label, cut price, or text drawn over other text.
// Button rules (no icon on a label button, at most one filled button on screen) are checked as well.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/theme/app_theme.dart';

import 'button_rules.dart';
import 'gap_helpers.dart';
import 'layout_checks.dart';

/// [seed] prepares the fakes for one language before each pump; [tearDownFakes] undoes them after each test.
/// [afterPump] runs once the screen is up (open a sheet, scroll...) before the checks.
void registerLayoutMatrix(
  Map<String, Widget Function(Locale l)> screens, {
  required Future<void> Function(String lang) seed,
  void Function()? tearDownFakes,
  Future<void> Function(WidgetTester tester, String screen)? afterPump,
  bool buttonRules = true,
}) {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  tearDown(() {
    tearDownFakes?.call();
    gapTearDown();
  });

  for (final e in screens.entries) {
    testWidgets('layout matrix: ${e.key}', (tester) async {
      addTearDown(tester.view.reset);
      final found = <String>[];
      for (final c in layoutConfigs) {
        await seed(c.lang);
        final locale = Locale(c.lang);
        final app = MaterialApp(
          theme: AppTheme.light(),
          locale: locale,
          supportedLocales: const [Locale('en'), Locale('fr')],
          localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
          builder: scaleText(c),
          home: e.value(locale),
        );
        final problems = await layoutProblems(tester, c, app, interact: afterPump == null ? null : () => afterPump(tester, e.key));
        for (final p in problems) {
          found.add('[$c] $p');
        }
        if (buttonRules) {
          try {
            expectButtonRules(tester);
          } on TestFailure catch (f) {
            found.add('[$c] ${f.message}');
          }
        }
      }
      expect(found, isEmpty, reason: found.join('\n'));
    });
  }
}
