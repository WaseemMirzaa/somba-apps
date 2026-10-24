// A SnackBar that has an `action` stays on screen until it is dismissed unless `persist: false` is set
// (Flutter 3.35+). The foreground-push banner ("Open") must go away on its own after its normal duration,
// action still tappable. Whatever snackbar with an action is added later has to say so as well.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('contract: a floating snackbar with an action and persist:false leaves after its duration, action tappable before', (tester) async {
    var opened = 0;
    final messenger = GlobalKey<ScaffoldMessengerState>();
    await tester.pumpWidget(MaterialApp(scaffoldMessengerKey: messenger, home: const Scaffold(body: SizedBox())));

    void banner() => messenger.currentState!.showSnackBar(SnackBar(
          behavior: SnackBarBehavior.floating,
          persist: false,
          content: const Text('New delivery available'),
          action: SnackBarAction(label: 'Open', onPressed: () => opened++),
        ));

    banner();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(SnackBar), findsOneWidget);
    await tester.tap(find.text('Open'));
    await tester.pump();
    expect(opened, 1);

    banner();
    await tester.pumpAndSettle(const Duration(milliseconds: 100)); // the first one is replaced by this one
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    expect(find.byType(SnackBar), findsNothing);
  });

  test('every SnackBar with an action in lib/ opts out of persisting', () {
    final offenders = <String>[];
    for (final f in Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
      final src = f.readAsStringSync();
      for (final m in RegExp(r'SnackBarAction\(').allMatches(src)) {
        final start = src.lastIndexOf('SnackBar(', m.start);
        if (start == -1 || !src.substring(start, m.start).contains('persist: false')) {
          offenders.add('${f.path}:${'\n'.allMatches(src.substring(0, m.start)).length + 1}');
        }
      }
    }
    expect(offenders, isEmpty, reason: 'SnackBar with an action but no `persist: false`');
  });
}
