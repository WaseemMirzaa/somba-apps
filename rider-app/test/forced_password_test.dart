// Audit AD-02: a rider an administrator created signs in with a temporary password that nothing made them change.
// The server now holds such an account at "change the password" (`mustChangePassword`, refusal code
// `password_change_required`); the app shows only the change screen (EN and FR), handles the code on any call, and
// returns to the app once the password is changed.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/main.dart';
import 'package:somba_rider/screens/forced_password_screen.dart';
import 'package:somba_rider/screens/more/rider_auth.dart';
import 'package:somba_rider/services/auth_service.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/rider_store.dart';

import 'button_rules.dart';
import 'task_fixtures.dart';

class _FakeAuth extends AuthService {
  final saved = <AuthResult>[];
  var cleared = 0;
  @override
  Future<void> saveTokens(AuthResult r) async => saved.add(r);
  @override
  Future<String?> getRefresh() async => 'stored-refresh';
  @override
  Future<void> clear() async => cleared++;
}

Map<String, dynamic> _publicUser({bool held = false}) =>
    {'id': 'r', 'email': 'rider@somba.app', 'name': 'Jean', 'role': 'rider', 'phone': null, 'locale': 'en', 'hubId': 'h1', 'mustChangePassword': held};

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
      await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
    }
  });

  late _FakeAuth auth;
  final calls = <(String, Map<String, dynamic>?)>[];

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await Strings.setLang('en', persist: false);
    auth = _FakeAuth();
    calls.clear();
    final store = RiderStore.instance;
    store.debugAuth = auth;
    store.debugSkipConnect = true;
    store.debugConnects = 0;
    store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean', role: 'rider', mustChangePassword: true);
    store.loaded = true;
    store.myTasks
      ..clear()
      ..add(leg('delivery', id: 'a'));
    store.debugResetSession();
  });

  tearDown(() {
    final store = RiderStore.instance;
    store.transport = null;
    store.user = null;
    store.myTasks.clear();
    store.onSessionEnded = null;
    store.debugSkipConnect = false;
  });

  group('the sign-in answer', () {
    test('carries the flag on the user, or at the top level', () {
      final base = {'accessToken': 'a', 'refreshToken': 'r'};
      expect(AuthResult.fromJson({...base, 'user': _publicUser(held: true)}).user.mustChangePassword, isTrue);
      expect(AuthResult.fromJson({...base, 'user': _publicUser(), 'mustChangePassword': true}).user.mustChangePassword, isTrue);
      expect(AuthResult.fromJson({...base, 'user': _publicUser()}).user.mustChangePassword, isFalse);
      // An older server never says it.
      final old = _publicUser()..remove('mustChangePassword');
      expect(AuthResult.fromJson({...base, 'user': old}).user.mustChangePassword, isFalse);
    });
  });

  group('the store', () {
    test('a call refused with password_change_required holds a rider who was not flagged', () async {
      final store = RiderStore.instance;
      store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean', role: 'rider');
      var notified = 0;
      store.addListener(() => notified++);
      expect(store.mustChangePassword, isFalse);
      store.transport = (event, body) async => throw ApiException('You must set a new password before you can continue.', null, kPasswordChangeRequired);
      await expectLater(store.request('delivery:list'), throwsA(isA<ApiException>()));
      expect(store.mustChangePassword, isTrue);
      expect(notified, greaterThan(0));
    });

    test('the same code from any transport (a REST upload) holds the app too', () {
      final store = RiderStore.instance;
      store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean', role: 'rider');
      ApiException('You must set a new password before you can continue.', 403, kPasswordChangeRequired);
      expect(store.mustChangePassword, isTrue);
    });

    test('another refusal does not hold the account', () async {
      final store = RiderStore.instance;
      store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean', role: 'rider');
      store.transport = (event, body) async => throw ApiException('Not allowed.', null, 'twofa_required');
      await expectLater(store.request('x'), throwsA(isA<ApiException>()));
      expect(store.mustChangePassword, isFalse);
    });

    test('changing the password clears the flag, keeps the fresh tokens, and reconnects with them', () async {
      final store = RiderStore.instance;
      store.transport = (event, body) async {
        calls.add((event, body));
        return {'user': _publicUser(), 'accessToken': 'new-access', 'refreshToken': 'new-refresh', 'mustChangePassword': false};
      };
      await store.changePassword(current: 'TempPass-1', next: 'Mine-for-real-1');
      expect(calls.single.$1, 'me:changePassword');
      expect(calls.single.$2, {'current': 'TempPass-1', 'next': 'Mine-for-real-1'});
      expect(store.mustChangePassword, isFalse);
      expect(auth.saved.single.accessToken, 'new-access');
      expect(store.debugConnects, 1, reason: 'nothing was loaded while held: a new connection loads the queue');
    });

    test('a refused change keeps the account held and does not reconnect', () async {
      final store = RiderStore.instance;
      store.transport = (event, body) async => throw ApiException('Choose a new password that is different from the temporary one.');
      await expectLater(store.changePassword(current: 'TempPass-1', next: 'TempPass-1'), throwsA(isA<ApiException>()));
      expect(store.mustChangePassword, isTrue);
      expect(store.debugConnects, 0);
      expect(auth.saved, isEmpty);
    });

    test('an ordinary change (not held) does not reconnect', () async {
      final store = RiderStore.instance;
      store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean', role: 'rider');
      store.transport = (event, body) async => {'user': _publicUser(), 'accessToken': 'a', 'refreshToken': 'r'};
      await store.changePassword(current: 'x', next: 'Another@2026');
      expect(store.debugConnects, 0);
    });

    test('the server sentences are French', () {
      const fr = Strings('fr');
      expect(fr.serverError('You must set a new password before you can continue.'), 'Vous devez définir un nouveau mot de passe avant de continuer.');
      expect(fr.serverError('Choose a new password that is different from the temporary one.'), 'Choisissez un nouveau mot de passe différent du mot de passe temporaire.');
    });
  });

  group('the screen', () {
    Future<void> openApp(WidgetTester t, {String lang = 'en', double textScale = 1.0}) async {
      await Strings.setLang(lang, persist: false);
      t.view.physicalSize = const Size(360 * 3, 740 * 3);
      t.view.devicePixelRatio = 3;
      t.platformDispatcher.textScaleFactorTestValue = textScale;
      addTearDown(t.view.reset);
      addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
      await t.pumpWidget(SombaRiderApp(restore: () async => true));
      await t.pump(const Duration(seconds: 2));
      await t.pump(const Duration(milliseconds: 600));
    }

    testWidgets('a flagged rider sees only the change screen, never the shell; label-only button; EN', (t) async {
      await openApp(t);
      expect(find.byType(ForcedPasswordScreen), findsOneWidget);
      final s = Strings('en');
      expect(find.text(s.forcedPasswordTitle), findsOneWidget);
      expect(find.text(s.temporaryPassword), findsOneWidget);
      expect(find.byIcon(Icons.person_rounded), findsNothing, reason: 'no bottom navigation of the shell');
      expectButtonRules(t);
    });

    testWidgets('French wording, and it survives 200% text without overflow', (t) async {
      await openApp(t, lang: 'fr', textScale: 2.0);
      final s = Strings('fr');
      expect(find.text(s.forcedPasswordTitle), findsOneWidget);
      expect(find.text('Mot de passe temporaire'), findsOneWidget);
      expect(find.text('Enregistrer le mot de passe'), findsOneWidget);
      expect(t.takeException(), isNull);
      await t.scrollUntilVisible(find.text(s.signOut), 200, scrollable: find.byType(Scrollable).first);
      expect(t.takeException(), isNull);
    });

    testWidgets('each problem is explained before anything is sent; same-as-temporary is refused on the screen', (t) async {
      RiderStore.instance.transport = (event, body) async {
        calls.add((event, body));
        return {};
      };
      await openApp(t);
      final s = Strings('en');
      await t.tap(find.text(s.forcedPasswordSave));
      await t.pump();
      expect(find.text(s.errTemporaryPassword), findsOneWidget);
      expect(find.text(s.errShortPassword), findsOneWidget);
      await t.enterText(find.byKey(const ValueKey('forced-current')), 'TempPass-1');
      await t.enterText(find.byKey(const ValueKey('forced-new')), 'TempPass-1');
      await t.enterText(find.byKey(const ValueKey('forced-again')), 'TempPass-1');
      await t.pump();
      expect(find.text(s.errSameAsTemporary), findsOneWidget);
      await t.enterText(find.byKey(const ValueKey('forced-new')), 'Mine-for-real-1');
      await t.enterText(find.byKey(const ValueKey('forced-again')), 'Mine-for-real-2');
      await t.pump();
      expect(find.text(s.errPasswordMismatch), findsOneWidget);
      expect(calls, isEmpty);
    });

    testWidgets('a server refusal is shown in a snackbar and the screen stays', (t) async {
      RiderStore.instance.transport = (event, body) async => throw ApiException('Current password is incorrect.');
      await openApp(t, lang: 'fr');
      await t.enterText(find.byKey(const ValueKey('forced-current')), 'wrong-wrong');
      await t.enterText(find.byKey(const ValueKey('forced-new')), 'Mine-for-real-1');
      await t.enterText(find.byKey(const ValueKey('forced-again')), 'Mine-for-real-1');
      await t.tap(find.text('Enregistrer le mot de passe'));
      await t.pumpAndSettle();
      expect(find.text('Le mot de passe actuel est incorrect.'), findsOneWidget);
      expect(find.byType(ForcedPasswordScreen), findsOneWidget);
    });

    testWidgets('after the change the rider returns to the app', (t) async {
      RiderStore.instance.transport = (event, body) async {
        calls.add((event, body));
        if (event == 'me:changePassword') return {'user': _publicUser(), 'accessToken': 'na', 'refreshToken': 'nr'};
        throw ApiException('offline in this test');
      };
      await openApp(t);
      await t.enterText(find.byKey(const ValueKey('forced-current')), 'TempPass-1');
      await t.enterText(find.byKey(const ValueKey('forced-new')), 'Mine-for-real-1');
      await t.enterText(find.byKey(const ValueKey('forced-again')), 'Mine-for-real-1');
      await t.tap(find.text(Strings('en').forcedPasswordSave));
      await t.pump();
      await t.pump(const Duration(milliseconds: 500));
      expect(calls.first.$1, 'me:changePassword');
      expect(calls.first.$2, {'current': 'TempPass-1', 'next': 'Mine-for-real-1'});
      expect(find.byType(ForcedPasswordScreen), findsNothing);
      expect(find.byIcon(Icons.person_rounded), findsWidgets, reason: 'the shell is back');
    });

    testWidgets('signing out from the change screen goes to the sign-in screen', (t) async {
      await openApp(t);
      await t.ensureVisible(find.byKey(const ValueKey('forced-sign-out')));
      await t.tap(find.byKey(const ValueKey('forced-sign-out')));
      await t.pumpAndSettle();
      expect(find.byType(ForcedPasswordScreen), findsNothing);
      expect(find.byType(RiderLoginScreen), findsOneWidget);
      expect(auth.cleared, 1);
    });

    testWidgets('a rider who is not flagged goes straight to the app', (t) async {
      RiderStore.instance.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean', role: 'rider');
      RiderStore.instance.transport = (event, body) async => throw ApiException('offline in this test');
      await openApp(t);
      expect(find.byType(ForcedPasswordScreen), findsNothing);
      expect(find.byIcon(Icons.person_rounded), findsWidgets);
    });
  });
}
