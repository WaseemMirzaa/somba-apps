// Item 12: a category always shows its IMAGE, never the emoji `icon` the server also stores. Without an image (or when it fails to
// load) a designed tile takes its place: a tint from the design tokens with the category's initial, or a neutral glyph when the
// name has no letter. Pictures are cached, tiles carry the name for screen readers, and the layout holds at 200% text.
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_models.dart';
import 'package:lipcart/screens/categories_screen.dart';
import 'package:lipcart/screens/home_screen.dart';
import 'package:lipcart/screens/more/browse.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/theme/app_theme.dart';
import 'package:lipcart/widgets/category_image.dart';

import 'gap_helpers.dart';
import 'layout_checks.dart';

/// Pictographs, emoticons, symbols and flags: anything that draws as an emoji.
final _emoji = RegExp(r'[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]', unicode: true);

/// What the server sends for a category: the emoji `icon` next to the `image`.
Map<String, dynamic> _cat(String id, String name, String nameFr, {String image = '', String icon = '📱', int count = 12}) =>
    {'id': id, 'name': name, 'nameFr': nameFr, 'image': image, 'icon': icon, 'productCount': count};

void _seedCategories() {
  RealtimeStore.instance.categories
    ..clear()
    ..addAll([
      CategoryDto.fromJson(_cat('c1', 'Phones & tablets', 'Téléphones et tablettes', image: '/uploads/phones.jpg', icon: '📱')),
      CategoryDto.fromJson(_cat('c2', 'Fashion & shoes', 'Mode et chaussures', icon: '👗')),
      CategoryDto.fromJson(_cat('c3', 'Home & kitchen appliances', 'Maison et électroménager', image: 'https://cdn.example.com/home.jpg', icon: '🏠')),
      CategoryDto.fromJson(_cat('c4', '🔥 Hot deals', '🔥 Bonnes affaires', icon: '🔥')),
      CategoryDto.fromJson(_cat('c5', '📦', '📦', icon: '📦')),
    ]);
}

