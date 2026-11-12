// "Nothing untranslated" audit for the rider app, part 2 (see i18n_audit.dart for the method).
//
// layout_matrix_test.dart reports any text identical in English and French on the screens it pumps (deliveries, work,
// profile, support, sign-in, sheets). This file covers the rest of the rider screens (documents, vehicle, shift, profile
// edit, password, splash, the shell's tabs) and the helpers that turn server wording into the rider's language
// (notices, reasons, server errors), with the shapes the server really sends. It fails on any non-allowlisted
// identical string.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/notification_text.dart';
import 'package:somba_rider/l10n/server_errors.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/account_screen.dart';
import 'package:somba_rider/screens/documents_screen.dart';
import 'package:somba_rider/screens/forced_password_screen.dart';
import 'package:somba_rider/screens/more/rider_auth.dart';
import 'package:somba_rider/screens/shift_screen.dart';
import 'package:somba_rider/screens/vehicle_screen.dart';
import 'package:somba_rider/services/auth_service.dart' show ApiException, frenchText;
import 'package:somba_rider/services/compliance_models.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/services/shift_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

import 'compliance_test.dart' show docJson, fakeCompliance, resetCompliance, vehicleJson;
import 'layout_checks.dart';

Future<void> _seed(String lang) async {
  SharedPreferences.setMockInitialValues({});
  await Strings.setLang(lang, persist: false);
  final store = RiderStore.instance;
  store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean-Pierre Mukendi', role: 'rider', phone: '+243810000000');
  store.loaded = true;
  final now = DateTime.now();
  String iso(DateTime d) => d.toUtc().toIso8601String();
  final closed = {
    'id': 's0',
    'startedAt': iso(now.subtract(const Duration(days: 1, hours: 9))),
    'endedAt': iso(now.subtract(const Duration(days: 1))),
    'breakMinutes': 30,
    'onBreak': false,
    'breakStartedAt': null,
    'workedMinutes': 510,
    'endReason': 'auto',
  };
  ShiftStore.instance.applyPush({
    'status': 'on',
    'current': {
      'id': 's1',
      'startedAt': iso(now.subtract(const Duration(hours: 2))),
      'endedAt': null,
      'breakMinutes': 0,
      'onBreak': false,
      'breakStartedAt': null,
      'workedMinutes': 120,
    },
    'lastShift': closed,
    'minutesLast7Days': 510,
    'shifts': [closed],
  });
  fakeCompliance(vehicle: vehicleJson(), docs: [
    RiderDocumentDto.fromJson(docJson('1', type: 'driver_licence', status: 'approved', expiresOn: '2028-01-01', number: 'KN-998877', by: 'Amani')),
    RiderDocumentDto.fromJson(docJson('2', type: 'vehicle_insurance', status: 'approved', expiresOn: '2026-06-30')),
    RiderDocumentDto.fromJson(docJson('3', type: 'id_card', status: 'pending', expiresOn: null)),
    RiderDocumentDto.fromJson(docJson('4', type: 'vehicle_registration', status: 'rejected', expiresOn: '2025-01-01', reason: 'Photo is blurry', by: 'Amani')),
  ]);
}

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
      await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
    }
  });

  tearDown(() {
    RiderStore.instance.user = null;
    ShiftStore.instance.clear();
    resetCompliance();
  });

  final screens = <String, Widget Function()>{
    'documents': () => const RiderDocumentsScreen(),
    'upload a document': () => const UploadDocumentScreen(),
    'vehicle': () => const RiderVehicleScreen(),
    'shift': () => const ShiftScreen(),
    'edit profile': () => const EditProfileScreen(),
    'change password': () => const ChangePasswordScreen(),
    'forced password change': () => ForcedPasswordScreen(onSignOut: () {}),
    'splash': () => SplashScreen(onDone: () {}),
  };

  for (final e in screens.entries) {
    testWidgets('i18n audit: ${e.key}', (tester) async {
      addTearDown(tester.view.reset);
      final found = <String>[];
      for (final lang in const ['en', 'fr']) {
        await _seed(lang);
        final locale = Locale(lang);
        final config = LayoutConfig(const Size(360, 780), lang, 1.0);
        final app = MaterialApp(
          theme: AppTheme.light(),
          locale: locale,
          supportedLocales: const [Locale('en'), Locale('fr')],
          localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
          home: e.value(),
        );
        for (final p in await layoutProblems(tester, config, app)) {
          if (p.startsWith('i18n:')) found.add('[$lang] $p');
        }
      }
      expect(found, isEmpty, reason: found.join('\n'));
    });
  }

  group('i18n audit: server wording in the rider\'s language', () {
    const fr = Strings('fr'), en = Strings('en');

    final notices = <(String, String, String, String)>[
      ('New task assigned to you', 'SOM-1042: pickup is now in your tasks.', 'Nouvelle tâche qui vous est assignée', 'SOM-1042 : la collecte est maintenant dans vos tâches.'),
      ('Task updated', 'SOM-1042: delivery now carries more parcels.', 'Tâche mise à jour', 'SOM-1042 : la livraison mise à jour, d’autres colis s’y ajoutent.'),
      ('Delivery code unlocked', 'SOM-1042: you can enter the delivery code again.', 'Code de livraison déverrouillé', 'SOM-1042 : vous pouvez de nouveau saisir le code de livraison.'),
      ('Transfer run assigned', 'TR-0042: 1 parcel to Entrepôt Limete is now in your tasks.', 'Tournée de transfert assignée', 'TR-0042 : 1 colis à destination d’Entrepôt Limete est ajouté à vos tâches.'),
      ('Transfer run assigned', 'TR-0042: 18 parcels to Kinshasa Hub are now in your tasks.', 'Tournée de transfert assignée', 'TR-0042 : 18 colis à destination de Kinshasa Hub sont ajoutés à vos tâches.'),
      ('Document approved', 'Your driver licence was approved.', 'Document approuvé', 'Votre document « permis de conduire » a été approuvé.'),
      ('Document rejected', 'Your vehicle registration was rejected: Photo is blurry', 'Document refusé', 'Votre document « carte grise » a été refusé : Photo is blurry'),
      ('Account suspended', 'Your account is suspended. Contact support for help.', 'Compte suspendu', 'Votre compte est suspendu. Contactez le support pour obtenir de l’aide.'),
      ('Account reinstated', 'Your account is active again.', 'Compte réactivé', 'Votre compte est de nouveau actif.'),
      ('New delivery assigned to you', 'SOM-1042. Open the app to accept it.', 'Nouvelle livraison pour vous', 'SOM-1042. Ouvrez l’application pour l’accepter.'),
      ('3 deliveries assigned to you', 'SOM-1, SOM-2, SOM-3 — collect them at the warehouse.', '3 livraisons pour vous', 'SOM-1, SOM-2, SOM-3 — à récupérer à l’entrepôt.'),
      ('Support reply', 'TKT-1: Merci, nous le contactons.', 'Réponse de l’assistance', 'TKT-1: Merci, nous le contactons.'),
    ];

    test('rider notices are shown in French when the server sent no French, and left alone in English', () {
      final wrong = <String>[];
      for (final n in notices) {
        final got = localizeNotification(fr, n.$1, n.$2);
        if (got.$1 != n.$3) wrong.add('title "${n.$1}": got "${got.$1}"');
        if (got.$2 != n.$4) wrong.add('body "${n.$2}": got "${got.$2}"');
        expect(localizeNotification(en, n.$1, n.$2), (n.$1, n.$2), reason: 'English is shown as the server wrote it');
      }
      expect(wrong, isEmpty, reason: wrong.join('\n'));
    });

    test('the server\'s own French wins in French, and English ignores it', () {
      expect(displayNotice(fr, title: 'Task updated', body: 'x', titleFr: 'Tâche modifiée', bodyFr: 'y'), ('Tâche modifiée', 'y'));
      expect(displayNotice(en, title: 'Task updated', body: 'x', titleFr: 'Tâche modifiée', bodyFr: 'y'), ('Task updated', 'x'));
      // A "French" text that is a copy of the English was never translated: the phone's own wording is used.
      expect(displayNotice(fr, title: 'Task updated', body: 'x', titleFr: 'Task updated', bodyFr: 'x'), ('Tâche mise à jour', 'x'));
    });

    test('failure reasons are worded in French', () {
      expect(translateReason('Customer not reachable'), 'Client injoignable');
      expect(translateReason('Wrong address'), 'Adresse incorrecte');
      expect(translateReason('Gate was locked'), 'Gate was locked');
    });

    test('server errors a rider can meet are shown in French', () {
      const messages = {
        'Collect PKG-7KQ2M9XA first: this leg is not picked up yet.': 'Récupérez d’abord PKG-7KQ2M9XA : cette étape n’est pas encore récupérée.',
        'The photo is too large (5 MB at most).': 'La photo est trop volumineuse (5 Mo au maximum).',
        'The signature must be a PNG image.': 'La signature doit être une image PNG.',
        'Parcel scanning is not available.': 'Le scan des colis n’est pas disponible.',
        'File not found.': 'Fichier introuvable.',
        'Incorrect or expired code.': 'Code incorrect ou expiré.',
      };
      messages.forEach((raw, expected) {
        expect(translateServerError(raw, fr), expected, reason: raw);
        expect(translateServerError(raw, en), raw);
      });
    });

    group('the server\'s own French (errorFr / messageFr) wins in French', () {
      tearDown(() => Strings.setLang('fr', persist: false));

      test('an ack error carries errorFr; HTTP bodies carry messageFr (string or list)', () async {
        final e = ApiException('Wrong delivery code.', null, 'x', frenchText('Code de livraison incorrect.'));
        await Strings.setLang('fr', persist: false);
        expect(e.toString(), 'Code de livraison incorrect.');
        expect(e.code, 'x');
        await Strings.setLang('en', persist: false);
        expect(e.toString(), 'Wrong delivery code.');
        expect(e.message, 'Wrong delivery code.');
        expect(frenchText(['Un.', 'Deux.']), 'Un.\nDeux.');
        expect(frenchText(null), isNull);
        expect(frenchText(' '), isNull);
      });

      test('no French from the server: the phone\'s own mapping, then the English text', () async {
        await Strings.setLang('fr', persist: false);
        expect(ApiException('Parcel scanning is not available.').toString(), 'Le scan des colis n’est pas disponible.');
        expect(ApiException('A sentence nobody knows.', 400, null, '').toString(), 'A sentence nobody knows.');
      });
    });
  });
}
