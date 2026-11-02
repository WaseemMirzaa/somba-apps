// The rider's own account: edit name and phone, change the password (screens and store), and the session that ends
// cleanly when the server revokes it.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/main.dart';
import 'package:somba_rider/screens/account_screen.dart';
import 'package:somba_rider/screens/profile_screen.dart';
import 'package:somba_rider/screens/support_screen.dart';
import 'package:somba_rider/services/auth_service.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

import 'button_rules.dart';
import 'task_fixtures.dart';

/// The sign-in service, answered from memory.
class FakeAuth extends AuthService {
  String? refreshToken = 'stored-refresh';
  Object? refreshFails;
  String refreshRole = 'rider';
  final saved = <AuthResult>[];
  var cleared = 0;
  var refreshes = 0;

  @override
  Future<AuthResult> refresh(String token) async {
    refreshes++;
    if (refreshFails != null) throw refreshFails!;
    return AuthResult(user: BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean', role: refreshRole), accessToken: 'a2', refreshToken: 'r2');
  }

  @override
  Future<void> saveTokens(AuthResult r) async {
    saved.add(r);
    refreshToken = r.refreshToken;
  }

  @override
  Future<String?> getRefresh() async => refreshToken;

  @override
  Future<void> clear() async {
    cleared++;
    refreshToken = null;
  }
}

Map<String, dynamic> _publicUser({String name = 'Jean-Pierre Mukendi', String? phone = '+243810000000'}) =>
    {'id': 'r', 'email': 'rider@somba.app', 'name': name, 'role': 'rider', 'phone': phone, 'locale': 'en', 'hubId': 'h1'};

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
      await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
    }
  });

  late FakeAuth auth;
  final calls = <(String, Map<String, dynamic>?)>[];

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await Strings.setLang('en', persist: false);
    auth = FakeAuth();
    calls.clear();
    final store = RiderStore.instance;
    store.debugAuth = auth;
    store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean-Pierre Mukendi', role: 'rider', phone: '+243810000000');
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
  });

  group('store', () {
    test('updateProfile sends the trimmed name and phone to me:update and takes the answer', () async {
      final store = RiderStore.instance;
      store.transport = (event, body) async {
        calls.add((event, body));
        return _publicUser(name: 'Jean-Pierre M.', phone: '+243 81 234 5678');
      };
      await store.updateProfile(name: '  Jean-Pierre M. ', phone: ' +243 81 234 5678 ');
      expect(calls.single.$1, 'me:update');
      expect(calls.single.$2, {'name': 'Jean-Pierre M.', 'phone': '+243 81 234 5678'});
      expect((store.user!.name, store.user!.phone, store.user!.role), ('Jean-Pierre M.', '+243 81 234 5678', 'rider'));
    });

    test('a blank phone is sent as null (it clears the number); the e-mail and role are never sent', () async {
      final store = RiderStore.instance;
      store.transport = (event, body) async {
        calls.add((event, body));
        return _publicUser(phone: null);
      };
      await store.updateProfile(name: 'Jean', phone: '   ');
      expect(calls.single.$2, {'name': 'Jean', 'phone': null});
      expect(store.user!.phone, isNull);
    });

    test('a refusal from the server surfaces and leaves the account as it was', () async {
      final store = RiderStore.instance;
      store.transport = (event, body) async => throw ApiException('Enter a valid phone number.');
      await expectLater(store.updateProfile(name: 'Jean', phone: 'x'), throwsA(isA<ApiException>()));
      expect(store.user!.phone, '+243810000000');
      await Strings.setLang('fr', persist: false);
      expect(Strings.current.errorText(ApiException('Enter a valid phone number.')), 'Saisissez un numéro de téléphone valide.');
    });

    test('another account\'s push, or a non-rider answer, is ignored; our own me:updated is applied', () async {
      final store = RiderStore.instance;
      store.transport = (event, body) async => {..._publicUser(), 'id': 'someone-else', 'name': 'Other'};
      await store.updateProfile(name: 'Other', phone: '');
      expect(store.user!.name, 'Jean-Pierre Mukendi');
      store.transport = (event, body) async => {..._publicUser(name: 'Admin Now'), 'role': 'admin'};
      await store.updateProfile(name: 'Admin Now', phone: '');
      expect(store.user!.name, 'Jean-Pierre Mukendi');
    });

    test('changePassword sends current and next, and keeps the fresh tokens it is given', () async {
      final store = RiderStore.instance;
      store.transport = (event, body) async {
        calls.add((event, body));
        return {'user': _publicUser(), 'accessToken': 'new-access', 'refreshToken': 'new-refresh'};
      };
      await store.changePassword(current: 'Somba@2026', next: 'Another@2026');
      expect(calls.single.$1, 'me:changePassword');
      expect(calls.single.$2, {'current': 'Somba@2026', 'next': 'Another@2026'});
      expect(auth.saved.single.refreshToken, 'new-refresh');
      expect(await auth.getRefresh(), 'new-refresh', reason: 'the next refresh uses the new token, not the revoked one');
    });

    test('a wrong current password changes no token', () async {
      final store = RiderStore.instance;
      store.transport = (event, body) async => throw ApiException('Current password is incorrect.');
      await expectLater(store.changePassword(current: 'x', next: 'Another@2026'), throwsA(isA<ApiException>()));
      expect(auth.saved, isEmpty);
    });
  });

  group('screens', () {
    Future<void> openProfile(WidgetTester t, String lang) async {
      await Strings.setLang(lang, persist: false);
      t.view.physicalSize = const Size(360 * 3, 740 * 3);
      t.view.devicePixelRatio = 3;
      addTearDown(t.view.reset);
      await t.pumpWidget(MaterialApp(
        locale: Locale(lang),
        supportedLocales: const [Locale('en'), Locale('fr')],
        localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
        theme: AppTheme.light(),
        home: Scaffold(body: ProfileScreen(locale: Locale(lang), onLocaleChanged: (_) {})),
      ));
      await t.pump(const Duration(milliseconds: 300));
    }

    for (final lang in ['en', 'fr']) {
      testWidgets('Profile offers Edit profile and Change password ($lang)', (t) async {
        final s = Strings(lang);
        await openProfile(t, lang);
        expect(find.text(s.editProfile), findsOneWidget);
        expect(find.text(s.changePassword), findsOneWidget);
        expectButtonRules(t);
        await t.tap(find.byKey(const ValueKey('edit-profile-entry')));
        await t.pumpAndSettle();
        expect(find.text(s.editProfile), findsOneWidget);
        expect(find.text(s.emailLocked), findsOneWidget);
        expect(find.text('rider@somba.app'), findsOneWidget);
        expect(find.text(s.save), findsOneWidget);
        expectButtonRules(t);
        expect(t.takeException(), isNull);
      });
    }

    testWidgets('editing: invalid values are explained and nothing is sent; valid ones save, say so and go back', (t) async {
      final store = RiderStore.instance;
      store.transport = (event, body) async {
        calls.add((event, body));
        return _publicUser(name: 'Jean R.', phone: '+243 99 111 2222');
      };
      await openProfile(t, 'en');
      await t.tap(find.byKey(const ValueKey('edit-profile-entry')));
      await t.pumpAndSettle();
      final s = Strings('en');
      // prefilled with the account
      expect(t.widget<TextField>(find.byKey(const ValueKey('profile-name'))).controller!.text, 'Jean-Pierre Mukendi');
      expect(t.widget<TextField>(find.byKey(const ValueKey('profile-phone'))).controller!.text, '+243810000000');

      await t.enterText(find.byKey(const ValueKey('profile-name')), 'J');
      await t.enterText(find.byKey(const ValueKey('profile-phone')), 'call me');
      await t.tap(find.text(s.save));
      await t.pump();
      expect(find.text(s.errValidName), findsOneWidget);
      expect(find.text(s.errValidPhone), findsOneWidget);
      expect(calls, isEmpty);

      await t.enterText(find.byKey(const ValueKey('profile-name')), 'Jean R.');
      await t.enterText(find.byKey(const ValueKey('profile-phone')), '+243 99 111 2222');
      await t.tap(find.text(s.save));
      await t.pumpAndSettle();
      expect(calls.single.$1, 'me:update');
      expect(calls.single.$2, {'name': 'Jean R.', 'phone': '+243 99 111 2222'});
      expect(find.text(s.profileSaved), findsOneWidget, reason: 'the snackbar');
      expect(find.byType(EditProfileScreen), findsNothing);
      expect(find.text('Jean R.'), findsOneWidget, reason: 'the Profile header shows the new name');
    });

    testWidgets('a server refusal is shown in a snackbar and the screen stays', (t) async {
      RiderStore.instance.transport = (event, body) async => throw ApiException('Name must be 2–80 characters.');
      await openProfile(t, 'fr');
      await t.tap(find.byKey(const ValueKey('edit-profile-entry')));
      await t.pumpAndSettle();
      await t.tap(find.text(Strings('fr').save));
      await t.pumpAndSettle();
      expect(find.text('Le nom doit contenir entre 2 et 80 caractères.'), findsOneWidget);
      expect(find.byType(EditProfileScreen), findsOneWidget);
    });

    testWidgets('changing the password: each problem is explained, then it saves and goes back', (t) async {
      final store = RiderStore.instance;
      store.transport = (event, body) async {
        calls.add((event, body));
        return {'user': _publicUser(), 'accessToken': 'na', 'refreshToken': 'nr'};
      };
      await openProfile(t, 'en');
      final s = Strings('en');
      await t.tap(find.byKey(const ValueKey('change-password-entry')));
      await t.pumpAndSettle();
      expectButtonRules(t);

      await t.tap(find.text(s.save));
      await t.pump();
      expect(find.text(s.errCurrentPassword), findsOneWidget);
      expect(find.text(s.errShortPassword), findsOneWidget);
      expect(calls, isEmpty);

      await t.enterText(find.byKey(const ValueKey('password-current')), 'Somba@2026');
      await t.enterText(find.byKey(const ValueKey('password-new')), 'Somba@2026');
      await t.enterText(find.byKey(const ValueKey('password-again')), 'Somba@2026');
      await t.pump();
      expect(find.text(s.errSamePassword), findsOneWidget);

      await t.enterText(find.byKey(const ValueKey('password-new')), 'Another@2026');
      await t.enterText(find.byKey(const ValueKey('password-again')), 'Another@2027');
      await t.pump();
      expect(find.text(s.errPasswordMismatch), findsOneWidget);
      expect(calls, isEmpty);

      await t.enterText(find.byKey(const ValueKey('password-again')), 'Another@2026');
      await t.tap(find.text(s.save));
      await t.pumpAndSettle();
      expect(calls.single.$1, 'me:changePassword');
      expect(calls.single.$2, {'current': 'Somba@2026', 'next': 'Another@2026'});
      expect(find.text(s.passwordChanged), findsOneWidget);
      expect(find.byType(ChangePasswordScreen), findsNothing);
      expect(auth.saved.single.accessToken, 'na');
    });

    testWidgets('a wrong current password says so and keeps the form', (t) async {
      RiderStore.instance.transport = (event, body) async => throw ApiException('Current password is incorrect.');
      await openProfile(t, 'fr');
      await t.tap(find.byKey(const ValueKey('change-password-entry')));
      await t.pumpAndSettle();
      await t.enterText(find.byKey(const ValueKey('password-current')), 'wrongwrong');
      await t.enterText(find.byKey(const ValueKey('password-new')), 'Another@2026');
      await t.enterText(find.byKey(const ValueKey('password-again')), 'Another@2026');
      await t.tap(find.text(Strings('fr').save));
      await t.pumpAndSettle();
      expect(find.text('Le mot de passe actuel est incorrect.'), findsOneWidget);
      expect(find.byType(ChangePasswordScreen), findsOneWidget);
      expect(auth.saved, isEmpty);
    });

    test('name and phone rules mirror the server', () {
      expect(isValidName('Jo'), isTrue);
      expect(isValidName(' J '), isFalse);
      expect(isValidName('x' * 81), isFalse);
      expect(isValidPhone(''), isTrue);
      expect(isValidPhone('+243 81 234 5678'), isTrue);
      expect(isValidPhone('(081) 234-5678'), isTrue);
      expect(isValidPhone('123'), isFalse);
      expect(isValidPhone('abc 1234567'), isFalse);
    });
  });

  group('a revoked session', () {
    Future<void> openApp(WidgetTester t, {String lang = 'en'}) async {
      await Strings.setLang(lang, persist: false);
      t.view.physicalSize = const Size(360 * 3, 740 * 3);
      t.view.devicePixelRatio = 3;
      addTearDown(t.view.reset);
      // The saved session resumes without opening a socket (the user and the loaded queue are already in the store).
      await t.pumpWidget(SombaRiderApp(restore: () async => true));
      await t.pump(const Duration(seconds: 2));
      await t.pump(const Duration(milliseconds: 600));
    }

    testWidgets('the rider is signed out, back at the sign-in screen, with the screens opened on top gone and a message', (t) async {
      final store = RiderStore.instance;
      store.transport = (event, body) async => throw ApiException('offline in this test');
      await openApp(t);
      expect(find.byKey(const ValueKey('rider-signin')), findsNothing);
      // The rider is deep in the app: Profile, then Edit profile, with a dialog-sized sheet on top as well.
      await t.tap(find.byIcon(Icons.person_rounded).last);
      await t.pump(const Duration(milliseconds: 400));
      await t.tap(find.byKey(const ValueKey('edit-profile-entry')));
      await t.pumpAndSettle();
      expect(find.byType(EditProfileScreen), findsOneWidget);

      // The server refuses the next refresh: the session was revoked (password changed elsewhere, or switched off).
      auth.refreshFails = ApiException('Session has been revoked.', 401);
      await store.debugVerifySession();
      await t.pumpAndSettle();

      expect(auth.cleared, 1, reason: 'the saved tokens are erased');
      expect(store.user, isNull);
      expect(store.myTasks, isEmpty);
      expect(find.byType(EditProfileScreen), findsNothing, reason: 'no screen of the old session is left on top');
      expect(find.byKey(const ValueKey('rider-signin')), findsOneWidget);
      expect(find.text(Strings('en').errSignedOut), findsOneWidget);
      expect(t.takeException(), isNull);
    });

    testWidgets('the same from the support screen, in French', (t) async {
      final store = RiderStore.instance;
      store.transport = (event, body) async => <dynamic>[];
      await openApp(t, lang: 'fr');
      await t.tap(find.byIcon(Icons.person_rounded).last);
      await t.pump(const Duration(milliseconds: 400));
      await t.ensureVisible(find.byKey(const ValueKey('support-entry')));
      await t.tap(find.byKey(const ValueKey('support-entry')));
      await t.pump(const Duration(milliseconds: 600));
      await t.pump(const Duration(milliseconds: 600));
      expect(find.byType(SupportScreen), findsOneWidget);

      auth.refreshFails = ApiException('This account has been suspended. Contact support.', 401);
      await store.debugVerifySession();
      await t.pumpAndSettle();

      expect(find.byType(SupportScreen), findsNothing);
      expect(find.byKey(const ValueKey('rider-signin')), findsOneWidget);
      expect(find.text(Strings('fr').errSignedOut), findsOneWidget);
    });

    testWidgets('a rider whose account became another role is also signed out', (t) async {
      final store = RiderStore.instance;
      store.transport = (event, body) async => <dynamic>[];
      await openApp(t);
      auth.refreshRole = 'customer';
      await store.debugVerifySession();
      await t.pumpAndSettle();
      expect(store.user, isNull);
      expect(find.byKey(const ValueKey('rider-signin')), findsOneWidget);
    });

    testWidgets('being offline is NOT a sign-out: the rider stays where they are', (t) async {
      final store = RiderStore.instance;
      store.transport = (event, body) async => <dynamic>[];
      await openApp(t);
      auth.refreshFails = ApiException.local('err_offline');
      await store.debugVerifySession();
      await t.pumpAndSettle();
      expect(store.user, isNotNull);
      expect(auth.cleared, 0);
      expect(find.byKey(const ValueKey('rider-signin')), findsNothing);
    });

    test('a refresh refused while a screen asks for a token also ends the session', () async {
      final store = RiderStore.instance;
      var ended = 0;
      store.onSessionEnded = () => ended++;
      auth.refreshFails = ApiException('Session has been revoked.', 401);
      await expectLater(store.freshAccessToken(), throwsA(isA<ApiException>()));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(ended, 1);
      expect(store.user, isNull);
    });
  });
}
