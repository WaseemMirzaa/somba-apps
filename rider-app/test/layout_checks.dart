// Layout checks for one pumped screen (not a test itself): overflow and other layout errors, a button label that
// wraps or is cut, a price cut short, and a button or text drawn over other text. The main list is scrolled to the
// end so content below the fold is checked too.
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

class LayoutConfig {
  final Size size;
  final String lang;
  final double scale;
  const LayoutConfig(this.size, this.lang, this.scale);
  @override
  String toString() => '${size.width.toInt()}x${size.height.toInt()} $lang x$scale';
}

/// Small and current iPhone widths, both languages (French runs ~25% longer), default and enlarged text.
final layoutConfigs = [
  for (final size in const [Size(360, 780), Size(402, 874)])
    for (final lang in const ['en', 'fr'])
      for (final scale in const [1.0, 1.3]) LayoutConfig(size, lang, scale),
];

/// A MaterialApp `builder` that applies [config]'s text scale.
TransitionBuilder scaleText(LayoutConfig config) =>
    (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(config.scale)), child: child!);

/// Pumps [app] at [config]'s size, optionally runs [interact], and returns every problem found.
/// FlutterError.onError is restored before returning, so callers can expect() on the result.
Future<Set<String>> layoutProblems(WidgetTester tester, LayoutConfig config, Widget app, {Future<void> Function()? interact}) async {
  final problems = <String>{};
  tester.view.physicalSize = config.size * 3;
  tester.view.devicePixelRatio = 3;
  final previous = FlutterError.onError;
  FlutterError.onError = (d) => problems.add('error: ${d.exceptionAsString().split('\n').first}');
  try {
    await tester.pumpWidget(KeyedSubtree(key: UniqueKey(), child: app));
    await tester.pump(const Duration(milliseconds: 600));
    if (interact != null) await interact();
    _inspect(tester, problems);
    for (var i = 0; i < 20; i++) {
      final pos = _mainScroll(tester);
      if (pos == null || pos.pixels >= pos.maxScrollExtent - 1) break;
      pos.jumpTo(math.min(pos.maxScrollExtent, pos.pixels + pos.viewportDimension * 0.6));
      await tester.pump(const Duration(milliseconds: 100));
      _inspect(tester, problems);
    }
  } finally {
    FlutterError.onError = previous;
  }
  return problems;
}

final _money = RegExp(r'\d\s?FC\b|\$\s?\d|\d\s?\$');

void _inspect(WidgetTester tester, Set<String> problems) {
  final screen = Offset.zero & (tester.view.physicalSize / tester.view.devicePixelRatio);
  final texts = <RenderParagraph, Rect>{};
  for (final e in find.byType(RichText).evaluate()) {
    if (e.findAncestorWidgetOfExactType<Icon>() != null) continue; // a glyph, not text
    final r = e.renderObject;
    if (r is! RenderParagraph || !r.attached || !r.hasSize || r.size.isEmpty) continue;
    final rect = _visible(r, screen);
    if (rect != null && _plain(r).trim().isNotEmpty) texts[r] = rect;
  }

  for (final b in find.byWidgetPredicate((w) => w is ButtonStyleButton).evaluate()) {
    final box = b.renderObject;
    final shape = _materialBox(b); // the drawn button, without the invisible 48 pt tap-target padding
    if (box is! RenderBox || shape == null || !box.attached) continue;
    final rect = _visible(shape, screen);
    if (rect == null) continue;
    for (final t in texts.entries) {
      if (_isInside(t.key, box)) {
        final lines = _lines(t.key);
        if (t.key.didExceedMaxLines) problems.add('button label cut: "${_plain(t.key)}"');
        if (lines > 1) problems.add('button label on $lines lines: "${_plain(t.key)}"');
      } else if (_sameLayer(t.key, shape) && _overlap(_inkRect(t.key, t.value), rect)) {
        problems.add('button "${_label(box, texts)}" overlaps text "${_plain(t.key)}"');
      }
    }
  }

  void flex(RenderObject o) {
    if (o is RenderFlex && o.toStringShort().contains('OVERFLOWING')) {
      final chain = o.debugCreator.toString().split(' ← ').take(9).join(' ← ');
      problems.add('overflowing ${o.direction.name} flex: $chain');
    }
    o.visitChildren(flex);
  }

  final root = tester.binding.renderViews.first;
  flex(root);

  final list = texts.entries.toList();
  for (var i = 0; i < list.length; i++) {
    final a = list[i];
    if (a.key.didExceedMaxLines && _money.hasMatch(_plain(a.key))) problems.add('price cut short: "${_plain(a.key)}"');
    for (var j = i + 1; j < list.length; j++) {
      final b = list[j];
      if (_sameLayer(a.key, b.key) && _overlap(_inkRect(a.key, a.value), _inkRect(b.key, b.value))) {
        problems.add('text "${_plain(a.key)}" overlaps text "${_plain(b.key)}"');
      }
    }
  }
}

