// A tiny script language for the clips, interpreted at run time so a clip can be changed without rebuilding the app.
//
//   cap "English||Français" [secs]     caption (written to the marker file), does not wait
//   say "English||Français" [secs]     caption, then waits for it to be read
//   wait 1.5
//   tap  <finder> [after]              scrolls the finder into view, shows a dot, taps
//   type <finder> "text" [msPerChar]   taps the field and types
//   until <finder> [secs]  /  gone <finder> [secs]  /  see <finder>  /  nosee <finder>
//   scroll 300 [<finder>]              finger drag up by 300 px (negative: down)
//   scrollto <finder>   back   tohome   flash   submit   long <finder>
//   act name k=v ... [-> var]          host action (tool/rec/acts.cjs), the result's fields become $var.field
//   each <keyPrefix> <text>            one character per field key:<prefix>0, 1, ...
//   grab <finder> var [regex]          keeps a text of the screen in $var
//   if <finder> <command...>           runs the command only when the finder is on screen
//   set var value   include file.sc   opt <command...> (skip when the finder is not there after 1.5 s)
//   photo path ...                     the next photo picker returns these files (apps register this command)
//
// Finders: msg:key (the app's text for a message key)  msgc:key  key:x  keyp:prefix  keyc:part  text:x  textc:part  icon:name  type:Widget  field:N, any of them followed by
// #N or #last, chained with " > " (descendant). Every argument may carry a pair "English||Français"; $var is replaced.
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'icons_map.dart';
import 'kit.dart';

typedef Extra = Future<void> Function(Dsl d, List<String> args);

class Dsl {
  Dsl(this.r, {this.extras = const {}, this.msg}) {
    vars['lang'] = r.lang;
  }
  final Rec r;
  final Map<String, Extra> extras;

  /// The app's own text for a message key in the clip's language (finders msg:key and msgc:key).
  final String Function(String key)? msg;
  final Map<String, String> vars = {};
  String where = '';

  // ---- parsing ------------------------------------------------------------------------------------------------
  String pick(String a) {
    final i = a.indexOf('||');
    if (i < 0) return a;
    return r.fr ? a.substring(i + 2) : a.substring(0, i);
  }

  String sub(String a) => a.replaceAllMapped(RegExp(r'\$([A-Za-z_][\w.]*)'), (m) => vars[m[1]!] ?? m[0]!);

  List<String> tokens(String line) {
    final out = <String>[];
    final b = StringBuffer();
    var q = false;
    var has = false;
    for (var i = 0; i < line.length; i++) {
      final c = line[i];
      if (c == '\\' && i + 1 < line.length && q && (line[i + 1] == '"' || line[i + 1] == '\\')) {
        b.write(line[++i]);
        continue;
      }
      if (c == '"') {
        q = !q;
        has = true;
        continue;
      }
      if (!q && (c == ' ' || c == '\t')) {
        if (b.isNotEmpty || has) out.add(b.toString());
        b.clear();
        has = false;
        continue;
      }
      b.write(c);
    }
    if (b.isNotEmpty || has) out.add(b.toString());
    return out.map((t) => pick(sub(t))).toList();
  }

  Finder finder(String spec) {
    Finder? cur;
    for (final part in spec.split(' > ')) {
      var s = part;
      String? idx;
      final m = RegExp(r'#(\d+|last)$').firstMatch(s);
      if (m != null) {
        idx = m.group(1);
        s = s.substring(0, m.start);
      }
      final c = s.indexOf(':');
      if (c < 0) throw TestFailure('Bad finder "$spec" ($where)');
      final kind = s.substring(0, c);
      final val = s.substring(c + 1);
      Finder f;
      switch (kind) {
        case 'key':
          f = find.byWidgetPredicate((w) => w.key is ValueKey && (w.key as ValueKey).value == val);
        case 'keyp':
          f = find.byWidgetPredicate((w) => w.key is ValueKey && '${(w.key as ValueKey).value}'.startsWith(val));
        case 'keyc':
          f = find.byWidgetPredicate((w) => w.key is ValueKey && '${(w.key as ValueKey).value}'.contains(val));
        case 'text':
          f = find.text(val);
        case 'textc':
          f = find.textContaining(val);
        case 'msg':
          f = find.text(msg!(val));
        case 'msgc':
          f = find.textContaining(msg!(val));
        case 'icon':
          final cp = kIconCodes[val];
          if (cp == null) throw TestFailure('Unknown icon $val ($where)');
          f = find.byWidgetPredicate((w) => w is Icon && w.icon?.codePoint == cp);
        case 'type':
          f = find.byWidgetPredicate((w) => w.runtimeType.toString() == val);
        case 'field':
          f = find.byType(TextField).at(int.parse(val));
        default:
          throw TestFailure('Unknown finder kind $kind ($where)');
      }
      if (cur != null) f = find.descendant(of: cur, matching: f);
      if (idx != null) f = idx == 'last' ? f.last : f.at(int.parse(idx));
      cur = f;
    }
    return cur!;
  }

