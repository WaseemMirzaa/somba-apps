// Product picture gallery: paging with dots, the tile fallback, and the full-screen pager with zoom.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/screens/more/engage_gallery.dart';
import 'package:lipcart/screens/product_detail_screen.dart';
import 'package:lipcart/widgets/product_gallery.dart';

import 'engage_helpers.dart';
import 'gap_helpers.dart';

const _three = ['https://img.example.com/a.png', 'https://img.example.com/b.png', 'https://img.example.com/c.png'];

Future<void> _open(WidgetTester tester, Map<String, dynamic> extra, {String lang = 'en'}) async {
  gapTallViewport(tester);
  await engageReset(products: [engageDto('p1', extra: extra)], lang: lang);
  await tester.pumpWidget(gapApp(ProductDetailScreen(product: productOf('p1'), locale: Locale(lang)), lang: lang));
  await tester.pump();
}

Finder get _pages => find.byKey(const ValueKey('gallery-pages'));
Finder _dot(int i, {required bool on}) => find.byKey(ValueKey('page-dot-$i${on ? '-on' : ''}'));

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  tearDown(engageTearDown);

  testWidgets('several pictures: a swipeable gallery with one dot per picture; the first is the cover', (tester) async {
    await _open(tester, {'image': _three.first, 'images': _three});
    expect(find.byType(ProductGallery), findsOneWidget);
    expect(_pages, findsOneWidget);
    expect(find.byKey(const ValueKey('page-dots')), findsOneWidget);
    expect(_dot(0, on: true), findsOneWidget);
    expect(_dot(1, on: false), findsOneWidget);
    expect(_dot(2, on: false), findsOneWidget);

    await tester.drag(_pages, const Offset(-400, 0));
    await tester.pumpAndSettle();
    expect(_dot(1, on: true), findsOneWidget);
    expect(_dot(0, on: false), findsOneWidget);

    await tester.drag(_pages, const Offset(-400, 0));
    await tester.pumpAndSettle();
    expect(_dot(2, on: true), findsOneWidget);

    await tester.drag(_pages, const Offset(400, 0));
    await tester.pumpAndSettle();
    expect(_dot(1, on: true), findsOneWidget);
  });

  testWidgets('one picture: no dots and no paging worth showing', (tester) async {
    await _open(tester, {'image': _three.first});
    expect(find.byType(ProductGallery), findsOneWidget);
    expect(find.byKey(const ValueKey('page-dots')), findsNothing);
  });

  testWidgets('an old payload (only `image`) is a gallery of one that still opens full screen', (tester) async {
    await _open(tester, {'image': _three.first});
    await tester.tap(find.byKey(const ValueKey('gallery-page-0')));
    await tester.pumpAndSettle();
    expect(find.byType(GalleryScreen), findsOneWidget);
    expect(find.byKey(const ValueKey('gallery-counter')), findsNothing, reason: 'a single picture needs no counter');
  });

  testWidgets('no picture at all (empty cover): the category tile, nothing to open', (tester) async {
    await _open(tester, {'image': '', 'images': <String>[]});
    expect(find.byKey(const ValueKey('page-dots')), findsNothing);
    expect(_pages, findsNothing);
    expect(find.byIcon(Icons.devices_other_rounded), findsWidgets, reason: 'the Electronics tile glyph');
  });

  testWidgets('a tap opens the pictures full screen on the page that was tapped, with a counter', (tester) async {
    await _open(tester, {'image': _three.first, 'images': _three});
    await tester.drag(_pages, const Offset(-400, 0));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('gallery-page-1')));
    await tester.pumpAndSettle();
    expect(find.byType(GalleryScreen), findsOneWidget);
    expect(find.text('2 of 3'), findsOneWidget);
    expect(find.byKey(const ValueKey('fullscreen-zoom-1')), findsOneWidget);

    await tester.drag(find.byKey(const ValueKey('fullscreen-pages')), const Offset(-500, 0));
    await tester.pumpAndSettle();
    expect(find.text('3 of 3'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('gallery-close')));
    await tester.pumpAndSettle();
    expect(find.byType(GalleryScreen), findsNothing);
    expect(find.byType(ProductDetailScreen), findsOneWidget);
  });

  testWidgets('full screen in French', (tester) async {
    await _open(tester, {'image': _three.first, 'images': _three}, lang: 'fr');
    await tester.tap(find.byKey(const ValueKey('gallery-page-0')));
    await tester.pumpAndSettle();
    expect(find.text('1 sur 3'), findsOneWidget);
  });

  testWidgets('pinch to zoom: the picture can be scaled up to 4x, double tap zooms in and out', (tester) async {
    await _open(tester, {'image': _three.first, 'images': _three});
    await tester.tap(find.byKey(const ValueKey('gallery-page-0')));
    await tester.pumpAndSettle();
    final viewer = tester.widget<InteractiveViewer>(find.byKey(const ValueKey('fullscreen-zoom-0')));
    expect(viewer.minScale, 1);
    expect(viewer.maxScale, 4);
    final c = viewer.transformationController!;
    expect(c.value.getMaxScaleOnAxis(), 1);

    // A real pinch: two fingers moving apart.
    final center = tester.getCenter(find.byKey(const ValueKey('fullscreen-zoom-0')));
    final a = await tester.startGesture(center - const Offset(20, 0), pointer: 1);
    final b = await tester.startGesture(center + const Offset(20, 0), pointer: 2);
    await tester.pump();
    await a.moveBy(const Offset(-60, 0));
    await b.moveBy(const Offset(60, 0));
    await tester.pump();
    await a.up();
    await b.up();
    await tester.pumpAndSettle();
    expect(c.value.getMaxScaleOnAxis(), greaterThan(1.5));
    expect(c.value.getMaxScaleOnAxis(), lessThanOrEqualTo(4.0001));

    // Double tap goes back to the whole picture, and again to the zoomed view.
    c.value = Matrix4.identity();
    final spot = find.byKey(const ValueKey('fullscreen-zoom-0'));
    await tester.tap(spot);
    await tester.pump(const Duration(milliseconds: 60));
    await tester.tap(spot);
    await tester.pumpAndSettle();
    expect(c.value.getMaxScaleOnAxis(), closeTo(2.5, 0.01));
    await tester.tap(spot);
    await tester.pump(const Duration(milliseconds: 60));
    await tester.tap(spot);
    await tester.pumpAndSettle();
    expect(c.value.getMaxScaleOnAxis(), closeTo(1, 0.01));
  });

  testWidgets('while a picture is zoomed in a drag pans it instead of turning the page', (tester) async {
    await _open(tester, {'image': _three.first, 'images': _three});
    await tester.tap(find.byKey(const ValueKey('gallery-page-0')));
    await tester.pumpAndSettle();
    final spot = find.byKey(const ValueKey('fullscreen-zoom-0'));
    await tester.tap(spot);
    await tester.pump(const Duration(milliseconds: 60));
    await tester.tap(spot);
    await tester.pumpAndSettle();
    final pager = tester.widget<PageView>(find.byKey(const ValueKey('fullscreen-pages')));
    expect(pager.physics, isA<NeverScrollableScrollPhysics>());
  });

  testWidgets('the gallery follows a product:updated that adds pictures', (tester) async {
    await _open(tester, {'image': _three.first});
    expect(find.byKey(const ValueKey('page-dots')), findsNothing);
    pushProduct({
      'id': 'p1', 'name': 'Item p1', 'nameFr': 'Article p1', 'price': 20, 'originalPrice': 20, 'category': 'Electronics', 'stock': 5,
      'image': _three.first, 'images': _three, 'sellerId': 's1', 'sellerName': 'Kinshasa Traders', //
    });
    await tester.pump();
    expect(find.byKey(const ValueKey('page-dots')), findsOneWidget);
    expect(_dot(2, on: false), findsOneWidget);
  });

  testWidgets('the gallery has labels for screen readers: "Photo 1 of 3: Item p1"', (tester) async {
    await _open(tester, {'image': _three.first, 'images': _three});
    expect(find.bySemanticsLabel('Photo 1 of 3: Item p1'), findsOneWidget);
  });
}
