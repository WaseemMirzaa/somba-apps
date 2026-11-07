// The rider's vehicle and documents (docs/contracts/rider-compliance.md): the models and expiry rules, the store (read, push, upload
// in two steps, sign-out), the read-only Vehicle screen, the Documents screen with its reminders (never a block), the upload form
// (camera or gallery, a refused permission), the profile entries, French, button rules and layout at several sizes.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/compliance_messages.dart';
import 'package:somba_rider/l10n/compliance_strings.dart';
import 'package:somba_rider/l10n/messages.dart';
import 'package:somba_rider/l10n/server_errors.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/compliance_widgets.dart' show fmtDay;
import 'package:somba_rider/screens/documents_screen.dart';
import 'package:somba_rider/screens/profile_screen.dart';
import 'package:somba_rider/screens/vehicle_screen.dart';
import 'package:somba_rider/services/auth_service.dart' show ApiException;
import 'package:somba_rider/services/compliance_models.dart';
import 'package:somba_rider/services/compliance_store.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/services/support_store.dart' show ImagePickerPhotoPicker, PhotoPicker, PickedPhoto;
import 'package:somba_rider/theme/app_theme.dart';

import 'button_rules.dart';
import 'layout_checks.dart';

/// "Today" of every test: 15 June 2026 (UTC).
final _today = DateTime.utc(2026, 6, 15, 9);

Map<String, dynamic> vehicleJson({Map<String, dynamic> over = const {}}) => {
      'riderId': 'r',
      'exists': true,
      'model': 'Honda CG 125',
      'type': 'motorbike',
      'plate': 'KN 4821 A',
      'colour': 'Black',
      'odometerKm': 18240,
      'fuel': 'petrol',
      'insuranceValidUntil': '2027-03-12',
      'lastServiceOn': '2026-05-12',
      'nextServiceOn': '2026-12-01',
      'updatedByName': 'Amani',
      ...over,
    };

Map<String, dynamic> docJson(String id, {String type = 'driver_licence', String status = 'approved', String? expiresOn = '2028-01-01', String? number, String? reason, String? by}) => {
      'id': id,
      'riderId': 'r',
      'type': type,
      'number': number,
      'expiresOn': expiresOn,
      'status': status,
      'reviewedByName': by,
      'rejectionReason': reason,
      'createdAt': '2026-06-01T08:00:00.000Z',
    };

class FakeComplianceApi implements ComplianceApi {
  FakeComplianceApi({Map<String, dynamic>? vehicle, List<RiderDocumentDto>? docs})
      : vehicleRow = RiderVehicleDto.fromJson(vehicle ?? vehicleJson()),
        docs = docs ?? [];
  RiderVehicleDto vehicleRow;
  List<RiderDocumentDto> docs;
  Object? failWith;
  bool vehicleFails = false;
  final calls = <String>[];
  Map<String, Object?>? lastUpload;

  @override
  Future<RiderVehicleDto> vehicle() async {
    calls.add('vehicle');
    if (failWith != null) throw failWith!;
    if (vehicleFails) throw ApiException('Not allowed.');
    return vehicleRow;
  }

  @override
  Future<List<RiderDocumentDto>> documents() async {
    calls.add('documents');
    if (failWith != null) throw failWith!;
    return List.of(docs);
  }

  @override
  Future<RiderDocumentDto> upload({required String type, String? number, String? expiresOn, required String fileId}) async {
    calls.add('upload');
    if (failWith != null) throw failWith!;
    lastUpload = {'type': type, 'number': number, 'expiresOn': expiresOn, 'fileId': fileId};
    final d = RiderDocumentDto.fromJson(docJson('new${docs.length}', type: type, status: 'pending', expiresOn: expiresOn, number: number));
    docs = [d, ...docs];
    return d;
  }
}

class FakeDocPicker implements PhotoPicker {
  Object? failWith;
  List<PickedPhoto> result = const [PickedPhoto('/tmp/licence.jpg')];
  final asked = <String>[];
  @override
  Future<List<PickedPhoto>> pick({required bool camera, required int limit}) async {
    asked.add('${camera ? 'camera' : 'gallery'}:$limit');
    if (failWith != null) throw failWith!;
    return result;
  }
}

