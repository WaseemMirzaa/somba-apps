// Multi-line text fields take the buttons' corner radius; one-line fields keep the theme's pill.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/theme/app_theme.dart';
import 'package:lipcart/widgets/kit.dart';

void main() {
  Future<TextField> field(WidgetTester tester, {required int maxLines, bool obscure = false}) async {
    await tester.pumpWidget(MaterialApp(theme: AppTheme.light(), home: Scaffold(body: AppField(label: 'Details', maxLines: maxLines, obscure: obscure))));
    return tester.widget<TextField>(find.byType(TextField));
  }

  double? radius(TextField f, [InputBorder? Function(InputDecoration)? pick]) {
    final b = (pick ?? (d) => d.border)(f.decoration!);
    return b is OutlineInputBorder ? b.borderRadius.topLeft.x : null;
  }

  testWidgets('a multi-line field uses the button radius in every state', (tester) async {
    final f = await field(tester, maxLines: 5);
    for (final pick in <InputBorder? Function(InputDecoration)>[(d) => d.border, (d) => d.enabledBorder, (d) => d.focusedBorder, (d) => d.errorBorder, (d) => d.focusedErrorBorder]) {
      expect(radius(f, pick), AppRadius.md);
    }
  });

  testWidgets('a one-line field keeps the theme pill (no override)', (tester) async {
    final f = await field(tester, maxLines: 1);
    expect(f.decoration!.border, isNull);
    final themed = Theme.of(tester.element(find.byType(TextField))).inputDecorationTheme.border! as OutlineInputBorder;
    expect(themed.borderRadius.topLeft.x, 100);
  });

  testWidgets('a password field stays one line and keeps the theme pill', (tester) async {
    final f = await field(tester, maxLines: 5, obscure: true);
    expect(f.decoration!.border, isNull);
  });
}