  // ---- running --------------------------------------------------------------------------------------------------
  Future<void> runFile(String path) async {
    final lines = File(path).readAsLinesSync();
    for (var i = 0; i < lines.length; i++) {
      final l = lines[i].trim();
      if (l.isEmpty || l.startsWith('#')) continue;
      where = '${path.split('/').last}:${i + 1}';
      r.note('STEP $where $l');
      try {
        await run(l.replaceAll('{{DEMO_PASSWORD}}', kDemoPassword), base: path.substring(0, path.lastIndexOf('/')));
      } catch (e) {
        r.note('FAIL $where $e');
        try {
          await r.act('shot', {'name': 'fail'});
        } catch (_) {}
        rethrow;
      }
    }
  }

  Future<void> run(String line, {String base = ''}) async {
    var a = tokens(line);
    if (a.isEmpty) return;
    var cmd = a.removeAt(0);
    if (cmd == 'opt') {
      if (a.length < 2) throw TestFailure('opt needs a command ($where)');
      // opt tap <finder> ...: only when the finder is there
      final f = finder(a[1]);
      if (!await r.has(f, secs: 1.5)) {
        r.note('skipped $where');
        return;
      }
      cmd = a.removeAt(0);
    }
    if (cmd == 'if') {
      // if <finder> <command...>: only when the finder is on screen
      if (a.length < 2) throw TestFailure('if needs a finder and a command ($where)');
      final f = finder(a.removeAt(0));
      if (!await r.has(f, secs: 1.5)) {
        r.note('skipped $where');
        return;
      }
      await run(a.map((t) => t.contains(' ') || t.contains('||') ? '"$t"' : t).join(' '), base: base);
      return;
    }
    double num(int i, double d) => a.length > i ? double.parse(a[i]) : d;
    switch (cmd) {
      case 'cap':
        r.cap(a[0], secs: num(1, 2.6));
      case 'say':
        await r.say(a[0], secs: num(1, 2.6));
      case 'wait':
        await r.wait(num(0, 1));
      case 'tap':
        await r.tap(finder(a[0]), after: num(1, 0.9));
      case 'long':
        final f = finder(a[0]);
        await r.reveal(f);
        final g = await r.tester.startGesture(r.tester.getCenter(f.first));
        await r.wait(0.9);
        await g.up();
        await r.wait(0.8);
      case 'type':
        await r.type(finder(a[0]), a[1], ms: a.length > 2 ? int.parse(a[2]) : 45);
      case 'clear':
        await r.tester.enterText(finder(a[0]).first, '');
        await r.wait(0.3);
      case 'until':
        await r.until(finder(a[0]), secs: num(1, 20));
      case 'gone':
        final f = finder(a[0]);
        final end = DateTime.now().add(Duration(seconds: num(1, 20).round()));
        while (r.present(f) && DateTime.now().isBefore(end)) {
          await r.tester.pump(const Duration(milliseconds: 100));
        }
        if (r.present(f)) throw TestFailure('Still there: ${a[0]} ($where)');
      case 'see':
        await r.until(finder(a[0]), secs: num(1, 8));
      case 'nosee':
        if (await r.has(finder(a[0]), secs: 0.6)) throw TestFailure('Unexpected: ${a[0]} ($where)');
      case 'scroll':
        final dy = double.parse(a[0]);
        await r.scroll(dy, within: a.length > 1 ? finder(a[1]).first : null);
      case 'scrollto':
        await r.reveal(finder(a[0]));
        await r.wait(0.4);
      case 'back':
        await r.back();
      case 'tohome':
        // back until the bottom navigation bar is showing
        for (var i = 0; i < 8 && !r.present(find.byIcon(Icons.local_fire_department_rounded)); i++) {
          await r.back(after: 0.7);
        }
      case 'flash':
        await r.flash();
      case 'submit':
        await r.tester.testTextInput.receiveAction(TextInputAction.done);
        await r.wait(0.6);
      case 'set':
        vars[a[0]] = a[1];
      case 'include':
        final p = a[0].startsWith('/') ? a[0] : '$base/${a[0]}';
        final saved = where;
        await runFile(p);
        where = saved;
      case 'act':
        final args = <String, String>{};
        String? into;
        for (var i = 1; i < a.length; i++) {
          if (a[i] == '->') {
            into = a[++i];
            continue;
          }
          final e = a[i].indexOf('=');
          if (e > 0) args[a[i].substring(0, e)] = a[i].substring(e + 1);
        }
        final out = await r.actLive(a[0], args);
        if (into != null) {
          vars[into] = '${out['value'] ?? ''}';
          out.forEach((k, v) => vars['$into.$k'] = '$v');
        }
      case 'each':
        // each <keyPrefix> <text>: types one character into key:<prefix>0, key:<prefix>1, ...
        for (var i = 0; i < a[1].length; i++) {
          await r.type(finder('key:${a[0]}$i'), a[1][i], after: 0.15);
        }
      case 'grab':
        // grab <finder> <var> [regex]: keeps the finder's text (first group of the regex) in $var
        final f = finder(a[0]).first;
        var text = '';
        final w = f.evaluate().first.widget;
        if (w is Text) {
          text = w.data ?? w.textSpan?.toPlainText() ?? '';
        } else if (w is SelectableText) {
          text = w.data ?? w.textSpan?.toPlainText() ?? '';
        } else {
          final t = find.descendant(of: f, matching: find.byWidgetPredicate((x) => x is Text || x is SelectableText));
          final tw = t.evaluate().first.widget;
          text = tw is Text ? (tw.data ?? '') : tw is SelectableText ? (tw.data ?? '') : '';
        }
        if (a.length > 2) {
          final m = RegExp(a[2]).firstMatch(text);
          text = m == null ? '' : (m.groupCount >= 1 ? m.group(1)! : m.group(0)!);
        }
        vars[a[1]] = text;
        r.note('grab ${a[1]}=$text');
      case 'dump':
        // handled by the REPL
        break;
      default:
        final x = extras[cmd];
        if (x == null) throw TestFailure('Unknown command $cmd ($where)');
        await x(this, a);
    }
  }

