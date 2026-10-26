// Shared fixtures for the aftersale_*_test.dart files (not a test itself): payloads in the shape of
// docs/contracts/after-sale.md, a scripted socket, and a signed-in customer with a delivered order.
import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/services/aftersale_store.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/services/upload_service.dart';
import 'package:lipcart/widgets/photo_picker.dart';

import 'gap_helpers.dart';

/// A 1x1 PNG: a photo the picker can "take".
final Uint8List asTinyPng = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');

const asVariants = '[{"name":"Size","options":["40","41","42"]},{"name":"Colour","options":["Black","White"]}]';
const asVariantLabels = '{"fr":[{"name":"Pointure","options":["40","41","42"]},{"name":"Couleur","options":["Noir","Blanc"]}]}';

Map<String, dynamic> disputeItemJson(String id, {String name = 'Running shoes', String nameFr = 'Chaussures de course', int qty = 1, double unit = 20, double refund = 0, String variant = 'Default'}) => {
      'id': id,
      'disputeId': 'd1',
      'orderItemId': 'oi-$id',
      'productId': 'p1',
      'productName': name,
      'productNameFr': nameFr,
      'variant': variant,
      'variantFr': variant == 'Default' ? '' : variant,
      'qty': qty,
      'unitPriceUsd': unit,
      'refundUsd': refund,
      'condition': null,
      'restockedQty': 0,
    };

Map<String, dynamic> msgJ(String id, {String role = 'seller', String name = 'Jean Mukendi', String text = 'Hello', List<String> attachments = const [], String at = '2026-10-24T10:00:00Z'}) => {
      'id': id,
      'disputeId': 'd1',
      'authorId': role == 'customer' ? 'u1' : null,
      'authorName': name,
      'role': role,
      'text': text,
      'attachments': attachments,
      'createdAt': at,
    };

/// A request in the shape of `disputes:get` / `disputes:list` / the pushes.
Map<String, dynamic> disputeJson({
  String id = 'd1',
  String reference = 'RET-1001',
  String type = 'return',
  String status = 'open',
  String? stage = 'awaiting_seller',
  String? category = 'damaged',
  String reason = 'The sole came off after two days',
  List<String> attachments = const [],
  List<Map<String, dynamic>>? items,
  String? sellerId = 's1',
  String? sellerDueAt,
  String? sellerRespondedAt,
  String? sellerReason,
  String? resolution,
  String? outcome,
  double refundUsd = 0,
  String refundTo = 'wallet',
  String? receivedAt,
  String? pickupTaskId,
  bool canEscalate = false,
  bool canCancel = false,
  List<Map<String, dynamic>>? messages,
  String createdAt = '2026-10-24T09:30:00Z',
  String? updatedAt,
}) =>
    {
      'id': id,
      'reference': reference,
      'orderId': 'o1',
      'orderReference': 'SOM-1042',
      'customerId': 'u1',
      'customerName': 'Aline Kasongo',
      'type': type,
      'category': category,
      'reason': reason,
      'status': status,
      if (stage != null) 'stage': stage,
      'attachments': attachments,
      'items': items ?? [disputeItemJson('di1')],
      'sellerId': sellerId,
      'sellerDueAt': sellerDueAt,
      'sellerRespondedAt': sellerRespondedAt,
      'sellerReason': sellerReason,
      'escalatedAt': null,
      'resolution': resolution,
      'outcome': outcome,
      'refundUsd': refundUsd,
      'refundTo': refundTo,
      'receivedAt': receivedAt,
      'gradedAt': null,
      'pickupTaskId': pickupTaskId,
      'canEscalate': canEscalate,
      'canCancel': canCancel,
      'createdAt': createdAt,
      'updatedAt': updatedAt ?? createdAt,
      if (messages != null) 'messages': messages,
      if (messages != null) 'messageCount': messages.length,
    };

/// What the API sent before the after-sale rework: no stage, items, photos or thread.
Map<String, dynamic> oldDisputeJson({String id = 'd0', String status = 'open', String? resolution}) => {
      'id': id,
      'reference': 'RET-0009',
      'orderId': 'o1',
      'orderReference': 'SOM-1042',
      'type': 'return',
      'reason': 'Too small',
      'status': status,
      'resolution': resolution,
    };