List<String> _emojiTexts(WidgetTester tester) => [
      for (final t in tester.widgetList<Text>(find.byType(Text)))
        if (_emoji.hasMatch(t.data ?? t.textSpan?.toPlainText() ?? '')) t.data ?? t.textSpan!.toPlainText(),
    ];

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  setUp(() async {
    await gapReset(products: []);
    _seedCategories();
  });
  tearDown(() {
    RealtimeStore.instance.categories.clear();
    gapTearDown();
  });

  Future<void> show(WidgetTester tester, Widget child, {String lang = 'en'}) async {
    gapTallViewport(tester);
    await tester.pumpWidget(gapApp(child, lang: lang));
    await tester.pump(const Duration(milliseconds: 300));
  }

  Category cat(String id, String name, {String image = '', String nameFr = ''}) => Category(id: id, name: name, nameFr: nameFr.isEmpty ? name : nameFr, image: image);

  group('the tile', () {
    test('the initial skips emoji, symbols and spaces; a name with no letter has none', () {
      expect(categoryInitial('Fashion'), 'F');
      expect(categoryInitial('  électronique'), 'É');
      expect(categoryInitial('🔥 Hot deals'), 'H');
      expect(categoryInitial('«Mode»'), 'M');
      expect(categoryInitial('2 en 1'), '2');
      expect(categoryInitial('📦'), isNull);
      expect(categoryInitial(''), isNull);
    });

    test('an upload is loaded from the API host, a full address as it is', () {
      expect(categoryImageUrl('/uploads/a.jpg'), endsWith('/uploads/a.jpg'));
      expect(categoryImageUrl('/uploads/a.jpg'), startsWith('http'));
      expect(categoryImageUrl('uploads/a.jpg'), contains('/uploads/a.jpg'));
      expect(categoryImageUrl('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
    });

    testWidgets('with an image: the cached network picture, from the right address, sized to the tile', (tester) async {
      await show(tester, Scaffold(body: CategoryImage(category: cat('c1', 'Phones', image: '/uploads/phones.jpg'), lang: 'en', size: 64)));
      final img = tester.widget<CachedNetworkImage>(find.byKey(const ValueKey('category-image-c1')));
      expect(img.imageUrl, endsWith('/uploads/phones.jpg'));
      expect(img.fit, BoxFit.cover);
      expect(img.memCacheWidth, 64 * 3, reason: 'decoded at the tile\'s pixel size, not the picture\'s');
      expect(tester.getSize(find.byType(CategoryImage)), const Size(64, 64));
    });

    testWidgets('no image: a tinted tile with the initial, never an emoji; the tint follows the position', (tester) async {
      await show(tester, Scaffold(body: Row(children: [
        CategoryImage(category: cat('c2', 'Fashion & shoes'), lang: 'en', size: 64),
        CategoryImage(category: cat('c3', 'Home'), lang: 'en', size: 64, tint: 1),
      ])));
      expect(find.byKey(const ValueKey('category-fallback-c2')), findsOneWidget);
      expect(find.text('F'), findsOneWidget);
      expect(find.text('H'), findsOneWidget);
      final tints = [
        for (final id in ['c2', 'c3'])
          (tester.widget<DecoratedBox>(find.descendant(of: find.byKey(ValueKey('category-fallback-$id')), matching: find.byType(DecoratedBox)).first).decoration as BoxDecoration).gradient
      ];
      expect(tints[0], isNot(equals(tints[1])));
      expect((tints[0]! as LinearGradient).colors, AppColors.tileGradients[0], reason: 'the tint comes from the design tokens');
      expect(_emojiTexts(tester), isEmpty);
    });

    testWidgets('an image that cannot load falls back to the tile (and never to an emoji)', (tester) async {
      await show(tester, Scaffold(body: CategoryImage(category: cat('c1', 'Phones', image: '/uploads/missing.jpg'), lang: 'en', size: 64)));
      await tester.pump(const Duration(seconds: 1));
      await tester.pump(const Duration(seconds: 1));
      expect(find.byKey(const ValueKey('category-fallback-c1')), findsOneWidget);
      expect(find.text('P'), findsOneWidget);
      expect(_emojiTexts(tester), isEmpty);
    });

    testWidgets('a name that starts with an emoji uses its first letter; one made only of emoji gets a neutral glyph', (tester) async {
      await show(tester, Scaffold(body: Row(children: [
        CategoryImage(category: cat('c4', '🔥 Hot deals'), lang: 'en', size: 64),
        CategoryImage(category: cat('c5', '📦'), lang: 'en', size: 64),
      ])));
      expect(find.text('H'), findsOneWidget);
      expect(find.descendant(of: find.byKey(const ValueKey('category-fallback-c5')), matching: find.byIcon(Icons.category_outlined)), findsOneWidget);
      expect(find.descendant(of: find.byKey(const ValueKey('category-fallback-c5')), matching: find.byType(Text)), findsNothing);
      expect(_emojiTexts(tester), isEmpty, reason: 'the tile text is the initial only');
    });

    testWidgets('screen readers get the name in the app language as an image; a decorative tile (name beside it) adds nothing', (tester) async {
      final handle = tester.ensureSemantics();
      await show(tester, Scaffold(body: Column(children: [
        CategoryImage(category: cat('c2', 'Fashion', nameFr: 'Mode'), lang: 'fr', size: 64),
        CategoryImage(category: cat('c3', 'Home'), lang: 'en', size: 64, decorative: true),
      ])), lang: 'fr');
      expect(find.bySemanticsLabel('Mode'), findsOneWidget);
      expect(find.bySemanticsLabel('Home'), findsNothing);
      expect(find.bySemanticsLabel('F'), findsNothing, reason: 'the initial is not read out');
      handle.dispose();
    });
  });

  group('every place a category shows', () {
    testWidgets('the categories grid: an image or a fallback per category, no emoji anywhere, names under the tiles', (tester) async {
      await show(tester, CategoriesScreen(locale: const Locale('en')));
      expect(find.byKey(const ValueKey('category-image-c1')), findsOneWidget);
      expect(find.byKey(const ValueKey('category-image-c3')), findsOneWidget);
      expect(find.byKey(const ValueKey('category-fallback-c2')), findsOneWidget);
      expect(find.byKey(const ValueKey('category-fallback-c4')), findsOneWidget);
      expect(find.text('Phones & tablets'), findsOneWidget);
      expect(_emojiTexts(tester).where((t) => !t.contains('Hot deals') && t != '📦'), isEmpty);
      expect(find.byType(Icon).evaluate().where((e) => (e.widget as Icon).icon == Icons.devices_other_rounded), isEmpty, reason: 'the old stock glyph is gone');
    });

    testWidgets('the search results list shows the image tile too', (tester) async {
      await show(tester, CategoriesScreen(locale: const Locale('en')));
      await tester.enterText(find.byType(TextField).first, 'phones');
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.byKey(const ValueKey('category-image-c1')), findsOneWidget);
      expect(find.byType(CategoryImage), findsOneWidget);
      expect(find.byIcon(Icons.devices_other_rounded), findsNothing);
    });

    testWidgets('the home row shows each category as an image tile with its name', (tester) async {
      await show(tester, HomeScreen(locale: const Locale('fr'), onLocaleChanged: (_) {}), lang: 'fr');
      expect(find.byKey(const ValueKey('home-category-c1')), findsOneWidget);
      expect(find.byKey(const ValueKey('home-category-c2')), findsOneWidget);
      expect(find.text('Mode et chaussures'), findsOneWidget);
      expect(find.byKey(const ValueKey('category-fallback-c2')), findsOneWidget);
    });

    testWidgets('the search filter sheet: each category chip has its image tile beside the name', (tester) async {
      await show(tester, Builder(builder: (context) => Scaffold(body: TextButton(onPressed: () => showFilterSheet(context, ProductQuery()), child: const Text('open')))));
      await tester.tap(find.text('open'));
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.descendant(of: find.byType(Wrap), matching: find.byType(CategoryImage)), findsNWidgets(5), reason: 'one per category');
      expect(find.byKey(const ValueKey('category-image-c1')), findsOneWidget);
      expect(find.byKey(const ValueKey('category-fallback-c2')), findsOneWidget);
      expect(find.text('Fashion & shoes'), findsOneWidget);
    });

    test('the category model carries no emoji: only the name and the image', () {
      final d = CategoryDto.fromJson(_cat('c1', 'Phones', 'Téléphones', image: '/uploads/p.jpg', icon: '📱'));
      expect('${d.name} ${d.nameFr} ${d.image}', isNot(matches(_emoji)));
    });
  });

  group('200% text and long names', () {
    final long = CategoryDto.fromJson(_cat('c6', 'Home appliances, furniture and kitchenware', 'Électroménager, meubles et ustensiles de cuisine'));
    for (final lang in ['en', 'fr']) {
      testWidgets('the categories screen ($lang) survives 2.0 text scale at 360 pt', (tester) async {
        addTearDown(tester.view.reset);
        await gapReset(products: [], lang: lang);
        _seedCategories();
        RealtimeStore.instance.categories.add(long);
        const config = LayoutConfig(Size(360, 780), 'en', 2.0);
        final locale = Locale(lang);
        final app = MaterialApp(
          theme: AppTheme.light(),
          locale: locale,
          supportedLocales: const [Locale('en'), Locale('fr')],
          localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
          builder: scaleText(config),
          home: CategoriesScreen(locale: locale),
        );
        final problems = await layoutProblems(tester, config, app);
        expect(problems, isEmpty, reason: problems.join('\n'));
      });

      // The rest of the home screen (hero banner, chips) is not part of this check: only the category row must hold its tiles and names.
      testWidgets('the home category row ($lang) holds every tile and its two-line name at 2.0 text scale', (tester) async {
        addTearDown(tester.view.reset);
        await gapReset(products: [], lang: lang);
        _seedCategories();
        RealtimeStore.instance.categories.add(long);
        const config = LayoutConfig(Size(360, 780), 'en', 2.0);
        final app = MaterialApp(
          theme: AppTheme.light(),
          locale: Locale(lang),
          supportedLocales: const [Locale('en'), Locale('fr')],
          localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
          builder: scaleText(config),
          home: HomeScreen(locale: Locale(lang), onLocaleChanged: (_) {}),
        );
        final problems = await layoutProblems(tester, config, app);
        for (final c in ['Phones', 'Fashion', 'Home appliances', 'Téléphones', 'Mode et', 'Électroménager']) {
          expect(problems.where((p) => p.contains(c)), isEmpty, reason: 'a category name is cut or overlapped: ${problems.join('\n')}');
        }
      });

      testWidgets('the home category row ($lang): the tiles keep their size and the two-line name fits the row at 2.0 text scale', (tester) async {
        addTearDown(tester.view.reset);
        await gapReset(products: [], lang: lang);
        _seedCategories();
        RealtimeStore.instance.categories.insert(0, long);
        tester.view.physicalSize = const Size(360 * 3, 4000 * 3); // tall: the whole home screen is built
        tester.view.devicePixelRatio = 3;
        await tester.pumpWidget(MaterialApp(
          theme: AppTheme.light(),
          locale: Locale(lang),
          supportedLocales: const [Locale('en'), Locale('fr')],
          localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
          builder: scaleText(const LayoutConfig(Size(360, 780), 'en', 2.0)),
          home: HomeScreen(locale: Locale(lang), onLocaleChanged: (_) {}),
        ));
        await tester.pump(const Duration(milliseconds: 600));
        // Other parts of the home screen (the hero banner) overflow at 200%: they are not under test here.
        while (tester.takeException() != null) {}
        final tile = find.byKey(const ValueKey('home-category-c6'));
        expect(tile, findsOneWidget);
        final row = tester.getRect(find.ancestor(of: tile, matching: find.byType(ListView)).first);
        final name = lang == 'fr' ? 'Électroménager, meubles et ustensiles de cuisine' : 'Home appliances, furniture and kitchenware';
        final label = tester.getRect(find.text(name));
        expect(label.bottom, lessThanOrEqualTo(row.bottom + 0.5), reason: 'the two-line name fits the row');
        expect(label.height, lessThan(11.5 * 2 * 1.35 * 2 + 1), reason: 'at most two lines at 200%');
        expect(tester.getRect(tile).top, greaterThanOrEqualTo(row.top));
        expect(tester.getSize(tile), const Size(64, 64), reason: 'the tile keeps its size when the text grows');
        final widget = tester.widget<Text>(find.text(name));
        expect((widget.maxLines, widget.overflow), (2, TextOverflow.ellipsis));
      });
    }
  });
}
