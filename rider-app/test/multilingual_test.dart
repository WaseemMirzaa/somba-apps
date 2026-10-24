// EN / FR content for the rider: order lines show the French product name to a French rider, and notices prefer
// the server's titleFr / bodyFr. Older servers (no new fields) must keep working.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/notification_text.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/deliveries_screen.dart';
import 'package:somba_rider/screens/profile_screen.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/push_service.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

Map<String, dynamic> _taskJson({List<Map<String, dynamic>>? items}) => {
      'id': 't1',
      'orderId': 'o1',
      'orderReference': 'SOM-101',
      'status': 'assigned',
      'codAmountUsd': 0,
      'order': {
        'customerName': 'Aline',
        'shippingAddress': '{"line1":"12 avenue du Commerce","commune":"Gombe","city":"Kinshasa"}',
        'items': items ??
            [
              {'productName': 'Phone case', 'productNameFr': 'Coque de téléphone', 'qty': 2},
              {'productName': 'Charger', 'qty': 1},
            ],
      },
    };

DeliveryTaskDto _task(String status, {List<OrderLine> items = const []}) => DeliveryTaskDto(
      id: 't-$status',
      orderId: 'o-$status',
      orderReference: 'SOM-9$status',
      status: status,
      codAmountUsd: 0,
      addressRaw: '{"line1":"12 avenue du Commerce","commune":"Gombe","city":"Kinshasa"}',
      customerName: 'Aline',
      pickupAddress: 'Entrepôt central, Limete',
      items: items,
    );

