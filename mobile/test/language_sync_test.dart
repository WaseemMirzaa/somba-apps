// The language rule: no choice made on this device -> the app follows the account's language; a choice made on this
// device (the sign-in screen's toggle, Settings) wins and is saved to the account. A sign-in answer that does not
// carry the language must never turn a French user into an English one.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/l10n/language_sync.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/main.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

BackendUser _user(String? locale) => BackendUser.fromJson({
      'id': 'u1',
      'email': 'customer@somba.app',
      'name': 'Aline',
      'role': 'customer',
      if (locale != null) 'locale': locale,
    });

void main() {
  final store = RealtimeStore.instance;
  final calls = <(String, Map<String, dynamic>?)>[];

  /// A server that saves the language and answers with the profile (`me:update`).
  Future<dynamic> server(String event, [Map<String, dynamic>? body]) async {
    calls.add((event, body));
    if (event == 'me:update') return {'id': 'u1', 'email': 'customer@somba.app', 'name': 'Aline', 'role': 'customer', 'locale': body!['locale']};
    return const <dynamic>[];
  }

  Future<String?> savedOnDevice() async => (await SharedPreferences.getInstance()).getString('somba.lang');

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    Strings.hasChoice = false;
    await Strings.setLang('fr', persist: false); // a fresh install: French, no choice
    calls.clear();
    store.debugCallRequest = server;
    store.user = null;
  });
  tearDown(() {
    store.user = null;
    store.debugCallRequest = null;
    store.onHydrated = null;
  });

  group('languageAction', () {
    test('the table', () {
      LanguageAction a({required bool choice, required String current, String? account, bool online = true}) =>
          languageAction(deviceChoice: choice, current: current, account: account, online: online);
      expect(a(choice: false, current: 'fr', account: 'fr'), LanguageAction.none);
      expect(a(choice: false, current: 'fr', account: 'en'), LanguageAction.followAccount);
      expect(a(choice: false, current: 'en', account: 'fr', online: false), LanguageAction.followAccount, reason: 'following needs no connection');
      expect(a(choice: true, current: 'en', account: 'fr'), LanguageAction.saveToAccount);
      expect(a(choice: true, current: 'en', account: 'fr', online: false), LanguageAction.none, reason: 'the account can only be told once online');
      expect(a(choice: true, current: 'fr', account: 'fr'), LanguageAction.none);
      expect(a(choice: true, current: 'en'), LanguageAction.none, reason: 'unknown account language: nothing to compare');
      expect(a(choice: false, current: 'fr'), LanguageAction.none);
    });
  });

  group('no choice on this device: follow the account', () {
    test('a French account on a fresh install stays French', () async {
      store.user = _user('fr');
      expect(await reconcileLanguage(store, online: false), LanguageAction.none);
      expect(Strings.current.lang, 'fr');
    });

    test('an English device language follows a French account, without becoming a device choice', () async {
      await Strings.setLang('en', persist: false);
      store.user = _user('fr');
      expect(await reconcileLanguage(store, online: false), LanguageAction.followAccount);
      expect(Strings.current.lang, 'fr');
      expect(Strings.langNotifier.value, 'fr');
      expect(Strings.hasChoice, isFalse, reason: 'the account\'s language is not a choice made here');
      expect(await savedOnDevice(), isNull);
      expect(calls, isEmpty, reason: 'nothing to tell the account');
    });

    test('an English account on a fresh install reads English (that is the rule)', () async {
      store.user = _user('en');
      await reconcileLanguage(store, online: false);
      expect(Strings.current.lang, 'en');
    });

    test('a sign-in answer without the language does NOT switch the app to English', () async {
      store.user = _user(null);
      expect(await reconcileLanguage(store, online: true), LanguageAction.none);
      expect(Strings.current.lang, 'fr', reason: 'a missing language is unknown, not English');
      expect(calls, isEmpty);
    });
  });

  group('a choice made on this device wins and is saved to the account', () {
    test('Settings / the sign-in toggle: the account is told once the session is up, not before', () async {
      await Strings.setLang('en'); // the user taps the language toggle on the sign-in screen
      expect(Strings.hasChoice, isTrue);
      expect(await savedOnDevice(), 'en');
      store.user = _user('fr');

      // Signing in: the socket is not ready yet, so the account is not told and the choice stands.
      expect(await reconcileLanguage(store, online: false), LanguageAction.none);
      expect(Strings.current.lang, 'en');
      expect(calls, isEmpty);

      // The session finished loading: the account is told.
      expect(await reconcileLanguage(store, online: true), LanguageAction.saveToAccount);
      expect(calls, hasLength(1));
      expect(calls.single.$1, 'me:update');
      expect(calls.single.$2, {'locale': 'en'});
      expect(store.user!.locale, 'en');
      expect(Strings.current.lang, 'en');

      // Nothing more to do on the next reconnect.
      expect(await reconcileLanguage(store, online: true), LanguageAction.none);
      expect(calls, hasLength(1));
    });

    test('a failed save is tried again the next time the session loads', () async {
      await Strings.setLang('en');
      store.user = _user('fr');
      var fail = true;
      store.debugCallRequest = (event, [body]) async {
        if (fail) throw StateError('offline');
        return server(event, body);
      };
      expect(await reconcileLanguage(store, online: true), LanguageAction.saveToAccount, reason: 'the failure does not escape');
      expect(store.user!.locale, 'fr');
      fail = false;
      expect(await reconcileLanguage(store, online: true), LanguageAction.saveToAccount);
      expect(store.user!.locale, 'en');
    });

    test('a choice equal to the account\'s changes nothing', () async {
      await Strings.setLang('fr');
      store.user = _user('fr');
      expect(await reconcileLanguage(store, online: true), LanguageAction.none);
      expect(calls, isEmpty);
    });
  });

  group('the sign-in screen', () {
    testWidgets('its language toggle is a device choice that survives signing in', (tester) async {
      await tester.pumpWidget(const SombaApp());
      await tester.pump(const Duration(seconds: 3));
      await tester.pump();
      expect(find.text(const Strings('fr').welcomeBack), findsOneWidget, reason: 'a fresh install opens in French');
      expect(Strings.hasChoice, isFalse);

      await tester.tap(find.byKey(const ValueKey('lang-toggle')));
      await tester.pump();
      expect(find.text(const Strings('en').welcomeBack), findsOneWidget);
      expect(Strings.hasChoice, isTrue);

      // Sign-in answers with a French account: the choice made on the sign-in screen wins and is saved to the account.
      store.user = _user('fr');
      await reconcileLanguage(store, online: false);
      expect(Strings.current.lang, 'en');
      await reconcileLanguage(store, online: true);
      expect(calls.single.$2, {'locale': 'en'});
    });

    testWidgets('without a choice the sign-in screen is French, and a French account keeps it French', (tester) async {
      await tester.pumpWidget(const SombaApp());
      await tester.pump(const Duration(seconds: 3));
      await tester.pump();
      store.user = _user('fr');
      await reconcileLanguage(store, online: false);
      await tester.pump();
      expect(Strings.current.lang, 'fr');
      expect(Strings.hasChoice, isFalse);
    });
  });
}
