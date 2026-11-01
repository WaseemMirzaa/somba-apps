// Recording kit for the customer app clips: real-time taps with a visible dot, typed text, smooth scrolls, captions
// written to a marker file (the recording script turns them into an SRT) and host actions (see tool/rec/ctl.cjs).
//
// Run one clip: write {"clip": "02", "lang": "en"} to $REC_DIR/clip.json, then
//   flutter test integration_test/clips_test.dart -d <udid> --dart-define=API_URL=http://localhost:3014
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const String kRecDir = String.fromEnvironment('REC_DIR', defaultValue: '/Users/macuser/somba-build/appdemo/state');
const String kCtl = String.fromEnvironment('CTL_URL', defaultValue: 'http://localhost:3061');

/// The seed accounts' password, given at build time (`--dart-define=DEMO_PASSWORD=…`) so no script file carries it.
const String kDemoPassword = String.fromEnvironment('DEMO_PASSWORD');

class Rec {
  Rec(this.tester, this.lang);
  final WidgetTester tester;
  final String lang;
  bool get fr => lang == 'fr';

  /// Picks the English or the French text.
  String t(String en, String fr) => this.fr ? fr : en;

  void _mark(String line) {
    try {
      File('$kRecDir/markers.tsv').writeAsStringSync('$line\n', mode: FileMode.append);
    } catch (_) {}
  }

  int get _now => DateTime.now().millisecondsSinceEpoch;

  bool present(Finder f) {
    try {
      return f.evaluate().isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  /// The biggest vertical scrollable on screen (the page's list), not a text field's own scroller.
  Finder mainScrollable() {
    Element? best;
    var bestArea = 0.0;
    for (final e in find.byType(Scrollable).evaluate()) {
      final w = e.widget as Scrollable;
      if (w.axis != Axis.vertical) continue;
      final ro = e.renderObject;
      if (ro is! RenderBox || !ro.hasSize || !ro.attached) continue;
      final off = ro.localToGlobal(Offset.zero);
      if (off.dy > 700 || off.dx > 380) continue;
      final a = ro.size.width * ro.size.height;
      if (a > bestArea) {
        bestArea = a;
        best = e;
      }
    }
    if (best == null) return find.byType(Scrollable).first;
    return find.byWidget(best.widget);
  }

  // ---- time -------------------------------------------------------------------------------------------------
  Future<void> wait(double secs) async {
    final end = DateTime.now().add(Duration(milliseconds: (secs * 1000).round()));
    while (DateTime.now().isBefore(end)) {
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  /// Waits (pumping) until [f] is on screen; fails the clip with the finder's description when it never is.
  Future<void> until(Finder f, {double secs = 20, String? why}) async {
    final end = DateTime.now().add(Duration(milliseconds: (secs * 1000).round()));
    while (DateTime.now().isBefore(end)) {
      await tester.pump(const Duration(milliseconds: 100));
      if (present(f)) return;
    }
    await shot('timeout');
    throw TestFailure('Never found ${why ?? f} within ${secs}s');
  }

  Future<bool> has(Finder f, {double secs = 0.5}) async {
    final end = DateTime.now().add(Duration(milliseconds: (secs * 1000).round()));
    do {
      await tester.pump(const Duration(milliseconds: 100));
      if (present(f)) return true;
    } while (DateTime.now().isBefore(end));
    return false;
  }

  // ---- captions and markers -----------------------------------------------------------------------------------
  /// A caption of [secs] seconds starting now (does not wait: the caller pauses itself).
  void cap(String text, {double secs = 2.6}) {
    final n = _now;
    _mark('CAP\t$n\t${n + (secs * 1000).round()}\t${text.replaceAll('\t', ' ').replaceAll('\n', ' ')}');
  }

  /// A caption, then waits for it to be read.
  Future<void> say(String text, {double secs = 2.6}) async {
    cap(text, secs: secs);
    await wait(secs);
  }

  void note(String text) => _mark('NOTE\t$_now\t$text');

  /// A magenta flash: the recording script finds its frame to line the video up with the markers.
  Future<void> flash() async {
    final overlay = tester.state<OverlayState>(find.byType(Overlay).first);
    final e = OverlayEntry(builder: (_) => const Positioned.fill(child: ColoredBox(color: Color(0xFFFF00FF))));
    overlay.insert(e);
    _mark('FLASH\t$_now');
    await wait(0.5);
    e.remove();
    await wait(0.3);
  }

  Future<void> shot(String name) async {
    note('shot $name');
    try {
      await act('shot', {'name': name});
    } catch (_) {}
  }

  // ---- gestures ------------------------------------------------------------------------------------------------
  void _dot(Offset p) {
    final overlay = tester.state<OverlayState>(find.byType(Overlay).first);
    late OverlayEntry e;
    e = OverlayEntry(
        builder: (_) => Positioned(
            left: p.dx - 22,
            top: p.dy - 22,
            child: IgnorePointer(
                child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: 1),
              duration: const Duration(milliseconds: 520),
              curve: Curves.easeOut,
              builder: (_, v, __) => Opacity(
                  opacity: (1 - v).clamp(0.0, 1.0) * 0.85,
                  child: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: const Color(0x66FFB300),
                        border: Border.all(color: const Color(0xFFFF8F00), width: 3)),
                    transform: Matrix4.diagonal3Values(0.55 + 0.7 * v, 0.55 + 0.7 * v, 1),
                    transformAlignment: Alignment.center,
                  )),
            ))));
    overlay.insert(e);
    Future.delayed(const Duration(milliseconds: 600), () {
      if (e.mounted) e.remove();
    });
  }