  // ---- REPL (exploring a flow without rebuilding) ---------------------------------------------------------------
  String dump() {
    final size = r.tester.view.physicalSize / r.tester.view.devicePixelRatio;
    final sb = StringBuffer();
    final names = <int, String>{};
    kIconCodes.forEach((k, v) {
      final old = names[v];
      if (old == null || (k.endsWith('_rounded') && !old.endsWith('_rounded'))) names[v] = k;
    });
    bool inside(Rect rc) => rc.right > 0 && rc.left < size.width && rc.bottom > 0 && rc.top < size.height && rc.width > 0;
    Rect? rect(Element e) {
      final ro = e.renderObject;
      if (ro is! RenderBox || !ro.attached || !ro.hasSize) return null;
      return ro.localToGlobal(Offset.zero) & ro.size;
    }

    String pos(Rect rc) => '@${rc.center.dx.round()},${rc.center.dy.round()}';
    final seen = <String>{};
    for (final e in find.byType(Text).evaluate()) {
      final w = e.widget as Text;
      final t = w.data ?? w.textSpan?.toPlainText() ?? '';
      final rc = rect(e);
      if (rc == null || !inside(rc) || t.trim().isEmpty) continue;
      if (seen.add('T$t${rc.top.round()}')) sb.writeln('T  ${rc.top.round().toString().padLeft(4)} "$t" ${pos(rc)}');
    }
    for (final e in find.byWidgetPredicate((w) => w.key is ValueKey).evaluate()) {
      final k = '${(e.widget.key as ValueKey).value}';
      if (k.startsWith('CachedNetworkImage') || k.startsWith('_') || k.startsWith('[') || k.startsWith('StandardComponent')) continue;
      final rc = rect(e);
      if (rc == null || !inside(rc)) continue;
      if (seen.add('K$k')) sb.writeln('K  ${rc.top.round().toString().padLeft(4)} key:$k ${pos(rc)} ${e.widget.runtimeType}');
    }
    for (final e in find.byType(Icon).evaluate()) {
      final w = e.widget as Icon;
      final rc = rect(e);
      if (rc == null || !inside(rc)) continue;
      sb.writeln('I  ${rc.top.round().toString().padLeft(4)} icon:${names[w.icon?.codePoint] ?? w.icon?.codePoint} ${pos(rc)}');
    }
    for (final e in find.byType(TextField).evaluate()) {
      final w = e.widget as TextField;
      final rc = rect(e);
      if (rc == null || !inside(rc)) continue;
      sb.writeln('F  ${rc.top.round().toString().padLeft(4)} field "${w.controller?.text ?? ''}" hint="${w.decoration?.hintText ?? ''}" label="${w.decoration?.labelText ?? ''}" ${pos(rc)}');
    }
    return sb.toString();
  }

  /// Runs numbered command files from `$kRecDir/repl/N.cmd`, writes `N.out` (status + a dump of what is on screen).
  Future<void> repl() async {
    final dir = Directory('$kRecDir/repl')..createSync(recursive: true);
    for (final f in dir.listSync()) {
      if (f is File) f.deleteSync();
    }
    File('$kRecDir/repl/ready').writeAsStringSync('ready');
    var n = 1;
    while (true) {
      final f = File('${dir.path}/$n.cmd');
      if (!f.existsSync()) {
        await r.tester.pump(const Duration(milliseconds: 200));
        continue;
      }
      final lines = f.readAsLinesSync();
      final out = StringBuffer();
      var quit = false;
      var nodump = false;
      for (final l in lines) {
        final t = l.trim();
        if (t.isEmpty || t.startsWith('#')) continue;
        if (t == 'quit') {
          quit = true;
          break;
        }
        if (t == 'nodump') {
          nodump = true;
          continue;
        }
        where = 'repl:$n';
        try {
          await run(t, base: dir.path);
          out.writeln('OK   $t');
        } catch (e) {
          out.writeln('ERR  $t\n     ${e.toString().split('\n').first}');
          break;
        }
      }
      if (!quit && !nodump) {
        await r.wait(0.4);
        out.writeln('--- screen');
        out.write(dump());
      }
      File('${dir.path}/$n.out').writeAsStringSync(out.toString());
      if (quit) return;
      n++;
    }
  }
}