/// The Material a button draws (its visible shape).
RenderBox? _materialBox(Element button) {
  RenderBox? found;
  void visit(Element e) {
    if (found != null) return;
    if (e.widget is Material && e.renderObject is RenderBox) {
      found = e.renderObject as RenderBox;
    } else {
      e.visitChildren(visit);
    }
  }

  button.visitChildren(visit);
  return found;
}

/// False when one of the two sits in a pinned or floating header, which is drawn over the content scrolling under it.
bool _sameLayer(RenderObject a, RenderObject b) => identical(_header(a), _header(b));

RenderObject? _header(RenderObject o) {
  for (RenderObject? p = o; p != null; p = p.parent) {
    if (p is RenderSliverPersistentHeader) return p;
  }
  return null;
}

/// The part of [box] actually drawn on screen (scroll viewports and clips applied), or null when none is: off
/// screen, in a list's off-screen cache area, painted transparent or offstage.
Rect? _visible(RenderBox box, Rect screen) {
  var rect = (box.localToGlobal(Offset.zero) & box.size).intersect(screen);
  for (RenderObject? p = box.parent; p != null && !rect.isEmpty; p = p.parent) {
    if (p is RenderOpacity && p.opacity == 0) return null;
    if (p is RenderAnimatedOpacity && p.opacity.value == 0) return null;
    if (p is RenderOffstage && p.offstage) return null;
    if ((p is RenderViewportBase || p is RenderClipRect || p is RenderClipRRect) && (p as RenderBox).hasSize) {
      rect = rect.intersect(p.localToGlobal(Offset.zero) & p.size);
    }
  }
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

/// Where the glyphs are (a paragraph's box can be wider than its text).
Rect _inkRect(RenderParagraph p, Rect visible) {
  final boxes = p.getBoxesForSelection(TextSelection(baseOffset: 0, extentOffset: _plain(p).length));
  if (boxes.isEmpty) return visible;
  var r = boxes.first.toRect();
  for (final b in boxes.skip(1)) {
    r = r.expandToInclude(b.toRect());
  }
  return r.shift(p.localToGlobal(Offset.zero)).intersect(visible);
}

bool _overlap(Rect a, Rect b) {
  final i = a.intersect(b);
  return i.width > 2 && i.height > 2;
}

int _lines(RenderParagraph p) {
  final boxes = p.getBoxesForSelection(TextSelection(baseOffset: 0, extentOffset: _plain(p).length));
  return boxes.map((b) => b.top.round()).toSet().length;
}

bool _isInside(RenderObject child, RenderObject ancestor) {
  for (RenderObject? p = child; p != null; p = p.parent) {
    if (identical(p, ancestor)) return true;
  }
  return false;
}

String _plain(RenderParagraph p) => p.text.toPlainText(includeSemanticsLabels: false, includePlaceholders: false);

String _label(RenderBox button, Map<RenderParagraph, Rect> texts) =>
    texts.keys.where((t) => _isInside(t, button)).map(_plain).join(' ');

/// The tallest vertical scrollable on screen (the page body), if any.
ScrollPosition? _mainScroll(WidgetTester tester) {
  ScrollPosition? best;
  for (final s in tester.stateList<ScrollableState>(find.byType(Scrollable))) {
    final pos = s.position;
    if (s.widget.axis != Axis.vertical || !pos.hasContentDimensions || !pos.hasViewportDimension) continue;
    if (best == null || pos.viewportDimension > best.viewportDimension) best = pos;
  }
  return best;
}
