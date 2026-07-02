// Verifies the French localization helper and that screens render in French.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/theme/app_theme.dart';
import 'package:lipcart/screens/more/shop_extra.dart';
import 'package:lipcart/screens/checkout_screen.dart';

Widget _wrap(Widget child) => MaterialApp(
      theme: AppTheme.light(),
      locale: const Locale('fr'),
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: child,
    );

void main() {
  test('trl returns French for known keys and falls back to English', () {
    expect(trl('fr', 'Follow'), 'Suivre');
    expect(trl('fr', 'Add card'), 'Ajouter une carte');
    expect(trl('fr', 'Returns & exchanges'), 'Retours et échanges');
    expect(trl('en', 'Follow'), 'Follow');
    // Unknown key degrades gracefully to the English source.
    expect(trl('fr', '___missing___'), '___missing___');
  });

  testWidgets('Store screen renders French labels', (tester) async {
    await tester.pumpWidget(_wrap(const StoreScreen(locale: Locale('fr'))));
    await tester.pump();
    expect(find.text('Suivre'), findsWidgets); // Follow button
    expect(find.text('Note'), findsOneWidget); // Rating stat
  });

  testWidgets('Checkout screen renders French section titles', (tester) async {
    await tester.pumpWidget(_wrap(const CheckoutScreen(locale: Locale('fr'))));
    await tester.pump();
    expect(find.text('Vérifiez votre commande'), findsOneWidget);
    expect(find.text('Adresse de livraison'), findsOneWidget);
  });
}