Map<String, dynamic> replacementJson({
  String id = 'r1',
  String reference = 'REP-2001',
  String status = 'requested',
  String? sellerReason,
  String? deliveryTaskId,
  String? sellerDueAt = '2026-10-26T09:30:00Z',
  String? deliveredAt,
  List<String> attachments = const [],
  String createdAt = '2026-10-24T09:30:00Z',
  String? updatedAt,
}) =>
    {
      'id': id,
      'reference': reference,
      'orderId': 'o1',
      'orderReference': 'SOM-1042',
      'sellerId': 's1',
      'sku': 'p1',
      'productName': 'Running shoes',
      'productNameFr': 'Chaussures de course',
      'reason': 'One shoe is torn',
      'condition': 'damaged',
      'qty': 1,
      'variant': 'Size: 40 · Colour: Black',
      'attachments': attachments,
      'status': status,
      'dispatchStatus': 'pending',
      'sellerDueAt': sellerDueAt,
      'sellerRespondedAt': null,
      'sellerReason': sellerReason,
      'deliveryTaskId': deliveryTaskId,
      'deliveredAt': deliveredAt,
      'createdAt': createdAt,
      'updatedAt': updatedAt ?? createdAt,
    };

Map<String, dynamic> exchangeJson({
  String id = 'x1',
  String reference = 'EXC-3001',
  String status = 'requested',
  double diff = 10,
  double held = 10,
  String? sellerReason,
  String? deliveryTaskId,
  String? sellerDueAt = '2026-10-26T09:30:00Z',
  String? deliveredAt,
  String createdAt = '2026-10-24T09:30:00Z',
  String? updatedAt,
}) =>
    {
      'id': id,
      'reference': reference,
      'orderId': 'o1',
      'orderReference': 'SOM-1042',
      'sellerId': 's1',
      'fromSku': 'p1',
      'fromName': 'Running shoes',
      'fromNameFr': 'Chaussures de course',
      'fromVariant': 'Size: 40 · Colour: Black',
      'toSku': 'p1',
      'toName': 'Running shoes',
      'toNameFr': 'Chaussures de course',
      'toVariant': 'Size: 42 · Colour: Black',
      'qty': 1,
      'priceDiffUsd': diff,
      'heldUsd': held,
      'reason': 'Too small',
      'status': status,
      'sellerDueAt': sellerDueAt,
      'sellerRespondedAt': null,
      'sellerReason': sellerReason,
      'deliveryTaskId': deliveryTaskId,
      'deliveredAt': deliveredAt,
      'createdAt': createdAt,
      'updatedAt': updatedAt ?? createdAt,
    };

Map<String, dynamic> eligibilityJson({
  bool eligible = true,
  String? reason,
  int windowDays = 7,
  String? endsAt,
  List<Map<String, dynamic>>? items,
}) =>
    {
      'eligible': eligible,
      'reason': reason,
      'windowDays': windowDays,
      'deliveredAt': '2026-10-24T09:30:00Z',
      'endsAt': endsAt ?? DateTime.now().add(const Duration(days: 4)).toUtc().toIso8601String(),
      'items': items ??
          [
            {'itemId': 'oi1', 'productId': 'p1', 'productName': 'Running shoes', 'variant': 'Size: 40 · Colour: Black', 'qty': 2, 'remaining': 2, 'unitPriceUsd': 20},
            {'itemId': 'oi2', 'productId': 'p2', 'productName': 'Earbuds', 'variant': 'Default', 'qty': 1, 'remaining': 1, 'unitPriceUsd': 30},
          ],
    };

/// A delivered order of two lines (2 x p1 at $20 with options, 1 x p2 at $30).
OrderDto asOrder({String status = 'delivered', String method = 'wallet', String id = 'o1'}) => OrderDto.fromJson({
      'id': id,
      'reference': 'SOM-1042',
      'customerName': 'Aline',
      'status': status,
      'paymentMethod': method,
      'subtotalUsd': 70,
      'deliveryFeeUsd': 3,
      'totalUsd': 73,
      'createdAt': '2026-10-20T09:30:00Z',
      'items': [
        {
          'productId': 'p1',
          'productName': 'Running shoes',
          'productNameFr': 'Chaussures de course',
          'qty': 2,
          'priceUsd': 20,
          'variant': 'Size: 40 · Colour: Black',
          'variantFr': 'Pointure : 40 · Couleur : Noir',
          'sellerId': 's1',
          'sellerName': 'Kinshasa Traders',
        },
        {'productId': 'p2', 'productName': 'Earbuds', 'productNameFr': 'Écouteurs', 'qty': 1, 'priceUsd': 30, 'variant': 'Default', 'sellerId': 's1', 'sellerName': 'Kinshasa Traders'},
      ],
    });

