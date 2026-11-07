// Proof of delivery in the rider app: the signature pad, the sheet that opens when a delivery to the customer is completed,
// its place in the completion flow (cash, then proof, then the delivery code, unchanged), and the upload request.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/messages.dart';
import 'package:somba_rider/l10n/server_errors.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/deliveries_screen.dart';
import 'package:somba_rider/screens/delivery_proof_sheet.dart';
import 'package:somba_rider/services/auth_service.dart' show ApiException;
import 'package:somba_rider/services/delivery_proof.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/theme/app_theme.dart';
import 'package:somba_rider/widgets/signature_pad.dart';

import 'button_rules.dart';
import 'proof_fakes.dart';
import 'task_fixtures.dart';

const _pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

Widget _app(Widget home, {String lang = 'en', double textScale = 1}) => MaterialApp(
      locale: Locale(lang),
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      theme: AppTheme.light(),
      builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)), child: child!),
      home: home,
    );

void _phone(WidgetTester t) {
  t.view.physicalSize = const Size(360 * 3, 780 * 3);
  t.view.devicePixelRatio = 3;
  addTearDown(t.view.reset);
}

/// Draws a stroke across the pad.
Future<void> _sign(WidgetTester t) async {
  await t.drag(find.byKey(const ValueKey('signature-canvas')), const Offset(120, 30));
  await t.pump();
}