Widget _app(String lang, Widget home) => MaterialApp(
      locale: Locale(lang),
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      theme: AppTheme.light(),
      home: home,
    );

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
      await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
    }
  });

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    final store = RiderStore.instance;
    store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean', role: 'rider', phone: '+243810000000');
    store.loaded = true;
  });

  tearDown(() {
    final store = RiderStore.instance;
    store.user = null;
    store.myTasks.clear();
    store.pool.clear();
    store.notifications.clear();
  });

  group('parsing', () {
    test('order lines carry productNameFr, and a line without it keeps the stored name', () {
      final t = DeliveryTaskDto.fromJson(_taskJson());
      expect(t.items, hasLength(2));
      expect(t.items[0].name, 'Phone case');
      expect(t.items[0].nameFr, 'Coque de téléphone');
      expect(t.items[0].displayName('fr'), 'Coque de téléphone');
      expect(t.items[0].displayName('en'), 'Phone case');
      expect(t.items[1].nameFr, '');
      expect(t.items[1].displayName('fr'), 'Charger', reason: 'old order / old server: the stored name');
      expect(t.items[0].text('fr'), '2× Coque de téléphone');
      expect(t.items[1].text('en'), '1× Charger');
    });

    test('an old payload (no order, no items) still parses', () {
      final t = DeliveryTaskDto.fromJson({'id': 't', 'orderReference': 'SOM-1'});
      expect(t.items, isEmpty);
      expect(const OrderLine('X', 1).displayName('fr'), 'X');
      expect(const OrderLine('X', 1, nameFr: '  ').displayName('fr'), 'X', reason: 'a blank French name is no name');
    });

    test('notifications carry titleFr / bodyFr, and mark-read keeps them', () {
      final n = NotificationDto.fromJson({'id': 'n1', 'title': 'New order', 'body': 'x', 'titleFr': 'Nouvelle commande', 'bodyFr': 'y', 'type': 'task', 'read': false});
      expect((n.titleFr, n.bodyFr), ('Nouvelle commande', 'y'));
      final read = n.asRead();
      expect((read.read, read.titleFr, read.bodyFr), (true, 'Nouvelle commande', 'y'));
      final old = NotificationDto.fromJson({'id': 'n2', 'title': 'New order', 'body': 'x'});
      expect((old.titleFr, old.bodyFr), (null, null));
    });

    test('a push carries the French wording when the server puts it in the data', () {
      const m = PushMessage(title: 'New order', body: 'x', data: {'titleFr': 'Nouvelle commande', 'bodyFr': 'Corps'});
      expect((m.titleFr, m.bodyFr), ('Nouvelle commande', 'Corps'));
      expect(const PushMessage(title: 'x').bodyFr, isNull);
    });
  });

  group('displayNotice', () {
    const fr = Strings('fr'), en = Strings('en');

    test('French prefers the server wording, then the phone\'s patterns, then the raw text', () {
      expect(displayNotice(fr, title: 'New order', body: 'x', titleFr: 'Titre', bodyFr: 'Corps'), ('Titre', 'Corps'));
      expect(displayNotice(fr, title: 'Parcel ready for pickup', body: 'SOM-1 is packed and ready.'), ('Colis prêt à récupérer', 'SOM-1 est emballé et prêt.'));
      expect(displayNotice(fr, title: 'Something new', body: 'Raw text'), ('Something new', 'Raw text'));
      expect(displayNotice(fr, title: 'New order', body: 'x', titleFr: ' ', bodyFr: ''), ('Nouvelle commande', 'x'));
    });

    test('English shows what the server wrote', () {
      expect(displayNotice(en, title: 'New order', body: 'x', titleFr: 'Titre', bodyFr: 'Corps'), ('New order', 'x'));
    });
  });

  group('screens', () {
    Future<void> show(WidgetTester tester, String lang, Widget screen) async {
      await Strings.setLang(lang, persist: false);
      tester.view.physicalSize = const Size(360 * 3, 1400 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(_app(lang, screen));
      await tester.pump(const Duration(milliseconds: 600));
    }

    final lines = [const OrderLine('Phone case', 2, nameFr: 'Coque de téléphone'), const OrderLine('Charger', 1)];

    testWidgets('an active delivery lists the French product names to a French rider', (tester) async {
      RiderStore.instance.myTasks
        ..clear()
        ..add(_task('assigned', items: lines));
      await show(tester, 'fr', const Scaffold(body: DeliveriesScreen()));
      expect(find.text('2× Coque de téléphone, 1× Charger'), findsOneWidget);
      expect(find.textContaining('Phone case'), findsNothing);
    });

    testWidgets('the same delivery in English lists the stored names', (tester) async {
      RiderStore.instance.myTasks
        ..clear()
        ..add(_task('assigned', items: lines));
      await show(tester, 'en', const Scaffold(body: DeliveriesScreen()));
      expect(find.text('2× Phone case, 1× Charger'), findsOneWidget);
      expect(find.textContaining('Coque'), findsNothing);
    });

    testWidgets('an available delivery (the pool) shows the French names too', (tester) async {
      RiderStore.instance.pool
        ..clear()
        ..add(_task('unassigned', items: lines));
      await show(tester, 'fr', const Scaffold(body: DeliveriesScreen()));
      await tester.tap(find.byKey(const ValueKey('tab-1')));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('2× Coque de téléphone, 1× Charger'), findsOneWidget);
    });

    testWidgets('the notification list prefers titleFr / bodyFr in French and falls back to the patterns', (tester) async {
      RiderStore.instance.notifications
        ..clear()
        ..addAll([
          NotificationDto(id: 'n1', title: 'New order', body: 'raw', titleFr: 'Titre du serveur', bodyFr: 'Corps du serveur', type: 'system', read: true),
          NotificationDto(id: 'n2', title: 'Parcel ready for pickup', body: 'SOM-1 is packed and ready.', type: 'system', read: true),
        ]);
      await show(tester, 'fr', Scaffold(body: ProfileScreen(locale: const Locale('fr'), onLocaleChanged: (_) {})));
      expect(find.text('Titre du serveur'), findsOneWidget);
      expect(find.text('Corps du serveur'), findsOneWidget);
      expect(find.text('New order'), findsNothing);
      expect(find.text('Colis prêt à récupérer'), findsOneWidget);
      expect(find.text('SOM-1 est emballé et prêt.'), findsOneWidget);
    });

    testWidgets('in English the notification list shows the server text', (tester) async {
      RiderStore.instance.notifications
        ..clear()
        ..add(NotificationDto(id: 'n1', title: 'New order', body: 'raw', titleFr: 'Titre du serveur', bodyFr: 'Corps du serveur', type: 'system', read: true));
      await show(tester, 'en', Scaffold(body: ProfileScreen(locale: const Locale('en'), onLocaleChanged: (_) {})));
      expect(find.text('New order'), findsOneWidget);
      expect(find.text('raw'), findsOneWidget);
      expect(find.text('Titre du serveur'), findsNothing);
    });
  });
}
