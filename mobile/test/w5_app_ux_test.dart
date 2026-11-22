// R5 W5: the shared EN | FR switcher, the keyboard rules (tap outside, back, a button that leaves the screen), and the home
// carousel built from CMS blocks (picture or designed gradient, button, link, schedule, order, live updates).
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/home_screen.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/theme/app_theme.dart';
import 'package:lipcart/widgets/cms_card.dart';
import 'package:lipcart/widgets/keyboard.dart';
import 'package:lipcart/widgets/kit.dart';
import 'package:lipcart/widgets/language_switcher.dart';

Widget _app(Widget home, {Locale locale = const Locale('en'), bool keyboardRules = true}) => MaterialApp(
      theme: AppTheme.light(),
      locale: locale,
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      navigatorObservers: keyboardRules ? [KeyboardDismissObserver()] : const [],
      builder: keyboardRules ? (_, child) => KeyboardDismisser(child: child ?? const SizedBox.shrink()) : null,
      home: home,
    );

BannerDto _card(String title, {Map<String, dynamic> extra = const {}}) =>
    BannerDto.fromJson({'id': 'id-$title', 'key': 'k-$title', 'title': title, 'titleFr': 'FR $title', 'body': 'Body $title', 'bodyFr': 'Corps $title', ...extra});

bool _keyboardOpen(WidgetTester t) => t.testTextInput.isVisible;