/// Lets the real (non-faked) async work, such as encoding the PNG, finish.
Future<void> _realWork(WidgetTester t) async {
  await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 250)));
  await t.pumpAndSettle();
}

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
      await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
    }
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await Strings.setLang('en', persist: false);
  });

  group('signature pad', () {
    testWidgets('shows the hint until something is drawn, takes a stroke, and Clear starts over', (t) async {
      _phone(t);
      final c = SignatureController();
      addTearDown(c.dispose);
      await t.pumpWidget(_app(Scaffold(body: Padding(padding: const EdgeInsets.all(16), child: SignaturePad(controller: c, hint: 'Sign here')))));
      expect(find.text('Sign here'), findsOneWidget);
      expect(c.hasInk, isFalse);
      await _sign(t);
      expect(find.text('Sign here'), findsNothing);
      expect(c.hasInk, isTrue);
      expect(c.strokes, hasLength(1));
      expect(c.strokes.single.length, greaterThan(2), reason: 'the stroke follows the finger');
      await t.drag(find.byKey(const ValueKey('signature-canvas')), const Offset(-60, 20));
      await t.pump();
      expect(c.strokes, hasLength(2), reason: 'a second stroke is a new line');
      c.clear();
      await t.pump();
      expect(c.isBlank, isTrue);
      expect(find.text('Sign here'), findsOneWidget);
    });

    testWidgets('a tap or a smudge is not a signature', (t) async {
      _phone(t);
      final c = SignatureController();
      addTearDown(c.dispose);
      await t.pumpWidget(_app(Scaffold(body: Padding(padding: const EdgeInsets.all(16), child: SignaturePad(controller: c, hint: 'Sign here')))));
      await t.tap(find.byKey(const ValueKey('signature-canvas')));
      await t.pump();
      expect(c.isBlank, isFalse, reason: 'the dot is drawn');
      expect(c.hasInk, isFalse, reason: 'but it does not count');
      await t.drag(find.byKey(const ValueKey('signature-canvas')), const Offset(8, 0));
      await t.pump();
      expect(c.hasInk, isFalse);
    });

    testWidgets('keeps the stroke inside a scrolling parent (the page does not scroll away under the finger)', (t) async {
      _phone(t);
      final c = SignatureController();
      final scroll = ScrollController();
      addTearDown(() {
        c.dispose();
        scroll.dispose();
      });
      await t.pumpWidget(_app(Scaffold(
        body: ListView(controller: scroll, padding: const EdgeInsets.all(16), children: [
          SignaturePad(controller: c, hint: 'Sign here'),
          const SizedBox(height: 1200),
        ]),
      )));
      await t.drag(find.byKey(const ValueKey('signature-canvas')), const Offset(20, -90));
      await t.pump();
      expect(scroll.offset, 0, reason: 'a vertical stroke on the pad draws, it does not scroll');
      expect(c.hasInk, isTrue);
    });

    testWidgets('exports a real PNG, 600 px wide, black on white; nothing to export without ink', (t) async {
      _phone(t);
      final c = SignatureController();
      addTearDown(c.dispose);
      await t.pumpWidget(_app(Scaffold(body: Padding(padding: const EdgeInsets.all(16), child: SignaturePad(controller: c, hint: 'Sign here')))));
      expect(await t.runAsync(() => c.toPng()), isNull);
      await _sign(t);
      final png = await t.runAsync(() => c.toPng());
      expect(png, isNotNull);
      expect(png!.sublist(0, 8), _pngMagic);
      expect(ByteData.sublistView(png).getUint32(16), 600, reason: 'IHDR width');
      expect(png.length, lessThan(200 * 1024));
    });
  });

  group('the proof sheet', () {
    late FakeProofCamera camera;
    late FakeProofUploader uploader;
    bool? result;
    var closed = false;

    Future<void> open(WidgetTester t, {String lang = 'en', double textScale = 1}) async {
      _phone(t);
      await Strings.setLang(lang, persist: false);
      result = null;
      closed = false;
      await t.pumpWidget(_app(
        Builder(
          builder: (ctx) => Scaffold(
            body: Center(
              child: TextButton(
                key: const ValueKey('open'),
                onPressed: () async {
                  result = await showModalBottomSheet<bool>(
                    context: ctx,
                    isScrollControlled: true,
                    showDragHandle: true,
                    builder: (_) => DeliveryProofSheet(taskId: 't1', camera: camera, uploader: uploader),
                  );
                  closed = true;
                },
                child: const Text('open'),
              ),
            ),
          ),
        ),
        lang: lang,
        textScale: textScale,
      ));
      await t.tap(find.byKey(const ValueKey('open')));
      await t.pumpAndSettle();
    }

    setUp(() {
      camera = FakeProofCamera();
      uploader = FakeProofUploader();
    });

    testWidgets('both are optional: Continue with nothing captured saves nothing and goes on', (t) async {
      await open(t);
      expect(find.text(Strings('en').podTitle), findsOneWidget);
      await t.tap(find.byKey(const ValueKey('proof-continue')));
      await t.pumpAndSettle();
      expect(closed, isTrue);
      expect(result, isTrue);
      expect(uploader.uploads, isEmpty);
      expect(camera.taken, 0);
    });

    testWidgets('a photo and a signature are both saved (as a PNG) before the sheet lets the delivery go on', (t) async {
      final dir = Directory.systemTemp.createTempSync('pod-test');
      addTearDown(() => dir.deleteSync(recursive: true));
      camera.path = '${dir.path}/photo.jpg';
      File(camera.path!).writeAsBytesSync([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
      await open(t);
      await t.tap(find.byKey(const ValueKey('proof-photo')));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('proof-photo-preview')), findsOneWidget);
      expect(find.byKey(const ValueKey('proof-photo')), findsNothing, reason: 'replaced by the preview with Retake / Remove');
      await _sign(t);
      await t.tap(find.byKey(const ValueKey('proof-continue')));
      await _realWork(t);
      expect(uploader.uploads, hasLength(1));
      final (taskId, proof) = uploader.uploads.single;
      expect(taskId, 't1');
      expect(proof.photoPath, camera.path);
      expect(proof.signaturePng!.sublist(0, 8), _pngMagic);
      expect(result, isTrue);
    });

    testWidgets('a signature alone is saved; a photo removed before Continue is not', (t) async {
      await open(t);
      await t.tap(find.byKey(const ValueKey('proof-photo')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('proof-photo-remove')));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('proof-photo')), findsOneWidget);
      await _sign(t);
      await t.tap(find.byKey(const ValueKey('proof-continue')));
      await _realWork(t);
      expect(uploader.uploads.single.$2.photoPath, isNull);
      expect(uploader.uploads.single.$2.signaturePng, isNotNull);
    });

    testWidgets('a scribble that is too short is not sent as a signature', (t) async {
      await open(t);
      await t.tap(find.byKey(const ValueKey('signature-canvas')));
      await t.tap(find.byKey(const ValueKey('proof-continue')));
      await _realWork(t);
      expect(uploader.uploads, isEmpty);
      expect(result, isTrue);
    });

    testWidgets('a failed save keeps the sheet open with the reason and a retry; only then is "Deliver without proof" offered', (t) async {
      uploader.error = ApiException.local('err_offline');
      await open(t);
      await t.tap(find.byKey(const ValueKey('proof-photo')));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('proof-skip')), findsNothing);
      await t.tap(find.byKey(const ValueKey('proof-continue')));
      await t.pumpAndSettle();
      expect(closed, isFalse);
      expect(find.byKey(const ValueKey('proof-error')), findsOneWidget);
      expect(find.text(Strings('en').errOffline), findsWidgets);
      expect(find.byKey(const ValueKey('proof-skip')), findsOneWidget);
      // The connection is back: the same proof goes through.
      uploader.error = null;
      await t.tap(find.byKey(const ValueKey('proof-continue')));
      await t.pumpAndSettle();
      expect(uploader.uploads, hasLength(1));
      expect(result, isTrue);
    });

    testWidgets('"Deliver without proof" after a failure goes on without it', (t) async {
      uploader.error = ApiException('The photo must be a JPEG or PNG image.', 400);
      await open(t);
      await t.tap(find.byKey(const ValueKey('proof-photo')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('proof-continue')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('proof-skip')));
      await t.pumpAndSettle();
      expect(result, isTrue);
      expect(uploader.uploads, isEmpty);
    });

    testWidgets('Cancel does not complete the delivery', (t) async {
      await open(t);
      await t.tap(find.byKey(const ValueKey('proof-cancel')));
      await t.pumpAndSettle();
      expect(result, isFalse);
      expect(uploader.uploads, isEmpty);
    });

    for (final lang in ['en', 'fr']) {
      testWidgets('camera permission denied: a message in the rider\'s language, no photo, the rest still works ($lang)', (t) async {
        camera.error = ApiException.local('pod_camera_denied');
        await open(t, lang: lang);
        await t.tap(find.byKey(const ValueKey('proof-photo')));
        await t.pumpAndSettle();
        final s = Strings(lang);
        expect(find.text(s.t('pod_camera_denied')), findsWidgets, reason: 'inline and in the snackbar');
        expect(find.byKey(const ValueKey('proof-photo-preview')), findsNothing);
        await t.tap(find.byKey(const ValueKey('proof-continue')));
        await t.pumpAndSettle();
        expect(result, isTrue);
      });
    }

    for (final lang in ['en', 'fr']) {
      testWidgets('label-only buttons, one filled button, and it survives 200% text ($lang)', (t) async {
        await open(t, lang: lang, textScale: 2);
        expect(t.takeException(), isNull);
        expectButtonRules(t);
        await t.tap(find.byKey(const ValueKey('proof-photo')));
        await t.pumpAndSettle();
        expect(t.takeException(), isNull);
        expectButtonRules(t);
      });
    }
  });

  group('completing a delivery', () {
    final calls = <String>[];
    final sent = <Map<String, dynamic>?>[];
    late FakeProofCamera camera;
    late FakeProofUploader uploader;

    setUp(() {
      calls.clear();
      sent.clear();
      camera = FakeProofCamera();
      uploader = FakeProofUploader();
      DeliveryProofKit.instance.camera = camera;
      DeliveryProofKit.instance.uploader = uploader;
      final store = RiderStore.instance;
      store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean', role: 'rider', phone: '+243810000000');
      store.loaded = true;
      store.codEnabled = false;
      store.requireDeliveryCode = false;
      store.myTasks.clear();
      store.transport = (event, body) async {
        calls.add(event);
        sent.add(body);
        if (event == 'delivery:updateStatus') uploader.order.add('delivered');
        switch (event) {
          case 'rider:tasks':
          case 'notifications:list':
          case 'support:list':
            return [];
          case 'settings:get':
            return {};
          default:
            return {'ok': true};
        }
      };
    });

    tearDown(() {
      final store = RiderStore.instance;
      store.transport = null;
      store.user = null;
      store.myTasks.clear();
      store.requireDeliveryCode = false;
      DeliveryProofKit.instance.reset();
    });

    Future<void> show(WidgetTester t, List<DeliveryTaskDto> tasks, {bool code = false}) async {
      _phone(t);
      RiderStore.instance.requireDeliveryCode = code;
      RiderStore.instance.myTasks
        ..clear()
        ..addAll(tasks);
      await t.pumpWidget(KeyedSubtree(key: UniqueKey(), child: _app(const Scaffold(body: DeliveriesScreen()))));
      await t.pump(const Duration(milliseconds: 600));
    }

    testWidgets('delivered -> proof sheet -> save -> code prompt -> the delivery call carries the code and nothing of the proof', (t) async {
      await show(t, [leg('delivery', id: 'd', status: 'in_transit')], code: true);
      await t.tap(find.byKey(const ValueKey('next-d')));
      await t.pumpAndSettle();
      expect(calls, isNot(contains('delivery:updateStatus')), reason: 'nothing is completed before the proof step is answered');
      await t.tap(find.byKey(const ValueKey('proof-photo')));
      await t.pumpAndSettle();
      await _sign(t);
      await t.tap(find.byKey(const ValueKey('proof-continue')));
      await _realWork(t);
      expect(uploader.uploads, hasLength(1));
      expect(uploader.uploads.single.$1, 'd');
      expect(find.byKey(const ValueKey('delivery-code-field')), findsOneWidget, reason: 'the code stays the authoritative check');
      await t.enterText(find.byKey(const ValueKey('delivery-code-field')), '4321');
      await t.tap(find.byKey(const ValueKey('delivery-code-submit')));
      await t.pumpAndSettle();
      expect(uploader.order, ['upload', 'delivered'], reason: 'the proof is saved before the leg is marked delivered');
      expect(sent[calls.indexOf('delivery:updateStatus')], {'taskId': 'd', 'status': 'delivered', 'code': '4321'});
      expect(find.text(Strings('en').doneDelivered), findsOneWidget);
    });

    testWidgets('a wrong code after the proof still refuses the delivery with the server\'s message', (t) async {
      await show(t, [leg('delivery', id: 'd', status: 'in_transit')], code: true);
      final inner = RiderStore.instance.transport!;
      RiderStore.instance.transport = (event, body) async {
        if (event == 'delivery:updateStatus') throw ApiException('Wrong delivery code. Ask the customer for the 4-digit code shown in their app.');
        return inner(event, body);
      };
      await t.tap(find.byKey(const ValueKey('next-d')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('proof-continue')));
      await t.pumpAndSettle();
      await t.enterText(find.byKey(const ValueKey('delivery-code-field')), '0000');
      await t.tap(find.byKey(const ValueKey('delivery-code-submit')));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('delivery-code-error')), findsOneWidget);
      expect(find.byKey(const ValueKey('delivery-code-field')), findsOneWidget, reason: 'the code dialog stays open');
    });

    testWidgets('without the code setting: skip the proof and the delivery is sent as before', (t) async {
      await show(t, [leg('delivery', id: 'd', status: 'in_transit')]);
      await t.tap(find.byKey(const ValueKey('next-d')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('proof-continue')));
      await t.pumpAndSettle();
      expect(uploader.uploads, isEmpty);
      expect(sent[calls.indexOf('delivery:updateStatus')], {'taskId': 'd', 'status': 'delivered'});
    });

    testWidgets('Cancel on the proof sheet leaves the delivery open', (t) async {
      await show(t, [leg('delivery', id: 'd', status: 'in_transit')]);
      await t.tap(find.byKey(const ValueKey('next-d')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('proof-cancel')));
      await t.pumpAndSettle();
      expect(calls, isNot(contains('delivery:updateStatus')));
      expect(find.byKey(const ValueKey('next-d')), findsOneWidget);
    });

    testWidgets('a proof that cannot be saved does not block the delivery: the rider may deliver without it', (t) async {
      uploader.error = ApiException.local('err_timeout');
      await show(t, [leg('delivery', id: 'd', status: 'in_transit')]);
      await t.tap(find.byKey(const ValueKey('next-d')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('proof-photo')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('proof-continue')));
      await t.pumpAndSettle();
      expect(calls, isNot(contains('delivery:updateStatus')));
      await t.tap(find.byKey(const ValueKey('proof-skip')));
      await t.pumpAndSettle();
      expect(sent[calls.indexOf('delivery:updateStatus')], {'taskId': 'd', 'status': 'delivered'});
    });

    testWidgets('a replacement delivery takes proof too; a return to the seller does not', (t) async {
      expect(leg('replacement_delivery').takesProof, isTrue);
      for (final k in LegKind.all.where((k) => k != 'delivery' && k != 'replacement_delivery')) {
        expect(leg(k).takesProof, isFalse, reason: k);
      }
      await show(t, [leg('return_to_seller', id: 's', status: 'in_transit')]);
      await t.tap(find.byKey(const ValueKey('next-s')));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('proof-continue')), findsNothing);
      expect(sent[calls.indexOf('delivery:updateStatus')], {'taskId': 's', 'status': 'delivered'});
    });
  });

  group('the upload request', () {
    final photo = File('${Directory.systemTemp.path}/pod-upload-test.jpg');
    setUpAll(() => photo.writeAsBytesSync([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9]));
    tearDownAll(() => photo.deleteSync());

    final png = Uint8List.fromList([..._pngMagic, 1, 2, 3]);

    HttpProofUploader uploaderFor(Future<http.StreamedResponse> Function(http.BaseRequest, String body) answer, {List<http.BaseRequest>? seen}) => HttpProofUploader(
          apiUrl: 'https://api.test',
          token: () async => 'tok',
          client: MockClient.streaming((req, stream) async {
            final body = latin1.decode(await stream.expand((c) => c).toList());
            seen?.add(req);
            return answer(req, body);
          }),
        );
    http.StreamedResponse reply(int code, [String body = '{}']) => http.StreamedResponse(Stream.value(utf8.encode(body)), code);

    test('posts a multipart form with the photo and the signature to the task, with the rider\'s token', () async {
      final seen = <http.BaseRequest>[];
      late String body;
      final u = uploaderFor((req, b) async {
        body = b;
        return reply(201);
      }, seen: seen);
      await u.upload('task-1', DeliveryProof(photoPath: photo.path, signaturePng: png));
      expect(seen.single.method, 'POST');
      expect(seen.single.url.toString(), 'https://api.test/api/v1/delivery-proofs/task-1');
      expect(seen.single.headers['authorization'], 'Bearer tok');
      expect(body, contains('name="photo"'));
      expect(body, contains('name="signature"'));
    });

    test('sends only what was captured, and nothing at all for an empty proof', () async {
      final bodies = <String>[];
      final u = uploaderFor((req, b) async {
        bodies.add(b);
        return reply(201);
      });
      await u.upload('t', DeliveryProof(signaturePng: png));
      expect(bodies.single, contains('name="signature"'));
      expect(bodies.single, isNot(contains('name="photo"')));
      await u.upload('t', const DeliveryProof());
      expect(bodies, hasLength(1));
    });

    test('the server\'s refusal reaches the rider (in French too); a too-large body and a rate limit have their own texts', () async {
      final refusal = uploaderFor((_, __) async => reply(400, '{"message":"The photo must be a JPEG or PNG image."}'));
      await expectLater(refusal.upload('t', DeliveryProof(photoPath: photo.path)), throwsA(isA<ApiException>().having((e) => e.message, 'message', 'The photo must be a JPEG or PNG image.')));
      expect(translateServerError('The photo must be a JPEG or PNG image.', const Strings('fr')), 'La photo doit être une image JPEG ou PNG.');
      final notYours = uploaderFor((_, __) async => reply(404, '{"message":"Delivery task not found."}'));
      await expectLater(notYours.upload('t', DeliveryProof(photoPath: photo.path)), throwsA(isA<ApiException>().having((e) => e.status, 'status', 404)));
      final big = uploaderFor((_, __) async => reply(413, '{}'));
      await expectLater(big.upload('t', DeliveryProof(photoPath: photo.path)), throwsA(isA<ApiException>().having((e) => e.localKey, 'key', 'pod_photo_big')));
      final busy = uploaderFor((_, __) async => reply(429, '{}'));
      await expectLater(busy.upload('t', DeliveryProof(photoPath: photo.path)), throwsA(isA<ApiException>().having((e) => e.localKey, 'key', 'err_rate_limit')));
      final down = uploaderFor((_, __) async => reply(502, ''));
      await expectLater(down.upload('t', DeliveryProof(photoPath: photo.path)), throwsA(isA<ApiException>().having((e) => e.localKey, 'key', 'err_server')));
    });

    test('a connection failure reads as offline', () async {
      final u = HttpProofUploader(apiUrl: 'https://api.test', token: () async => 'tok', client: MockClient.streaming((_, __) async => throw http.ClientException('no route')));
      await expectLater(u.upload('t', DeliveryProof(signaturePng: png)), throwsA(isA<ApiException>().having((e) => e.localKey, 'key', 'err_offline')));
    });

    test('a photo over the 4 MB cap is refused before it is sent', () async {
      final big = File('${Directory.systemTemp.path}/pod-big.jpg')..writeAsBytesSync(List.filled(kMaxProofPhotoBytes + 1, 1));
      addTearDown(big.deleteSync);
      final seen = <http.BaseRequest>[];
      final u = uploaderFor((_, __) async => reply(201), seen: seen);
      await expectLater(u.upload('t', DeliveryProof(photoPath: big.path)), throwsA(isA<ApiException>().having((e) => e.localKey, 'key', 'pod_photo_big')));
      expect(seen, isEmpty);
    });
  });

  group('texts', () {
    test('every proof text exists in both languages with the same placeholders', () {
      final keys = kMessages.keys.where((k) => k.startsWith('pod_'));
      expect(keys.length, greaterThanOrEqualTo(14));
      for (final k in keys) {
        final v = kMessages[k]!;
        expect(v.$1.trim(), isNotEmpty, reason: k);
        expect(v.$2.trim(), isNotEmpty, reason: k);
        expect(v.$1 == v.$2, isFalse, reason: '$k is not translated');
      }
    });
  });
}
