// Multi-line text fields take the buttons' corner radius (16), in every state.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:somba_rider/theme/app_theme.dart';

void main() {
  testWidgets('AppInput.multiline uses the button radius in every state', (tester) async {
    final d = AppInput.multiline(label: 'Message', error: 'x');
    final buttonShape = AppTheme.light().filledButtonTheme.style!.shape!.resolve({}) as RoundedRectangleBorder;
    final want = (buttonShape.borderRadius as BorderRadius).topLeft.x;
    for (final b in [d.border, d.enabledBorder, d.focusedBorder, d.errorBorder, d.focusedErrorBorder]) {
      expect((b! as OutlineInputBorder).borderRadius.topLeft.x, want);
    }
    expect(want, 16);
  });
}
