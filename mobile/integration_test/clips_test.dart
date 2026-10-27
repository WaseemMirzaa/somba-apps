// Drives the customer app in real time while the recording script films the simulator.
// $REC_DIR/clip.json says what to do: {"mode": "script", "script": "<path to .sc>", "lang": "en"}
// or {"mode": "repl", "lang": "en"} (commands arrive as numbered files, see Dsl.repl).
// Build once with `flutter build ios --simulator --debug --target integration_test/clips_test.dart`, install the
// app and launch it with simctl: the test starts by itself. Scripts are plain text (see dsl.dart), so a clip is
// edited and retaken without a rebuild.
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:integration_test/integration_test.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/main.dart' as app;
import 'package:lipcart/widgets/photo_picker.dart' show debugPhotoSource;
import 'package:shared_preferences/shared_preferences.dart';
import 'dsl.dart';
import 'kit.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;

  testWidgets('clip', (tester) async {
    final cfg = jsonDecode(File('$kRecDir/clip.json').readAsStringSync()) as Map<String, dynamic>;
    final lang = (cfg['lang'] as String?) ?? 'en';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('somba.lang', (cfg['startLang'] as String?) ?? lang);
    await app.main();
    final rec = Rec(tester, lang);
    final dsl = Dsl(rec, msg: (k) => Strings.current.t(k), extras: {
      'photo': (d, a) async {
        final files = [for (final p in a) XFile(p)];
        debugPhotoSource = (source, remaining) async => files;
      },
    });
    rec.note('READY');
    if ((cfg['mode'] ?? 'script') == 'repl') {
      await dsl.repl();
    } else {
      await dsl.runFile(cfg['script'] as String);
    }
    rec.note('DONE');
    await rec.wait(1);
  }, timeout: const Timeout(Duration(minutes: 60)));
}