/// A scripted server: answers the events a test cares about and records every call.
class AsFake {
  final List<(String, Map<String, dynamic>?)> calls = [];
  final Map<String, FutureOr<dynamic> Function(Map<String, dynamic>? body)> handlers = {};

  Iterable<Map<String, dynamic>?> bodiesOf(String event) => calls.where((c) => c.$1 == event).map((c) => c.$2);
  int countOf(String event) => calls.where((c) => c.$1 == event).length;

  void install() {
    RealtimeStore.instance.debugCallRequest = (event, [body]) async {
      calls.add((event, body));
      final h = handlers[event];
      if (h != null) return await h(body);
      return const <dynamic>[];
    };
  }
}

/// Fresh singletons: a signed-in customer, empty after-sale store, a scripted socket.
Future<AsFake> asReset({String lang = 'en', List<ProductDto>? products}) async {
  await gapReset(
    lang: lang,
    products: products ?? [gapDto('p1', price: 30, variants: asVariants), gapDto('p2', price: 30)],
  );
  AfterSaleStore.instance.reset();
  final store = RealtimeStore.instance;
  store.orders.clear();
  store.walletBalance = 100;
  UploadService.debugUpload = null;
  debugPhotoSource = null;
  return AsFake()..install();
}

void asTearDown() {
  RealtimeStore.instance
    ..debugCallRequest = null
    ..orders.clear();
  UploadService.debugUpload = null;
  debugPhotoSource = null;
  AfterSaleStore.instance.reset();
  gapTearDown();
}

/// The photos "choose from library" returns, uploaded to `/uploads/photo-<n>.jpg`.
void asFakePhotos(int count) {
  var n = 0;
  UploadService.debugUpload = (bytes, filename) async => '/uploads/photo-${++n}.jpg';
  debugPhotoSource = (source, remaining) async => [for (var i = 0; i < count; i++) XFile.fromData(asTinyPng, name: 'p$i.jpg')];
}

/// Adds photos through the picker. [settle] false when an upload is meant to stay pending (its spinner never rests).
Future<void> asAttachPhotos(WidgetTester tester, {bool settle = true}) async {
  Future<void> rest() async {
    if (settle) {
      await tester.pumpAndSettle();
    } else {
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
    }
  }

  final add = find.byKey(const ValueKey('photo-add'));
  await tester.ensureVisible(add);
  await tester.tap(add);
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const ValueKey('photo-library')));
  await rest();
}

ApiException asServerError(String message) => ApiException(message);

/// The text of the snackbar on screen (null when none).
String? asSnack(WidgetTester tester) {
  final f = find.byType(SnackBar);
  if (f.evaluate().isEmpty) return null;
  return tester.widgetList<Text>(find.descendant(of: f, matching: find.byType(Text))).map((t) => t.data ?? '').join(' ');
}

/// Pumps a screen on a tall phone and lets its first loads finish.
Future<void> asOpen(WidgetTester tester, Widget screen, {String lang = 'en'}) async {
  await Strings.setLang(lang, persist: false);
  gapTallViewport(tester);
  await tester.pumpWidget(KeyedSubtree(key: UniqueKey(), child: gapApp(screen, lang: lang)));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

/// Taps [key] after scrolling it into view.
Future<void> asTap(WidgetTester tester, String key) async {
  final f = find.byKey(ValueKey(key));
  await tester.ensureVisible(f);
  await tester.pump();
  await tester.tap(f);
  await tester.pump();
}

/// Lets async handlers, route transitions and snackbars settle.
Future<void> asSettle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
  await tester.pump(const Duration(milliseconds: 300));
}

String asJson(Object o) => jsonEncode(o);
