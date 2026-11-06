// Photos in reviews (customer app): pick and upload up to 4 with the review, the review carries them to the server,
// refusals and slow uploads are announced in a snackbar, and a review's photos show on the reviews screen and the
// product page (and open full screen). Reviews without photos are unchanged.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/more/catalog_extra.dart';
import 'package:lipcart/screens/more/shop_extra.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/services/upload_service.dart';
import 'package:lipcart/theme/app_theme.dart';
import 'package:lipcart/widgets/photo_picker.dart';

import 'button_rules.dart';
import 'gap_helpers.dart';
import 'social_helpers.dart';

Map<String, dynamic>? sent;
Object? createError;
List<Map<String, dynamic>> listed = [];

Future<dynamic> _server(String event, [Map<String, dynamic>? body]) async {
  switch (event) {
    case 'reviews:create':
      if (createError != null) throw createError!;
      sent = body;
      return {'id': 'r-new', 'author': 'Aline', 'rating': body!['rating'], 'text': body['text'], 'photos': body['photos'] ?? const []};
    case 'reviews:list':
      return listed;
    default:
      return const <dynamic>[];
  }
}

/// Opens the compose screen the way the app does (pushed from the reviews screen), so "thank you" can pop it.
Future<void> _open(WidgetTester tester, {String lang = 'en', double scale = 1}) async {
  gapTallViewport(tester);
  await Strings.setLang(lang, persist: false);
  final p = productByUuid('p1')!;
  await tester.pumpWidget(MaterialApp(
    theme: AppTheme.light(),
    locale: Locale(lang),
    supportedLocales: const [Locale('en'), Locale('fr')],
    localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
    builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)), child: child!),
    home: Builder(
        builder: (context) => Scaffold(
              body: Center(
                  child: TextButton(
                      key: const ValueKey('open'),
                      onPressed: () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => ReviewComposeScreen(locale: Locale(lang), product: p))),
                      child: const Text('open'))),
            )),
  ));
  await tester.tap(find.byKey(const ValueKey('open')));
  await tester.pumpAndSettle();
}

Future<void> _pickPhotos(WidgetTester tester, {bool upload = true}) async {
  await tester.ensureVisible(find.byKey(const ValueKey('photo-add')));
  await tester.tap(find.byKey(const ValueKey('photo-add')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const ValueKey('photo-library')));
  // A photo still uploading shows a spinner that never settles.
  upload ? await tester.pumpAndSettle() : await tester.pump(const Duration(milliseconds: 600));
}

