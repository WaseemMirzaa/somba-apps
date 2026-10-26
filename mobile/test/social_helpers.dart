// Shared fixtures for the chat / support / notification-preference tests (not a test itself).
import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/chat_store.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/services/support_store.dart';
import 'package:lipcart/services/upload_service.dart';
import 'package:lipcart/widgets/photo_picker.dart';

import 'gap_helpers.dart';

/// A 1x1 PNG: a photo the picker can "take".
final Uint8List tinyPng = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');

Map<String, dynamic> convJson({
  String id = 'c1',
  String storeName = 'Mama Tech',
  String sellerId = 's1',
  int unread = 0,
  String? productId,
  String? productName,
  String? productImage,
  String? orderId,
  String? orderReference,
  String preview = 'Bonjour, oui il est disponible.',
  String? at = '2026-10-24T09:30:00Z',
  String side = 'buyer',
  String? logo,
}) =>
    {
      'id': id,
      'side': side,
      'buyerId': 'u1',
      'buyerName': 'Aline',
      'sellerId': sellerId,
      'storeName': storeName,
      'storeLogo': logo,
      'productId': productId,
      'productName': productName,
      'productImage': productImage,
      'orderId': orderId,
      'orderReference': orderReference,
      'lastMessageAt': at,
      'lastMessagePreview': preview,
      'unread': unread,
    };

Map<String, dynamic> msgJson(
  String id, {
  String convId = 'c1',
  String side = 'seller',
  String text = 'Hello',
  List<String> attachments = const [],
  String at = '2026-10-24T09:30:00Z',
  String? senderName,
}) =>
    {
      'id': id,
      'conversationId': convId,
      'senderId': side == 'buyer' ? 'u1' : 'seller-user',
      'senderSide': side,
      'senderName': senderName ?? (side == 'buyer' ? 'Aline' : 'Mama Tech'),
      'text': text,
      'attachments': attachments,
      'createdAt': at,
    };

Map<String, dynamic> ticketJson(
  String id, {
  String reference = 'TKT-0001',
  String subject = 'Where is my parcel?',
  String status = 'open',
  Object? messages,
  Object? userUnread,
  String? category,
  String? orderId,
  String? updatedAt,
  bool legacy = false,
}) {
  final list = messages ??
      [
        {'id': 'tm1', 'from': 'Aline', 'fromId': 'u1', 'role': 'customer', 'text': 'It has been a week.', 'at': '2026-10-24T09:30:00Z', 'attachments': <String>[]},
      ];
  return {
    'id': id,
    'reference': reference,
    'subject': subject,
    'status': status,
    // The API sends the messages as a JSON STRING.
    'messages': list is String ? list : jsonEncode(list),
    if (!legacy) 'category': category ?? 'delivery',
    if (!legacy) 'orderId': orderId,
    if (!legacy) 'userUnread': userUnread ?? 0,
    if (!legacy) 'staffUnread': 0,
    if (updatedAt != null) 'updatedAt': updatedAt,
  };
}

/// A scripted server: answers the socket events a test cares about and records every call.
class FakeServer {
  final List<(String, Map<String, dynamic>?)> calls = [];
  final Map<String, FutureOr<dynamic> Function(Map<String, dynamic>? body)> handlers = {};

  Iterable<Map<String, dynamic>?> bodiesOf(String event) => calls.where((c) => c.$1 == event).map((c) => c.$2);
  int countOf(String event) => calls.where((c) => c.$1 == event).length;

  void install() {
    RealtimeStore.instance.debugCallRequest = (event, [body]) async {
      calls.add((event, body));
      final h = handlers[event];
      if (h != null) return await h(body);
      return switch (event) {
        'chat:unread' => {'total': 0, 'buyer': 0, 'seller': 0},
        _ => const <dynamic>[],
      };
    };
  }
}

/// Fresh singletons for a social test: a signed-in customer, empty chat / support stores, default preferences.
Future<FakeServer> socialReset({String lang = 'en'}) async {
  await gapReset(lang: lang);
  ChatStore.instance.reset();
  SupportStore.instance.reset();
  final store = RealtimeStore.instance;
  store.prefs = {'push': true, 'email': true, 'sms': false, 'personalize': true, 'market': 'DRC'};
  store.orders.clear();
  store.debugTranslateRequest = null;
  UploadService.debugUpload = null;
  debugPhotoSource = null;
  final server = FakeServer()..install();
  return server;
}

void socialTearDown() {
  RealtimeStore.instance
    ..debugCallRequest = null
    ..debugTranslateRequest = null
    ..orders.clear();
  UploadService.debugUpload = null;
  debugPhotoSource = null;
  ChatStore.instance.reset();
  SupportStore.instance.reset();
  gapTearDown();
}

/// Photos the next "choose from library" returns, uploaded to `/uploads/<n>.jpg`.
void fakePhotos(int count) {
  var n = 0;
  UploadService.debugUpload = (bytes, filename) async => '/uploads/photo-${++n}.jpg';
  debugPhotoSource = (source, remaining) async => [for (var i = 0; i < count; i++) XFile.fromData(tinyPng, name: 'p$i.jpg')];
}

/// Attach photos through the composer's tray: attach icon, "Add photo", "Choose from library".
Future<void> attachPhotos(WidgetTester tester, {bool openTray = true}) async {
  if (openTray) {
    await tester.tap(find.byKey(const ValueKey('chat-attach')));
    await tester.pump();
  }
  await tester.tap(find.byKey(const ValueKey('photo-add')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const ValueKey('photo-library')));
  await tester.pumpAndSettle();
}

ApiException serverError(String message) => ApiException(message);

/// The text of the snackbar on screen (null when none).
String? snackText(WidgetTester tester) {
  final f = find.byType(SnackBar);
  if (f.evaluate().isEmpty) return null;
  final texts = find.descendant(of: f, matching: find.byType(Text));
  return tester.widgetList<Text>(texts).map((t) => t.data ?? '').join(' ');
}