class FakePrivateUploader implements PrivateFileUploader {
  Object? failWith;
  final uploaded = <String>[];
  final order = <String>[];
  @override
  Future<String> upload(PickedPhoto photo) async {
    order.add('file');
    if (failWith != null) throw failWith!;
    uploaded.add(photo.path);
    return '11111111-2222-3333-4444-555555555555';
  }
}

({FakeComplianceApi api, FakeDocPicker picker, FakePrivateUploader uploader}) fakeCompliance({Map<String, dynamic>? vehicle, List<RiderDocumentDto>? docs}) {
  final api = FakeComplianceApi(vehicle: vehicle, docs: docs);
  final picker = FakeDocPicker();
  final uploader = FakePrivateUploader();
  final s = ComplianceStore.instance;
  s
    ..api = api
    ..picker = picker
    ..uploader = uploader
    ..clock = (() => _today);
  s.clear();
  return (api: api, picker: picker, uploader: uploader);
}

void resetCompliance() {
  final s = ComplianceStore.instance;
  s
    ..api = SocketComplianceApi()
    ..picker = ImagePickerPhotoPicker()
    ..uploader = HttpPrivateFileUploader()
    ..clock = DateTime.now;
  s.clear();
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
    final store = RiderStore.instance;
    store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean-Pierre Mukendi', role: 'rider', phone: '+243810000000');
    store.loaded = true;
  });

  tearDown(() {
    RiderStore.instance.user = null;
    resetCompliance();
  });

  group('expiry rules (the same as the API, in UTC days)', () {
    test('no date, valid, expiring (30 days down to the last valid day), expired', () {
      expect(expiryOf(null, _today).state, ExpiryState.none);
      expect(expiryOf('', _today).state, ExpiryState.none);
      expect(expiryOf('not a date', _today).state, ExpiryState.none);
      expect(expiryOf('2026-02-30', _today).state, ExpiryState.none);
      expect((expiryOf('2026-07-16', _today).state, expiryOf('2026-07-16', _today).daysLeft), (ExpiryState.valid, 31));
      expect((expiryOf('2026-07-15', _today).state, expiryOf('2026-07-15', _today).daysLeft), (ExpiryState.expiring, 30));
      expect((expiryOf('2026-06-15', _today).state, expiryOf('2026-06-15', _today).daysLeft), (ExpiryState.expiring, 0));
      expect((expiryOf('2026-06-14', _today).state, expiryOf('2026-06-14', _today).daysLeft), (ExpiryState.expired, -1));
    });

    test('the time of day and the phone time zone do not move the day', () {
      expect(expiryOf('2026-06-15', DateTime.utc(2026, 6, 15, 23, 59)).state, ExpiryState.expiring);
      expect(expiryOf('2026-06-15', DateTime.utc(2026, 6, 16, 0, 1)).state, ExpiryState.expired);
      expect(isoDay(DateTime(2027, 3, 5)), '2027-03-05');
    });

    test('documentWarnings counts live documents only: a rejected one needs a new copy, it is not "expired"', () {
      final docs = [
        RiderDocumentDto.fromJson(docJson('1', expiresOn: '2020-01-01')),
        RiderDocumentDto.fromJson(docJson('2', expiresOn: '2026-06-30')),
        RiderDocumentDto.fromJson(docJson('3', expiresOn: '2020-01-01', status: 'rejected')),
        RiderDocumentDto.fromJson(docJson('4', expiresOn: null, status: 'pending')),
        RiderDocumentDto.fromJson(docJson('5', expiresOn: '2030-01-01')),
      ];
      final w = documentWarnings(docs, _today);
      expect((w.expired, w.expiring), (1, 1));
    });
  });

  group('models', () {
    test('a vehicle and a document read tolerantly', () {
      final v = RiderVehicleDto.fromJson({'exists': false});
      expect((v.exists, v.model, v.odometerKm), (false, null, null));
      final v2 = RiderVehicleDto.fromJson(vehicleJson(over: {'colour': '  ', 'odometerKm': 12.0}));
      expect((v2.colour, v2.odometerKm), (null, 12));
      expect(v2.insurance(_today).state, ExpiryState.valid);
      expect(v2.service(_today).state, ExpiryState.valid);
      final d = RiderDocumentDto.fromJson({'id': 7, 'status': 'rejected', 'rejectionReason': 'Blurry'});
      expect((d.id, d.type, d.isRejected, d.rejectionReason, d.expiresOn), ('7', 'other', true, 'Blurry', null));
    });
  });

  group('store', () {
    test('reads the vehicle and the documents; one failure does not hide the other', () async {
      final f = fakeCompliance(docs: [RiderDocumentDto.fromJson(docJson('1'))]);
      final s = ComplianceStore.instance;
      await s.load();
      expect((s.vehicleLoaded, s.documentsLoaded, s.vehicle.plate, s.documents.length), (true, true, 'KN 4821 A', 1));
      f.api.failWith = ApiException('Not allowed.');
      await s.load();
      expect(s.vehicleError, isNotNull);
      expect(s.documentsError, isNotNull);
      expect(s.documents, hasLength(1), reason: 'what was read stays on screen');
      f.api.failWith = null;
      f.api.vehicleFails = true;
      await s.load();
      expect(s.vehicleError, isNotNull);
      expect(s.documentsError, isNull, reason: 'a vehicle failure does not hide the documents');
      expect(s.documentsLoaded, isTrue);
      f.api.vehicleFails = false;
      f.api.failWith = ApiException('Not allowed.');
      s.clear();
      expect(s.vehicleLoaded, isFalse);
      expect(s.documents, isEmpty);
      expect(s.vehicle.exists, isFalse);
    });

    test('pushes update the vehicle and add or change a document in place; garbage is ignored', () {
      fakeCompliance();
      final s = ComplianceStore.instance;
      s.applyVehiclePush(vehicleJson(over: {'model': 'Yamaha'}));
      expect(s.vehicle.model, 'Yamaha');
      s.applyDocumentPush(docJson('1', status: 'pending'));
      s.applyDocumentPush(docJson('2', status: 'pending'));
      expect(s.documents.map((d) => d.id), ['2', '1']);
      s.applyDocumentPush(docJson('1', status: 'rejected', reason: 'Blurry'));
      expect(s.documents.firstWhere((d) => d.id == '1').rejectionReason, 'Blurry');
      expect(s.documents, hasLength(2));
      s.applyDocumentPush('garbage');
      s.applyVehiclePush(null);
      expect(s.documents, hasLength(2));
    });

    test('sending a document stores the scan privately FIRST, then attaches it with its file id and an ISO date', () async {
      final f = fakeCompliance();
      final s = ComplianceStore.instance;
      final d = await s.submit(type: 'vehicle_insurance', number: ' AB-12 ', expiresOn: DateTime(2027, 3, 5), photo: const PickedPhoto('/tmp/x.jpg'));
      expect(f.uploader.uploaded, ['/tmp/x.jpg']);
      expect(f.api.lastUpload, {'type': 'vehicle_insurance', 'number': ' AB-12 ', 'expiresOn': '2027-03-05', 'fileId': '11111111-2222-3333-4444-555555555555'});
      expect(d.isPending, isTrue);
      expect(s.documents.first.id, d.id);
    });

    test('a failed upload sends nothing and changes nothing', () async {
      final f = fakeCompliance();
      f.uploader.failWith = ApiException.local('err_offline');
      final s = ComplianceStore.instance;
      await expectLater(s.submit(type: 'other', photo: const PickedPhoto('/tmp/x.jpg')), throwsA(isA<ApiException>()));
      expect(f.api.calls, isNot(contains('upload')));
      expect(s.documents, isEmpty);
    });

    test('the socket calls match the contract', () async {
      final sent = <String, Map<String, dynamic>?>{};
      RiderStore.instance.transport = (event, body) async {
        sent[event] = body;
        return switch (event) {
          'rider:vehicle' => vehicleJson(),
          'rider:documents' => [docJson('1')],
          _ => docJson('2', status: 'pending'),
        };
      };
      addTearDown(() => RiderStore.instance.transport = null);
      final api = SocketComplianceApi();
      expect((await api.vehicle()).plate, 'KN 4821 A');
      expect(await api.documents(), hasLength(1));
      await api.upload(type: 'id_card', number: ' 123 ', expiresOn: '2030-01-01', fileId: 'f');
      expect(sent['rider:documentUpload'], {'type': 'id_card', 'number': '123', 'expiresOn': '2030-01-01', 'fileId': 'f'});
      await api.upload(type: 'other', number: '  ', fileId: 'f');
      expect(sent['rider:documentUpload'], {'type': 'other', 'fileId': 'f'}, reason: 'blank number and no date are not sent');
      expect(sent['rider:vehicle'], isNull);
    });
  });

  group('texts', () {
    test('every compliance text is in both languages, with the same placeholders', () {
      for (final e in kComplianceMessages.entries) {
        expect(e.value.$1.trim(), isNotEmpty, reason: e.key);
        expect(e.value.$2.trim(), isNotEmpty, reason: e.key);
        expect(e.value.$1 == e.value.$2, isFalse, reason: '${e.key} is not translated');
        final ph = RegExp(r'\{(\w+)\}');
        expect(ph.allMatches(e.value.$1).map((m) => m.group(1)).toSet(), ph.allMatches(e.value.$2).map((m) => m.group(1)).toSet(), reason: e.key);
        expect(kMessages.containsKey(e.key), isTrue, reason: '${e.key} is merged into kMessages');
      }
    });

    test('every document type, vehicle type, fuel and status has a name in both languages', () {
      for (final lang in ['en', 'fr']) {
        final s = Strings(lang);
        for (final t in kDocumentTypes) {
          expect(s.has('dtype_$t'), isTrue, reason: t);
        }
        for (final t in ['motorbike', 'scooter', 'bicycle', 'car', 'van', 'truck', 'other']) {
          expect(s.vehicleTypeName(t), isNotEmpty, reason: t);
        }
        for (final f in ['petrol', 'diesel', 'electric', 'hybrid', 'none']) {
          expect(s.fuelName(f), isNotEmpty, reason: f);
        }
        for (final st in ['pending', 'approved', 'rejected']) {
          expect(s.docStatus(st), isNot(st), reason: st);
        }
      }
      expect(const Strings('fr').docTypeName('driver_licence'), 'Permis de conduire');
      expect(const Strings('en').docExpiring(0, 'x'), 'Expires today');
      expect(const Strings('fr').docExpiring(12, '1 janv.'), 'Expire dans 12 jours (1 janv.)');
    });

    test('the server sentences of the compliance events are translated', () {
      const fr = Strings('fr');
      const sentences = [
        'Rider not found.',
        'Document not found.',
        'Upload the file first, then send it with its file id.',
        'Upload the file again and retry.',
        'Only JPEG, PNG or PDF files are accepted.',
        'The file is too large (5 MB at most).',
        'This file was already sent. Upload a new one.',
        'You have reached the limit of documents. Ask your warehouse to review the ones you sent.',
        'Expiry date must be a date written YYYY-MM-DD.',
        'Document type must be one of: driver_licence, vehicle_insurance, vehicle_registration, id_card, other.',
        'Document number must be 1-60 characters.',
      ];
      for (final m in sentences) {
        expect(translateServerError(m, fr), isNot(equals(m)), reason: m);
        expect(translateServerError(m, const Strings('en')), m);
      }
      expect(translateServerError('Expiry date must be a date written YYYY-MM-DD.', fr), contains('AAAA-MM-JJ'));
      expect(translateServerError('Something unknown.', fr), 'Something unknown.');
    });
  });

  Future<void> pumpApp(WidgetTester t, String lang, Widget home, {double scale = 1, double height = 780}) async {
    await Strings.setLang(lang, persist: false);
    t.view.physicalSize = Size(360 * 3, height * 3);
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    await t.pumpWidget(KeyedSubtree(
      key: UniqueKey(),
      child: MaterialApp(
        locale: Locale(lang),
        supportedLocales: const [Locale('en'), Locale('fr')],
        localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
        theme: AppTheme.light(),
        builder: scale == 1 ? null : (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)), child: child!),
        home: home,
      ),
    ));
    await t.pump(const Duration(milliseconds: 600));
  }

  group('vehicle screen', () {
    for (final lang in ['en', 'fr']) {
      testWidgets('shows every detail, read only ($lang)', (t) async {
        fakeCompliance();
        await pumpApp(t, lang, const RiderVehicleScreen());
        final s = Strings(lang);
        expect(find.text(s.vehicleTitle), findsOneWidget);
        expect(find.text('Honda CG 125 · ${s.vehicleTypeName('motorbike')}'), findsOneWidget);
        for (final v in ['KN 4821 A', 'Black', lang == 'fr' ? '18 240 km' : '18,240 km', s.fuelName('petrol')]) {
          expect(find.text(v), findsOneWidget, reason: v);
        }
        for (final l in [s.vehiclePlate, s.vehicleColour, s.vehicleOdometer, s.vehicleFuel, s.vehicleInsurance, s.vehicleLastService, s.vehicleNextService]) {
          expect(find.text(l), findsOneWidget, reason: l);
        }
        expect(find.text(s.vehicleReadonly), findsOneWidget);
        expect(find.byType(TextField), findsNothing);
        expect(find.byType(FilledButton), findsNothing);
        expect(find.byKey(const ValueKey('warn-insurance')), findsNothing);
        expect(find.byKey(const ValueKey('warn-service')), findsNothing);
        expectButtonRules(t);
      });
    }

    testWidgets('an expired insurance and an overdue service are reminders in red; close ones in amber; nothing blocks', (t) async {
      fakeCompliance(vehicle: vehicleJson(over: {'insuranceValidUntil': '2026-06-01', 'nextServiceOn': '2026-06-20'}));
      await pumpApp(t, 'en', const RiderVehicleScreen());
      expect(find.byKey(const ValueKey('warn-insurance')), findsOneWidget);
      expect(find.textContaining('Insurance expired on'), findsOneWidget);
      expect(find.text('Service due in 5 days'), findsOneWidget);
      fakeCompliance(vehicle: vehicleJson(over: {'insuranceValidUntil': '2026-06-25', 'nextServiceOn': '2026-06-01'}));
      await pumpApp(t, 'fr', const RiderVehicleScreen());
      expect(find.text('L’assurance se termine dans 10 jours'), findsOneWidget);
      expect(find.textContaining('Entretien en retard depuis le'), findsOneWidget);
    });

    testWidgets('no vehicle recorded yet: an explanation, no empty rows', (t) async {
      fakeCompliance(vehicle: {'exists': false});
      await pumpApp(t, 'en', const RiderVehicleScreen());
      expect(find.byKey(const ValueKey('vehicle-none')), findsOneWidget);
      expect(find.text('Your warehouse has not recorded your vehicle yet.'), findsOneWidget);
      expect(find.byKey(const ValueKey('vehicle-card')), findsNothing);
    });

    testWidgets('a failed read shows the problem and a retry that works', (t) async {
      final f = fakeCompliance();
      f.api.failWith = ApiException('Not allowed.');
      await pumpApp(t, 'fr', const RiderVehicleScreen());
      expect(find.byKey(const ValueKey('vehicle-error')), findsOneWidget);
      f.api.failWith = null;
      await t.tap(find.byKey(const ValueKey('vehicle-retry')));
      await t.pump(const Duration(milliseconds: 300));
      expect(find.byKey(const ValueKey('vehicle-card')), findsOneWidget);
    });

    testWidgets('a push from the warehouse changes the screen at once', (t) async {
      fakeCompliance();
      await pumpApp(t, 'en', const RiderVehicleScreen());
      expect(find.text('KN 4821 A'), findsOneWidget);
      ComplianceStore.instance.applyVehiclePush(vehicleJson(over: {'plate': 'KN 1111 B'}));
      await t.pump();
      expect(find.text('KN 1111 B'), findsOneWidget);
    });
  });

  group('documents screen', () {
    final docs = [
      RiderDocumentDto.fromJson(docJson('1', type: 'driver_licence', status: 'approved', expiresOn: '2028-01-01', number: 'KN-998877', by: 'Amani')),
      RiderDocumentDto.fromJson(docJson('2', type: 'vehicle_insurance', status: 'approved', expiresOn: '2026-06-30')),
      RiderDocumentDto.fromJson(docJson('3', type: 'id_card', status: 'pending', expiresOn: null)),
      RiderDocumentDto.fromJson(docJson('4', type: 'vehicle_registration', status: 'rejected', expiresOn: '2025-01-01', reason: 'Photo is blurry', by: 'Amani')),
      RiderDocumentDto.fromJson(docJson('5', type: 'other', status: 'approved', expiresOn: '2026-05-01')),
    ];

    for (final lang in ['en', 'fr']) {
      testWidgets('each document with its status and expiry; reminders say you can keep working ($lang)', (t) async {
        fakeCompliance(docs: docs);
        await pumpApp(t, lang, const RiderDocumentsScreen(), height: 1700);
        final s = Strings(lang);
        for (final id in ['1', '2', '3', '4', '5']) {
          expect(find.byKey(ValueKey('doc-$id')), findsOneWidget, reason: id);
        }
        expect(find.descendant(of: find.byKey(const ValueKey('doc-status-1')), matching: find.text(s.docStatus('approved'))), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('doc-status-3')), matching: find.text(s.docStatus('pending'))), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('doc-status-4')), matching: find.text(s.docStatus('rejected'))), findsOneWidget);
        expect(find.text(s.docRejectedReason('Photo is blurry')), findsOneWidget);
        expect(find.text(s.docNumber('KN-998877')), findsOneWidget);
        expect(t.widget<Text>(find.byKey(const ValueKey('doc-expiry-3'))).data, s.docNoExpiry);
        expect(t.widget<Text>(find.byKey(const ValueKey('doc-expiry-2'))).data, s.docExpiring(15, fmtDay(s, '2026-06-30')));
        expect(t.widget<Text>(find.byKey(const ValueKey('doc-expiry-5'))).data, startsWith(lang == 'fr' ? 'Expiré le' : 'Expired on'));
        expect(t.widget<Text>(find.byKey(const ValueKey('doc-expiry-1'))).data, startsWith(lang == 'fr' ? 'Valable jusqu’au' : 'Valid until'));
        expect(find.byKey(const ValueKey('docs-warn-expired')), findsOneWidget);
        expect(find.byKey(const ValueKey('docs-warn-expiring')), findsOneWidget);
        expect(find.text(s.docWarnNote), findsOneWidget);
        expectButtonRules(t);
      });
    }

    testWidgets('with nothing expiring there is no reminder; with no document an empty state', (t) async {
      fakeCompliance(docs: [docs[0], docs[2]]);
      await pumpApp(t, 'en', const RiderDocumentsScreen());
      expect(find.byKey(const ValueKey('docs-warn-expired')), findsNothing);
      expect(find.byKey(const ValueKey('docs-warn-note')), findsNothing);
      fakeCompliance(docs: []);
      await pumpApp(t, 'en', const RiderDocumentsScreen());
      expect(find.byKey(const ValueKey('docs-empty')), findsOneWidget);
    });

    testWidgets('a failed read shows the problem and a retry that works', (t) async {
      final f = fakeCompliance(docs: docs);
      f.api.failWith = ApiException.local('err_offline');
      await pumpApp(t, 'en', const RiderDocumentsScreen());
      expect(find.byKey(const ValueKey('docs-error')), findsOneWidget);
      f.api.failWith = null;
      await t.tap(find.byKey(const ValueKey('docs-retry')));
      await t.pump(const Duration(milliseconds: 300));
      expect(find.byKey(const ValueKey('doc-1')), findsOneWidget);
    });

    testWidgets('approval or rejection pushed by the warehouse shows at once', (t) async {
      fakeCompliance(docs: [docs[2]]);
      await pumpApp(t, 'en', const RiderDocumentsScreen());
      expect(find.text('Waiting for review'), findsOneWidget);
      ComplianceStore.instance.applyDocumentPush(docJson('3', type: 'id_card', status: 'rejected', expiresOn: null, reason: 'Cut off', by: 'Amani'));
      await t.pump();
      expect(find.text('Reason: Cut off'), findsOneWidget);
      expect(find.text('Waiting for review'), findsNothing);
    });
  });

  group('upload a document', () {
    Future<void> open(WidgetTester t, String lang, {List<RiderDocumentDto>? docs}) async {
      fakeCompliance(docs: docs ?? []);
      await pumpApp(t, lang, const RiderDocumentsScreen());
      await t.tap(find.byKey(const ValueKey('doc-upload')));
      await t.pumpAndSettle();
    }

    testWidgets('type, number, date and a photo from the camera; sent in two steps; the list shows it pending', (t) async {
      await open(t, 'en');
      final f = (api: ComplianceStore.instance.api as FakeComplianceApi, picker: ComplianceStore.instance.picker as FakeDocPicker, uploader: ComplianceStore.instance.uploader as FakePrivateUploader);
      expect(find.byKey(const ValueKey('doc-send')), findsOneWidget);
      await t.tap(find.byKey(const ValueKey('type-driver_licence')));
      await t.enterText(find.byKey(const ValueKey('doc-number')), 'kn-998877');
      await t.tap(find.byKey(const ValueKey('photo-camera')));
      await t.pumpAndSettle();
      expect(f.picker.asked, ['camera:1']);
      expect(find.byKey(const ValueKey('doc-photo')), findsOneWidget);
      expect(find.bySemanticsLabel('Photo of your document'), findsOneWidget);
      await t.tap(find.byKey(const ValueKey('doc-send')));
      await t.pumpAndSettle();
      expect(f.uploader.uploaded, ['/tmp/licence.jpg']);
      expect(f.api.lastUpload!['type'], 'driver_licence');
      expect(f.api.lastUpload!['number'], 'kn-998877');
      expect(f.api.lastUpload!['expiresOn'], isNull, reason: 'the date is optional');
      expect(find.text('Document sent. Your warehouse will review it.'), findsOneWidget);
      expect(find.byKey(const ValueKey('doc-upload')), findsOneWidget, reason: 'back on the list');
      expect(find.text('Waiting for review'), findsOneWidget);
    });

    testWidgets('an expiry date can be picked and cleared; it is sent as YYYY-MM-DD', (t) async {
      await open(t, 'en');
      final api = ComplianceStore.instance.api as FakeComplianceApi;
      await t.tap(find.byKey(const ValueKey('type-vehicle_insurance')));
      await t.tap(find.byKey(const ValueKey('photo-gallery')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('doc-expiry-pick')));
      await t.pumpAndSettle();
      await t.tap(find.text('OK'));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('doc-expiry-clear')), findsOneWidget);
      await t.tap(find.byKey(const ValueKey('doc-expiry-clear')));
      await t.pump();
      expect(find.byKey(const ValueKey('doc-expiry-clear')), findsNothing);
      await t.tap(find.byKey(const ValueKey('doc-expiry-pick')));
      await t.pumpAndSettle();
      await t.tap(find.text('OK'));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('doc-send')));
      await t.pumpAndSettle();
      expect(api.lastUpload!['expiresOn'], '2027-06-15', reason: 'a year from the (test) today');
    });

    testWidgets('a missing type or photo is refused with a snackbar and an inline message; nothing is sent', (t) async {
      await open(t, 'fr');
      final api = ComplianceStore.instance.api as FakeComplianceApi;
      await t.tap(find.byKey(const ValueKey('doc-send')));
      await t.pump();
      expect(find.text('Choisissez le type de document.'), findsNWidgets(2), reason: 'inline and in the snackbar');
      await t.tap(find.byKey(const ValueKey('type-id_card')));
      await t.pump();
      await t.tap(find.byKey(const ValueKey('doc-send')));
      await t.pump();
      expect(find.text('Ajoutez une photo du document.'), findsNWidgets(2));
      expect(api.calls, isNot(contains('upload')));
    });

    for (final lang in ['en', 'fr']) {
      testWidgets('a refused camera or gallery permission says so ($lang)', (t) async {
        await open(t, lang);
        final picker = ComplianceStore.instance.picker as FakeDocPicker;
        final s = Strings(lang);
        picker.failWith = PlatformException(code: 'camera_access_denied');
        await t.tap(find.byKey(const ValueKey('photo-camera')));
        await t.pump();
        expect(find.text(s.errCameraDenied), findsOneWidget);
        expect(find.byKey(const ValueKey('doc-photo')), findsNothing);
        picker.failWith = PlatformException(code: 'photo_access_denied');
        await t.tap(find.byKey(const ValueKey('photo-gallery')));
        await t.pump();
        expect(find.text(s.errPhotosDenied), findsOneWidget);
        picker.failWith = StateError('boom');
        await t.tap(find.byKey(const ValueKey('photo-gallery')));
        await t.pump();
        expect(find.text(s.errPhotoPick), findsOneWidget);
      });
    }

    testWidgets('a server refusal is shown in the rider\'s language and the form stays', (t) async {
      await open(t, 'fr');
      final api = ComplianceStore.instance.api as FakeComplianceApi;
      api.failWith = ApiException('Only JPEG, PNG or PDF files are accepted.');
      await t.tap(find.byKey(const ValueKey('type-id_card')));
      await t.tap(find.byKey(const ValueKey('photo-gallery')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('doc-send')));
      await t.pumpAndSettle();
      expect(find.text('Seuls les fichiers JPEG, PNG ou PDF sont acceptés.'), findsOneWidget);
      expect(find.byKey(const ValueKey('doc-send')), findsOneWidget);
      expect(ComplianceStore.instance.documents, isEmpty);
    });

    testWidgets('the form passes the button rules (label-only CTA, one filled button) and holds at 200% text', (t) async {
      await open(t, 'fr');
      expectButtonRules(t);
      await t.tap(find.byKey(const ValueKey('type-driver_licence')));
      await t.tap(find.byKey(const ValueKey('photo-gallery')));
      await t.pumpAndSettle();
      expectButtonRules(t);
      await pumpApp(t, 'fr', const UploadDocumentScreen(), scale: 2.0);
      expect(t.takeException(), isNull);
      expect(find.byKey(const ValueKey('doc-send')), findsOneWidget);
    });
  });

  group('profile', () {
    for (final lang in ['en', 'fr']) {
      testWidgets('the two entries open the screens; a reminder shows on the documents row ($lang)', (t) async {
        fakeCompliance(docs: [RiderDocumentDto.fromJson(docJson('1', expiresOn: '2026-06-20'))]);
        await ComplianceStore.instance.load(); // the store reads once the socket is ready
        await pumpApp(t, lang, Scaffold(body: ProfileScreen(locale: Locale(lang), onLocaleChanged: (_) {})));
        final s = Strings(lang);
        expect(find.text(s.vehicleTitle), findsOneWidget);
        expect(find.text(s.docTitle), findsOneWidget);
        expect(find.byKey(const ValueKey('documents-attention')), findsOneWidget);
        await t.ensureVisible(find.byKey(const ValueKey('vehicle-entry')));
        await t.tap(find.byKey(const ValueKey('vehicle-entry')));
        await t.pumpAndSettle();
        expect(find.byKey(const ValueKey('vehicle-card')), findsOneWidget);
        await t.tap(find.byIcon(Icons.arrow_back_rounded));
        await t.pumpAndSettle();
        await t.ensureVisible(find.byKey(const ValueKey('documents-entry')));
        await t.tap(find.byKey(const ValueKey('documents-entry')));
        await t.pumpAndSettle();
        expect(find.byKey(const ValueKey('doc-1')), findsOneWidget);
      });
    }

    testWidgets('no reminder when every document is fine', (t) async {
      fakeCompliance(docs: [RiderDocumentDto.fromJson(docJson('1', expiresOn: '2030-01-01'))]);
      await ComplianceStore.instance.load();
      await pumpApp(t, 'en', Scaffold(body: ProfileScreen(locale: const Locale('en'), onLocaleChanged: (_) {})));
      expect(find.byKey(const ValueKey('documents-attention')), findsNothing);
    });
  });

  group('layout', () {
    final screens = <String, Widget Function()>{
      'vehicle': () => const RiderVehicleScreen(),
      'documents': () => const RiderDocumentsScreen(),
      'upload form': () => const UploadDocumentScreen(),
    };
    for (final e in screens.entries) {
      testWidgets('no overflow or overlap: ${e.key}', (t) async {
        addTearDown(t.view.reset);
        final found = <String>[];
        for (final c in layoutConfigs) {
          await Strings.setLang(c.lang, persist: false);
          fakeCompliance(vehicle: vehicleJson(over: {'insuranceValidUntil': '2026-06-25', 'nextServiceOn': '2026-06-01'}), docs: [
            RiderDocumentDto.fromJson(docJson('1', number: 'KN-998877', by: 'Amani')),
            RiderDocumentDto.fromJson(docJson('2', type: 'vehicle_insurance', expiresOn: '2026-06-30')),
            RiderDocumentDto.fromJson(docJson('4', type: 'vehicle_registration', status: 'rejected', expiresOn: '2025-01-01', reason: 'The photo is blurry and the plate cannot be read, please take it again in daylight', by: 'Amani')),
          ]);
          final problems = await layoutProblems(
            t,
            c,
            MaterialApp(
              locale: Locale(c.lang),
              supportedLocales: const [Locale('en'), Locale('fr')],
              localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
              theme: AppTheme.light(),
              builder: scaleText(c),
              home: e.value(),
            ),
          );
          found.addAll(problems.map((p) => '$c: $p'));
        }
        expect(found, isEmpty);
      });
    }
  });
}