Future<void> _submit(WidgetTester tester) async {
  await tester.enterText(find.byKey(const ValueKey('review-text')), 'Very good, see the photos');
  await tester.ensureVisible(find.byType(FilledButton));
  await tester.tap(find.byType(FilledButton));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  setUp(() async {
    await socialReset();
    sent = null;
    createError = null;
    listed = [];
    RealtimeStore.instance.debugCallRequest = _server;
  });
  tearDown(socialTearDown);

  group('writing a review with photos', () {
    testWidgets('the picked photos are uploaded and travel with the review; the customer is thanked', (tester) async {
      fakePhotos(2);
      await _open(tester);
      await _pickPhotos(tester);
      expect(find.byType(Image), findsNWidgets(2), reason: 'two thumbnails');
      await _submit(tester);
      expect(sent, {'productId': 'p1', 'rating': 5, 'text': 'Very good, see the photos', 'photos': ['/uploads/photo-1.jpg', '/uploads/photo-2.jpg']});
      expect(find.text('Thanks for your review!'), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 600));
      expect(find.byType(ReviewComposeScreen), findsNothing, reason: 'back to where the customer came from');
    });

    testWidgets('no more than 4: a library that returns six adds four, and the picker then offers no more', (tester) async {
      var n = 0;
      UploadService.debugUpload = (b, f) async => '/uploads/photo-${++n}.jpg';
      debugPhotoSource = (source, remaining) async => [for (var i = 0; i < 6; i++) XFile.fromData(tinyPng, name: 'p$i.jpg')];
      await _open(tester);
      await _pickPhotos(tester);
      expect(find.byType(Image), findsNWidgets(4));
      expect(find.byKey(const ValueKey('photo-add')), findsNothing);
      await _submit(tester);
      expect((sent!['photos'] as List), hasLength(4));
    });

    testWidgets('a removed photo is not sent; a review with no photos sends none', (tester) async {
      fakePhotos(2);
      await _open(tester);
      await _pickPhotos(tester);
      await tester.tap(find.byIcon(Icons.close_rounded).first);
      await tester.pump();
      await _submit(tester);
      expect(sent!['photos'], ['/uploads/photo-2.jpg']);

      sent = null;
      await _open(tester);
      await _submit(tester);
      expect(sent!.containsKey('photos'), isFalse);
    });

    testWidgets('the send waits for a photo that is still uploading, and says so', (tester) async {
      final gate = Completer<String>();
      UploadService.debugUpload = (b, f) => gate.future;
      debugPhotoSource = (source, remaining) async => [XFile.fromData(tinyPng, name: 'p.jpg')];
      await _open(tester);
      await _pickPhotos(tester, upload: false);
      await _submit(tester);
      expect(sent, isNull, reason: 'nothing was sent');
      expect(find.text('Wait until the photos have finished uploading.'), findsOneWidget);
      gate.complete('/uploads/late.jpg');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(FilledButton));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(sent!['photos'], ['/uploads/late.jpg']);
    });

    testWidgets('a photo that fails to upload is dropped with a snackbar, the rest still go', (tester) async {
      var n = 0;
      UploadService.debugUpload = (b, f) async {
        if (++n == 1) throw ApiException('Only JPEG, PNG, WebP or HEIC images are allowed.');
        return '/uploads/ok.jpg';
      };
      debugPhotoSource = (source, remaining) async => [for (var i = 0; i < 2; i++) XFile.fromData(tinyPng, name: 'p$i.jpg')];
      await _open(tester);
      await _pickPhotos(tester);
      expect(find.text('Only JPEG, PNG, WebP or HEIC images are allowed.'), findsOneWidget);
      await _submit(tester);
      expect(sent!['photos'], ['/uploads/ok.jpg']);
    });

    testWidgets('the server refusing the review is a snackbar (in French too), and the form stays usable', (tester) async {
      fakePhotos(1);
      createError = ApiException('You can attach up to 4 photos.');
      await _open(tester, lang: 'fr');
      await _pickPhotos(tester);
      await _submit(tester);
      expect(find.text('Vous pouvez joindre 4 photos au maximum.'), findsOneWidget);
      expect(find.byType(ReviewComposeScreen), findsOneWidget);
      createError = null;
      await tester.pump(const Duration(seconds: 5));
      await tester.tap(find.byType(FilledButton));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(sent!['photos'], ['/uploads/photo-1.jpg']);
    });

    testWidgets('the form follows the button rules and is in French', (tester) async {
      await _open(tester, lang: 'fr');
      expect(find.text('Photos (facultatif)'), findsOneWidget);
      expectButtonRules(tester);
    });
  });

  group('reading reviews with photos', () {
    final withPhotos = {
      'id': 'r1',
      'author': 'Bénédicte',
      'rating': 5,
      'text': 'Exactly as pictured.',
      'photos': ['/uploads/a.jpg', '/uploads/b.jpg']
    };
    final plain = {'id': 'r2', 'author': 'Paul', 'rating': 4, 'text': 'Fine.'};

    test('ReviewDto reads the list of photos; a missing or odd value is an empty list', () {
      expect(ReviewDto.fromJson(withPhotos).photos, ['/uploads/a.jpg', '/uploads/b.jpg']);
      expect(ReviewDto.fromJson(plain).photos, isEmpty);
      expect(ReviewDto.fromJson({...plain, 'photos': 'nope'}).photos, isEmpty);
      expect(ReviewDto.fromJson({...plain, 'photos': ['/ok.jpg', 3, '']}).photos, ['/ok.jpg']);
    });

    testWidgets('the reviews screen shows each review\'s photos, and a tap opens one full screen', (tester) async {
      listed = [withPhotos, plain];
      gapTallViewport(tester);
      await tester.pumpWidget(gapApp(ReviewsScreen(product: productByUuid('p1')!)));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.byKey(const ValueKey('review-photos-r1')), findsOneWidget);
      expect(find.byKey(const ValueKey('review-photos-r2')), findsNothing);
      expect(find.descendant(of: find.byKey(const ValueKey('review-photos-r1')), matching: find.byType(Image)), findsNWidgets(2));
      await tester.tap(find.descendant(of: find.byKey(const ValueKey('review-photos-r1')), matching: find.byKey(const ValueKey('photo-1'))));
      await tester.pumpAndSettle();
      expect(find.byType(Dialog), findsOneWidget);
    });

    testWidgets('the photo thumbnails carry a label for screen readers, in both languages', (tester) async {
      listed = [withPhotos];
      gapTallViewport(tester);
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(gapApp(ReviewsScreen(product: productByUuid('p1')!), lang: 'fr'));
      await Strings.setLang('fr', persist: false);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.bySemanticsLabel('Photo de l’avis 1 sur 2'), findsOneWidget);
      expect(find.bySemanticsLabel('Photo de l’avis 2 sur 2'), findsOneWidget);
      handle.dispose();
    });
  });
}