  /// Brings [f] into the comfortable middle of the screen with a visible, smooth scroll.
  Future<void> reveal(Finder f, {int maxDrags = 24}) async {
    final size = tester.view.physicalSize / tester.view.devicePixelRatio;
    for (var i = 0; i < maxDrags; i++) {
      if (present(f)) {
        final r = tester.getRect(f.first);
        if (r.top > 110 && r.bottom < size.height - 150 && r.height > 0) return;
        final scrollables = find.ancestor(of: f.first, matching: find.byWidgetPredicate((w) => w is Scrollable && w.axis == Axis.vertical));
        if (scrollables.evaluate().isNotEmpty) {
          final sc = scrollables.first;
          final down = r.center.dy > size.height / 2;
          await tester.timedDrag(sc, Offset(0, down ? -(r.center.dy - size.height * 0.45).clamp(60.0, 420.0).toDouble() : 320), const Duration(milliseconds: 420));
          await wait(0.8);
          if (present(f) && (tester.getRect(f.first).top - r.top).abs() < 2) return; // the list cannot go further
          continue;
        }
        return;
      }
      // not built yet (lazy list): scroll the main list down
      final lists = find.byType(Scrollable);
      if (lists.evaluate().isEmpty) break;
      await tester.timedDrag(mainScrollable(), const Offset(0, -380), const Duration(milliseconds: 420));
      await wait(0.8);
    }
  }

  /// Waits until [f] stops moving (a list still flinging would swallow the tap).
  Future<void> settle(Finder f) async {
    Rect? last;
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 120));
      if (!present(f)) return;
      final r = tester.getRect(f.first);
      if (last != null && (r.top - last.top).abs() < 0.5 && (r.left - last.left).abs() < 0.5) return;
      last = r;
    }
  }

  Future<void> tap(Finder f, {double after = 0.9, bool scroll = true, String? why}) async {
    if (!present(f) && scroll) await reveal(f);
    if (!present(f)) await until(f, why: why);
    if (scroll) await reveal(f);
    await settle(f);
    final p = tester.getCenter(f.first);
    _dot(p);
    await tester.pump(const Duration(milliseconds: 220));
    await tester.tapAt(p);
    await wait(after);
  }

  Future<void> type(Finder f, String text, {int ms = 45, double after = 0.5}) async {
    if (!present(f)) await until(f);
    await reveal(f);
    _dot(tester.getCenter(f.first));
    await tester.pump(const Duration(milliseconds: 250));
    await tester.tap(f.first, warnIfMissed: false);
    await tester.pump(const Duration(milliseconds: 250));
    for (var i = 1; i <= text.length; i++) {
      await tester.enterText(f.first, text.substring(0, i));
      await tester.pump(Duration(milliseconds: ms));
    }
    await wait(after);
  }

  Future<void> scroll(double dy, {Finder? within, double after = 0.6}) async {
    final sc = within ?? mainScrollable();
    await tester.timedDrag(sc, Offset(0, -dy), const Duration(milliseconds: 650));
    await wait(after);
  }

  Future<void> back({double after = 0.9}) async {
    for (final f in [
      find.byType(BackButton),
      find.byIcon(Icons.arrow_back_rounded),
      find.byIcon(Icons.arrow_back_ios_new_rounded),
      find.byIcon(Icons.arrow_back_ios),
    ]) {
      if (present(f)) {
        final r = tester.getRect(f.last);
        if (r.top > -2 && r.bottom < 200) {
          await tap(f.last, after: after, scroll: false);
          return;
        }
      }
    }
    // the header scrolled away: go back like the system gesture does
    final nav = Navigator.of(tester.element(find.byType(Scaffold).last));
    await nav.maybePop();
    await wait(after);
  }

  // ---- the host (node control server) ---------------------------------------------------------------------------
  Future<Map<String, dynamic>> act(String name, [Map<String, String> args = const {}]) async {
    final c = HttpClient()..connectionTimeout = const Duration(seconds: 10);
    try {
      final uri = Uri.parse('$kCtl/act/$name').replace(queryParameters: args);
      final req = await c.getUrl(uri);
      final res = await req.close();
      final body = await res.transform(utf8.decoder).join();
      final j = body.isEmpty ? <String, dynamic>{} : jsonDecode(body) as Map<String, dynamic>;
      note('act $name ${res.statusCode}');
      if (res.statusCode >= 400) throw TestFailure('act $name failed: $body');
      return j;
    } finally {
      c.close();
    }
  }

  /// Runs a host action while the app keeps drawing frames.
  Future<Map<String, dynamic>> actLive(String name, [Map<String, String> args = const {}]) async {
    final f = act(name, args);
    var done = false;
    late Map<String, dynamic> out;
    Object? err;
    unawaited(f.then((v) {
      out = v;
      done = true;
    }, onError: (Object e) {
      err = e;
      done = true;
    }));
    while (!done) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    if (err != null) throw err!;
    return out;
  }
}
