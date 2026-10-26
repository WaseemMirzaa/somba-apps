// Where the customer starts a return, a problem report, a replacement or an exchange: the order detail.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/screens/more/aftersale_dispute_form.dart';
import 'package:lipcart/screens/more/order_after_sale.dart';
import 'package:lipcart/screens/more/order_screens.dart';
import 'package:lipcart/screens/more/returns_extra.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';

import 'aftersale_helpers.dart';
import 'gap_helpers.dart';

void main() {
  late AsFake server;

  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  setUp(() async {
    server = await asReset();
    server.handlers['disputes:eligibility'] = (_) => eligibilityJson();
  });
  tearDown(asTearDown);

  Future<void> openOrder(WidgetTester tester, String status, {String lang = 'en'}) async {
    final OrderDto order = asOrder(status: status);
    RealtimeStore.instance.orders
      ..clear()
      ..add(order);
    await asOpen(tester, OrderDetailScreen(orderId: order.id), lang: lang);
    await asSettle(tester);
  }

  testWidgets('a delivered order offers a return, a problem report and replace-or-exchange', (tester) async {
    await openOrder(tester, 'delivered');
    for (final k in ['order-return', 'report-problem', 'item-issue']) {
      expect(find.byKey(ValueKey(k)), findsOneWidget, reason: k);
    }
    expect(find.text('Report a problem'), findsOneWidget);
  });

  testWidgets('the return button opens the return form', (tester) async {
    await openOrder(tester, 'delivered');
    await asTap(tester, 'order-return');
    await asSettle(tester);
    expect(find.byType(ReturnRequestScreen), findsOneWidget);
    expect(server.countOf('disputes:eligibility'), 1);
  });

  testWidgets('the problem button opens the report with all five problems', (tester) async {
    await openOrder(tester, 'delivered');
    await asTap(tester, 'report-problem');
    await asSettle(tester);
    expect(find.byType(DisputeFormScreen), findsOneWidget);
    expect(find.byKey(const ValueKey('cat-missing')), findsOneWidget);
  });

  testWidgets('replace-or-exchange opens the item form', (tester) async {
    await openOrder(tester, 'delivered');
    await asTap(tester, 'item-issue');
    await asSettle(tester);
    expect(find.byType(ItemIssueScreen), findsOneWidget);
  });

  for (final status in ['shipped', 'out_for_delivery']) {
    testWidgets('an order $status can be reported as not received, but not returned', (tester) async {
      await openOrder(tester, status);
      expect(find.byKey(const ValueKey('order-return')), findsNothing);
      expect(find.byKey(const ValueKey('item-issue')), findsNothing);
      await asTap(tester, 'report-problem');
      await asSettle(tester);
      expect(find.byType(DisputeFormScreen), findsOneWidget);
      expect(find.byKey(const ValueKey('cat-not_received')), findsOneWidget);
      expect(find.byKey(const ValueKey('cat-damaged')), findsNothing);
    });
  }

  for (final status in ['pending', 'confirmed', 'processing', 'cancelled']) {
    testWidgets('an order $status offers none of them', (tester) async {
      await openOrder(tester, status);
      for (final k in ['order-return', 'report-problem', 'item-issue']) {
        expect(find.byKey(ValueKey(k)), findsNothing, reason: '$status $k');
      }
    });
  }

  testWidgets('French labels', (tester) async {
    await openOrder(tester, 'delivered', lang: 'fr');
    expect(find.text('Signaler un problème'), findsOneWidget);
    expect(find.text('Remplacer ou échanger'), findsOneWidget);
  });
}