void main() {
  group('LanguageSwitcher', () {
    for (final tone in LanguageSwitcherTone.values) {
      testWidgets('$tone: shows EN and FR, switches once, ignores the language in use', (tester) async {
        final picked = <String>[];
        var locale = const Locale('en');
        await tester.pumpWidget(_app(Scaffold(
          body: StatefulBuilder(
            builder: (_, set) => Center(
              child: LanguageSwitcher(tone: tone, locale: locale, onChanged: (l) => set(() {
                    picked.add(l.languageCode);
                    locale = l;
                  })),
            ),
          ),
        )));
        expect(find.text('EN'), findsOneWidget);
        expect(find.text('FR'), findsOneWidget);
        await tester.tap(find.byKey(const ValueKey('lang-switch-en')));
        await tester.pump();
        expect(picked, isEmpty, reason: 'English is already on');
        await tester.tap(find.byKey(const ValueKey('lang-switch-fr')));
        await tester.pump();
        expect(picked, ['fr']);
        expect(tester.widget<Material>(find.ancestor(of: find.byKey(const ValueKey('lang-switch-fr')), matching: find.byType(Material)).first).color, isNot(Colors.transparent));
        await tester.tap(find.byKey(const ValueKey('lang-switch-fr')));
        await tester.pump();
        expect(picked, ['fr'], reason: 'French is already on');
        // 44 pt touch target: the pill's height is its 36 pt segment plus the padding around it.
        expect(tester.getSize(find.byType(LanguageSwitcher)).height, greaterThanOrEqualTo(44));
      });
    }

    testWidgets('the home app bar carries the switcher (no circle translate button) and it switches the app language', (tester) async {
      final picked = <String>[];
      RealtimeStore.instance.banners.clear();
      await tester.pumpWidget(_app(Scaffold(body: HomeScreen(locale: const Locale('en'), onLocaleChanged: (l) => picked.add(l.languageCode)))));
      await tester.pump();
      expect(find.byType(LanguageSwitcher), findsOneWidget);
      expect(find.byIcon(Icons.translate_rounded), findsNothing);
      await tester.tap(find.byKey(const ValueKey('lang-switch-fr')));
      expect(picked, ['fr']);
    });

    testWidgets('the language badge is drawn from the palette: three bands, labelled for screen readers', (tester) async {
      await tester.pumpWidget(_app(const Scaffold(body: Center(child: LanguageBadge()))));
      final colors = tester.widgetList<ColoredBox>(find.descendant(of: find.byType(LanguageBadge), matching: find.byType(ColoredBox))).map((c) => c.color).toList();
      expect(colors, [AppColors.royalBlue, AppColors.surface, AppColors.primary]);
      expect(find.bySemanticsLabel('Français / English'), findsOneWidget);
    });
  });

  group('keyboard', () {
    testWidgets('a tap outside the field closes the keyboard; a tap on the field keeps it', (tester) async {
      await tester.pumpWidget(_app(Scaffold(
        body: Column(children: [
          const Padding(padding: EdgeInsets.all(16), child: AppField(label: 'Name', hint: 'name')),
          const Expanded(child: Center(child: Text('empty area'))),
        ]),
      )));
      await tester.tap(find.byType(TextField));
      await tester.pump();
      expect(_keyboardOpen(tester), isTrue);
      await tester.tap(find.byType(TextField));
      await tester.pump();
      expect(_keyboardOpen(tester), isTrue, reason: 'tapping the field itself does not close it');
      await tester.tap(find.text('empty area'));
      await tester.pump();
      expect(_keyboardOpen(tester), isFalse);
      expect(FocusManager.instance.primaryFocus?.context?.widget is EditableText, isFalse);
    });

    testWidgets('a plain TextField (no onTapOutside of its own) is closed by the app-wide rule; without the rule it stays open', (tester) async {
      for (final rules in [false, true]) {
        await tester.pumpWidget(_app(
          const Scaffold(body: Column(children: [Padding(padding: EdgeInsets.all(16), child: TextField()), Expanded(child: Center(child: Text('empty area')))])),
          keyboardRules: rules,
        ));
        await tester.tap(find.byType(TextField));
        await tester.pump();
        expect(_keyboardOpen(tester), isTrue);
        await tester.tap(find.text('empty area'));
        await tester.pump();
        expect(_keyboardOpen(tester), !rules ? isTrue : isFalse, reason: 'rules: $rules');
        await tester.pumpWidget(const SizedBox());
      }
    });

    testWidgets('a field closes the keyboard when a button elsewhere is tapped (onTapOutside)', (tester) async {
      var pressed = 0;
      await tester.pumpWidget(_app(Scaffold(
        body: Column(children: [
          const Padding(padding: EdgeInsets.all(16), child: AppField(label: 'Name', hint: 'name')),
          TextButton(onPressed: () => pressed++, child: const Text('Other button')),
        ]),
      )));
      await tester.tap(find.byType(TextField));
      await tester.pump();
      expect(_keyboardOpen(tester), isTrue);
      await tester.tap(find.text('Other button'));
      await tester.pump();
      expect(pressed, 1, reason: 'the button still works');
      expect(_keyboardOpen(tester), isFalse);
    });

    testWidgets('back with the keyboard open closes it and returns to the previous screen', (tester) async {
      await tester.pumpWidget(_app(Builder(
        builder: (context) => Scaffold(
          body: Center(child: TextButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const _FormPage())), child: const Text('Open'))),
        ),
      )));
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(TextField));
      await tester.pump();
      expect(_keyboardOpen(tester), isTrue);
      await tester.tap(find.byIcon(Icons.arrow_back_rounded));
      await tester.pumpAndSettle();
      expect(find.text('Open'), findsOneWidget);
      expect(_keyboardOpen(tester), isFalse);
    });

    testWidgets('the system back (a pop from anywhere) closes the keyboard too', (tester) async {
      await tester.pumpWidget(_app(Builder(
        builder: (context) => Scaffold(
          body: Center(child: TextButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const _FormPage())), child: const Text('Open'))),
        ),
      )));
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(TextField));
      await tester.pump();
      expect(_keyboardOpen(tester), isTrue);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Open'), findsOneWidget);
      expect(_keyboardOpen(tester), isFalse);
    });

    testWidgets('opening another screen from a field screen closes the keyboard', (tester) async {
      await tester.pumpWidget(_app(Builder(
        builder: (context) => Scaffold(
          body: Column(children: [
            const AppField(label: 'Name', hint: 'name'),
            TextButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const Scaffold(body: Text('Next page')))), child: const Text('Go')),
          ]),
        ),
      )));
      await tester.tap(find.byType(TextField));
      await tester.pump();
      expect(_keyboardOpen(tester), isTrue);
      await tester.tap(find.text('Go'));
      await tester.pumpAndSettle();
      expect(find.text('Next page'), findsOneWidget);
      expect(_keyboardOpen(tester), isFalse);
    });
  });

  group('home carousel from the CMS', () {
    setUp(() => RealtimeStore.instance.banners.clear());
    tearDown(() {
      RealtimeStore.instance.banners.clear();
      cardUrlLauncher = (uri) async => false;
    });

    Future<void> pumpCard(WidgetTester t, BannerDto b, {String lang = 'en', VoidCallback? onOpen, int index = 0}) => t.pumpWidget(
        _app(Scaffold(body: Center(child: SizedBox(height: 188, width: 340, child: CmsHomeCard(banner: b, index: index, lang: lang, onOpen: onOpen))))));

    testWidgets('without a picture the card draws the gradient of its colour token, in both languages', (tester) async {
      final b = _card('Sale', extra: {'colorKey': 'blue'});
      await pumpCard(tester, b);
      expect(find.text('Sale'), findsOneWidget);
      expect(find.text('Body Sale'), findsOneWidget);
      final deco = tester.widget<DecoratedBox>(find.byKey(const ValueKey('cms-card-fallback'))).decoration as BoxDecoration;
      expect(deco.gradient, cardGradientFor('blue', 0));
      expect(cardGradientFor('blue', 0), isNot(cardGradientFor(null, 0)));
      expect(find.byType(CachedNetworkImage), findsNothing);
      await pumpCard(tester, b, lang: 'fr');
      expect(find.text('FR Sale'), findsOneWidget);
      expect(find.text('Corps Sale'), findsOneWidget);
    });

    testWidgets('an unknown colour falls back to the rotation by position', (tester) async {
      expect(cardGradientFor('pink', 1), cardGradientFor('deal', 0));
      expect(cardGradientFor(null, 2), cardGradientFor('blue', 0));
    });

    testWidgets('with a picture the card loads it on a scrim; the gradient stays as the fallback', (tester) async {
      await pumpCard(tester, _card('Photo', extra: {'imageUrl': 'https://example.invalid/a.jpg'}));
      expect(find.byKey(const ValueKey('cms-card-image')), findsOneWidget);
      expect(find.text('Photo'), findsOneWidget);
    });

    testWidgets('the button shows in the viewer\'s language and only when the card has a link', (tester) async {
      await pumpCard(tester, _card('A', extra: {'ctaText': 'Shop now', 'ctaTextFr': 'J’en profite', 'linkType': 'deals'}), lang: 'fr');
      expect(find.byKey(const ValueKey('cms-card-cta')), findsOneWidget);
      expect(find.text('J’en profite'), findsOneWidget);
      await pumpCard(tester, _card('A', extra: {'ctaText': 'Shop now', 'ctaTextFr': 'J’en profite', 'linkType': 'deals'}));
      expect(find.text('Shop now'), findsOneWidget);
      await pumpCard(tester, _card('A', extra: {'ctaText': 'Shop now'}));
      expect(find.byKey(const ValueKey('cms-card-cta')), findsNothing, reason: 'a button with nowhere to go is not drawn');
      await pumpCard(tester, _card('A', extra: {'linkType': 'deals'}));
      expect(find.byKey(const ValueKey('cms-card-cta')), findsNothing);
    });

    testWidgets('a card without a link is not tappable; a card with one is', (tester) async {
      await pumpCard(tester, _card('A'));
      expect(find.byKey(const ValueKey('cms-card-tap')), findsNothing);
      var opened = 0;
      await pumpCard(tester, _card('A', extra: {'linkType': 'deals'}), onOpen: () => opened++);
      await tester.tap(find.byKey(const ValueKey('cms-card-tap')));
      expect(opened, 1);
    });

    testWidgets('home: cards come from the store in the admin\'s order, with the switcher and no placeholder', (tester) async {
      RealtimeStore.instance.banners
        ..add(_card('Second', extra: {'sortOrder': 20}))
        ..add(_card('First', extra: {'sortOrder': 10}))
        ..sort(BannerDto.byOrder);
      await tester.pumpWidget(_app(Scaffold(body: HomeScreen(locale: const Locale('en'), onLocaleChanged: (_) {}))));
      await tester.pump();
      expect(find.text('First'), findsOneWidget);
      expect(find.text(const Strings('en').heroTitle), findsNothing);
    });

    testWidgets('home: with no cards one neutral welcome card shows', (tester) async {
      await tester.pumpWidget(_app(Scaffold(body: HomeScreen(locale: const Locale('en'), onLocaleChanged: (_) {}))));
      await tester.pump();
      expect(find.text(const Strings('en').heroTitle), findsOneWidget);
    });

    testWidgets('home: a card outside its schedule is not shown', (tester) async {
      final soon = DateTime.now().add(const Duration(days: 2)).toUtc().toIso8601String();
      final gone = DateTime.now().subtract(const Duration(days: 2)).toUtc().toIso8601String();
      RealtimeStore.instance.banners
        ..add(_card('Later', extra: {'startsAt': soon}))
        ..add(_card('Over', extra: {'endsAt': gone}));
      await tester.pumpWidget(_app(Scaffold(body: HomeScreen(locale: const Locale('en'), onLocaleChanged: (_) {}))));
      await tester.pump();
      expect(find.text('Later'), findsNothing);
      expect(find.text('Over'), findsNothing);
      expect(find.text(const Strings('en').heroTitle), findsOneWidget);
    });

    testWidgets('home: tapping a card with a web link opens it; a bad link says so in a snackbar', (tester) async {
      final launched = <Uri>[];
      cardUrlLauncher = (uri) async {
        launched.add(uri);
        return true;
      };
      RealtimeStore.instance.banners.add(_card('Web', extra: {'linkType': 'url', 'linkTarget': 'https://komoriko.example/offer', 'ctaText': 'Open', 'ctaTextFr': 'Ouvrir'}));
      await tester.pumpWidget(_app(Scaffold(body: HomeScreen(locale: const Locale('en'), onLocaleChanged: (_) {}))));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('cms-card-tap')));
      await tester.pump();
      expect(launched.single.toString(), 'https://komoriko.example/offer');

      launched.clear();
      RealtimeStore.instance.banners
        ..clear()
        ..add(_card('Bad', extra: {'linkType': 'url', 'linkTarget': 'http://insecure.example'}));
      RealtimeStore.instance.applyCmsUpdate({'id': 'zzz', 'key': 'zzz', 'active': false}); // any change redraws home
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('cms-card-tap')));
      await tester.pump();
      expect(launched, isEmpty, reason: 'only https opens');
      expect(find.text(const Strings('en').cmsCardLinkFailed), findsOneWidget);
    });

    testWidgets('home: a link to a product that is gone says the offer is no longer available', (tester) async {
      RealtimeStore.instance.banners.add(_card('Gone', extra: {'linkType': 'product', 'linkTarget': 'no-such-product'}));
      await tester.pumpWidget(_app(Scaffold(body: HomeScreen(locale: const Locale('fr'), onLocaleChanged: (_) {})), locale: const Locale('fr')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('cms-card-tap')));
      await tester.pump();
      expect(find.text(const Strings('fr').cmsCardMissing), findsOneWidget);
    });

    testWidgets('home: cms:updated adds, reorders, hides and deletes cards live', (tester) async {
      final store = RealtimeStore.instance;
      await tester.pumpWidget(_app(Scaffold(body: HomeScreen(locale: const Locale('en'), onLocaleChanged: (_) {}))));
      await tester.pump();
      expect(find.text(const Strings('en').heroTitle), findsOneWidget);

      store.applyCmsUpdate({'id': 'a', 'key': 'a', 'type': 'banner', 'active': true, 'title': 'Alpha', 'body': 'x', 'sortOrder': 20});
      await tester.pump();
      expect(find.text('Alpha'), findsOneWidget);
      expect(find.text(const Strings('en').heroTitle), findsNothing);

      store.applyCmsUpdate({'id': 'b', 'key': 'b', 'type': 'banner', 'active': true, 'title': 'Beta', 'body': 'x', 'sortOrder': 10});
      await tester.pump();
      expect(store.banners.map((e) => e.key), ['b', 'a'], reason: 'the lower position goes first');
      expect(find.text('Beta'), findsOneWidget);

      store.applyCmsUpdate({'id': 'b', 'key': 'b', 'type': 'banner', 'active': false}); // the stub of a card switched off
      await tester.pump();
      expect(store.banners.map((e) => e.key), ['a']);

      store.applyCmsUpdate({'id': 'a', 'key': 'a', 'deleted': true});
      await tester.pump();
      expect(store.banners, isEmpty);
      expect(find.text(const Strings('en').heroTitle), findsOneWidget);

      store.applyCmsUpdate({'id': 'p', 'key': 'p', 'type': 'page', 'active': true, 'title': 'Not a card', 'body': 'x'});
      expect(store.banners, isEmpty, reason: 'only banners are cards');
    });
  });

  test('BannerDto reads the new fields and keeps working for an older server', () {
    final old = BannerDto.fromJson({'title': 'T', 'body': 'B'});
    expect([old.imageUrl, old.linkType, old.ctaText, old.colorKey, old.startsAt, old.endsAt], everyElement(isNull));
    expect(old.sortOrder, 0);
    expect(old.hasLink, isFalse);
    expect(old.isLiveAt(DateTime.now()), isTrue);
    final b = BannerDto.fromJson({'title': 'T', 'body': 'B', 'linkType': 'deals', 'ctaTextFr': 'Voir', 'startsAt': '2026-01-01T00:00:00Z', 'endsAt': '2026-02-01T00:00:00Z'});
    expect(b.hasLink, isTrue);
    expect(b.displayCta('en'), 'Voir', reason: 'the other language when one is empty');
    expect(b.isLiveAt(DateTime.utc(2026, 1, 15)), isTrue);
    expect(b.isLiveAt(DateTime.utc(2026, 2, 2)), isFalse);
    expect(b.isLiveAt(DateTime.utc(2025, 12, 31)), isFalse);
    expect(BannerDto.fromJson({'title': 'T', 'body': 'B', 'linkType': 'product'}).hasLink, isFalse, reason: 'a product link needs its id');
  });
}

class _FormPage extends StatelessWidget {
  const _FormPage();
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: backAppBar(context, 'Form'),
        body: const Column(children: [AppField(label: 'Name', hint: 'name'), SizedBox(height: 200, child: Center(child: Text('empty area')))]),
      );
}
