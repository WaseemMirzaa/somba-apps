// Rule 3 of the UI standard, checked on whatever screen a test has pumped:
// label buttons carry no icon, and at most one filled button is reachable on screen.
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

void expectButtonRules(WidgetTester tester) {
  final buttons = find
      .byWidgetPredicate((w) => w is FilledButton || w is OutlinedButton || w is TextButton || w is ElevatedButton)
      .evaluate()
      .where((e) => !_inside<SegmentedButton>(e)) // its selected check mark is a state, not decoration
      .toList();
  for (final e in buttons) {
    expect(_has<Icon>(e), isFalse, reason: '${e.widget.runtimeType} "${_label(e)}" carries an icon');
  }
  final screen = Offset.zero & (tester.view.physicalSize / tester.view.devicePixelRatio);
  final filled = buttons.where((e) => e.widget is FilledButton && _reachable(tester, e, screen)).map(_label).toList();
  expect(filled.length, lessThanOrEqualTo(1), reason: 'more than one filled button on screen: $filled');
}

/// On screen and not covered (a dialog's barrier hides the screen behind it).
bool _reachable(WidgetTester tester, Element e, Rect screen) {
  final box = e.renderObject;
  if (box is! RenderBox || !box.attached || !box.hasSize) return false;
  final center = box.localToGlobal(box.size.center(Offset.zero));
  if (!screen.contains(center)) return false;
  final hit = HitTestResult();
  tester.binding.hitTestInView(hit, center, tester.view.viewId);
  return hit.path.any((entry) => entry.target == box);
}

bool _inside<T>(Element e) {
  var found = false;
  e.visitAncestorElements((a) => !(found = a.widget is T));
  return found;
}

bool _has<T>(Element e) {
  var found = false;
  void visit(Element c) {
    if (found) return;
    if (c.widget is T) {
      found = true;
    } else {
      c.visitChildren(visit);
    }
  }

  e.visitChildren(visit);
  return found;
}

String _label(Element e) {
  String? text;
  void visit(Element c) {
    if (text != null) return;
    final w = c.widget;
    if (w is Text) {
      text = w.data ?? w.textSpan?.toPlainText();
    } else {
      c.visitChildren(visit);
    }
  }

  e.visitChildren(visit);
  return text ?? '?';
}
