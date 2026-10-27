// Server-shaped payloads for the rider tests: `rider:tasks` rows for every leg kind (docs/contracts/logistics.md
// sections 6 and 7), tickets (after-sale.md section 6), and the fakes the support screens run against.
import 'dart:convert';

import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/support_models.dart';
import 'package:somba_rider/services/support_store.dart';

const kCustomerAddress = '{"line1":"12, avenue du Commerce","line2":"près du marché central","commune":"Gombe","city":"Kinshasa","phone":"+243812345678","geo":{"lat":-4.3101,"lng":15.3125}}';

Map<String, dynamic> hubEp(String id, String name, String address, {double lat = -4.35, double lng = 15.34}) =>
    {'type': 'hub', 'id': id, 'name': name, 'address': address, 'lat': lat, 'lng': lng, 'city': 'Kinshasa'};

final _originHub = hubEp('h1', 'Entrepôt de Limete', 'Avenue des Poids Lourds 45, Limete');
final _destHub = hubEp('h2', 'Entrepôt de Gombe', 'Boulevard du 30 Juin 8, Gombe', lat: -4.3105, lng: 15.3136);
final sellerEp = {'type': 'seller', 'id': 's1', 'name': 'Boutique Les Merveilles de Kinshasa', 'address': '27, avenue Kasa-Vubu, Bandalungwa', 'lat': -4.33, 'lng': 15.29};
final customerEp = {'type': 'customer', 'id': 'c1', 'name': 'Aline Kabila Mwamba', 'address': '12, avenue du Commerce, près du marché central, Gombe, Kinshasa', 'lat': -4.3101, 'lng': 15.3125, 'city': 'Kinshasa', 'phone': '+243812345678'};

/// A `rider:tasks` row. [withOrder] false gives a `task:updated` push (a bare TaskView).
Map<String, dynamic> legJson(
  String kind, {
  String? id,
  String status = 'assigned',
  double cod = 0,
  String? failure,
  int attempts = 1,
  bool withOrder = true,
  String riderId = 'r',
  bool legacy = false, // an old payload: no kind, no endpoints
}) {
  final tid = id ?? 't-$kind-$status';
  final (from, to, fromHub, toHub, fromHubId, toHubId) = switch (kind) {
    'pickup' => (sellerEp, _originHub, null, _originHub, null, 'h1'),
    'transfer' => (_originHub, _destHub, _originHub, _destHub, 'h1', 'h2'),
    'return_pickup' => (customerEp, _destHub, null, _destHub, null, 'h2'),
    'return_transfer' => (_destHub, _originHub, _destHub, _originHub, 'h2', 'h1'),
    'return_to_seller' => (_originHub, sellerEp, _originHub, null, 'h1', null),
    _ => (_destHub, customerEp, _destHub, null, 'h2', null), // delivery, replacement_delivery
  };
  final meetsCustomer = kind == 'delivery' || kind == 'replacement_delivery' || kind == 'return_pickup';
  final json = <String, dynamic>{
    'id': tid,
    'orderId': 'o-$tid',
    'orderReference': 'SOM-1042',
    'status': status,
    'riderId': riderId,
    'hubId': 'h2',
    'codAmountUsd': cod,
    'address': meetsCustomer ? kCustomerAddress : (toHub?['address'] ?? 'Entrepôt'),
    'pickupAddress': kind == 'pickup' ? 'Boutique Les Merveilles de Kinshasa — 27, avenue Kasa-Vubu' : 'Entrepôt de Gombe, Boulevard du 30 Juin 8',
    'attempts': attempts,
    'failureReason': failure,
    'readyAt': kind == 'pickup' ? '2026-10-24T08:00:00.000Z' : null,
    'receivedAt': null,
    'createdAt': '2026-10-24T08:00:00.000Z',
    if (!legacy) ...{
      'kind': kind,
      'fromHubId': fromHubId,
      'toHubId': toHubId,
      'sellerId': kind == 'pickup' || kind == 'return_to_seller' ? 's1' : null,
      'sellerName': kind == 'pickup' || kind == 'return_to_seller' ? 'Boutique Les Merveilles de Kinshasa' : null,
      'parentTaskId': null,
      'disputeId': kind.startsWith('return') ? 'd1' : null,
      'replacementId': kind == 'replacement_delivery' ? 'rp1' : null,
      'exchangeId': null,
      'from': from,
      'to': to,
      'fromHub': fromHub,
      'toHub': toHub,
      'items': [
        {'orderItemId': 'i1', 'productId': 'p1', 'name': 'Chaussures de course Air Comfort Pro', 'qty': 2},
        {'orderItemId': 'i2', 'productId': 'p2', 'name': 'Écouteurs sans fil', 'qty': 1},
      ],
      'collectOld': kind == 'replacement_delivery',
      'needsCode': kind == 'delivery',
      'orderFlow': !kind.startsWith('return') && kind != 'replacement_delivery',
    },
  };
  if (withOrder) {
    json['order'] = {
      'reference': 'SOM-1042',
      'customerName': meetsCustomer ? 'Aline Kabila Mwamba' : 'Aline',
      'paymentMethod': cod > 0 ? 'cod' : 'stripe_card',
      'estimatedDeliveryDate': '2026-10-28',
      'totalUsd': 87.5,
      'shippingAddress': meetsCustomer ? kCustomerAddress : null,
      'items': [
        {'productName': 'Chaussures de course Air Comfort Pro', 'qty': 2},
        {'productName': 'Écouteurs sans fil', 'qty': 1},
      ],
    };
  }
  return json;
}

DeliveryTaskDto leg(String kind, {String? id, String status = 'assigned', double cod = 0, String? failure, int attempts = 1, bool legacy = false}) =>
    DeliveryTaskDto.fromJson(legJson(kind, id: id, status: status, cod: cod, failure: failure, attempts: attempts, legacy: legacy));

Map<String, dynamic> ticketJson(
  String id, {
  String status = 'open',
  int unread = 0,
  String subject = 'Le client est injoignable depuis ce matin',
  String? orderId,
  List<Map<String, dynamic>>? messages,
  String category = 'delivery',
  bool messagesAsList = false,
}) {
  final msgs = messages ??
      [
        {'id': 'm1', 'from': 'Jean-Pierre Mukendi', 'fromId': 'r', 'role': 'rider', 'text': 'Bonjour, le client ne répond pas au téléphone.', 'at': '2026-10-25T09:00:00.000Z', 'attachments': <String>[]},
        {'id': 'm2', 'from': 'Marie Support', 'fromId': 'a1', 'role': 'admin_support', 'text': 'Merci, nous le contactons.', 'at': '2026-10-25T09:10:00.000Z', 'attachments': ['http://localhost:3001/uploads/11111111-1111-1111-1111-111111111111.jpg']},
      ];
  return {
    'id': id,
    'reference': 'TKT-${id.padLeft(8, '0')}',
    'userId': 'r',
    'userName': 'Jean-Pierre Mukendi',
    'role': 'rider',
    'subject': subject,
    'category': category,
    'orderId': orderId,
    'status': status,
    'assigneeId': null,
    'assigneeName': null,
    'userUnread': unread,
    'staffUnread': 0,
    'messages': messagesAsList ? msgs : jsonEncode(msgs),
    'createdAt': '2026-10-25T09:00:00.000Z',
    'updatedAt': '2026-10-25T09:10:00.000Z',
  };
}

SupportTicket ticket(String id,
        {String status = 'open', int unread = 0, String? orderId, String subject = 'Le client est injoignable depuis ce matin', List<Map<String, dynamic>>? messages}) =>
    SupportTicket.fromJson(ticketJson(id, status: status, unread: unread, orderId: orderId, subject: subject, messages: messages));

/// A support API that works on an in-memory list and records its calls.
class FakeSupportApi implements SupportApi {
  FakeSupportApi([List<SupportTicket>? tickets]) : tickets = tickets ?? [];
  final List<SupportTicket> tickets;
  final calls = <String>[];
  Object? failWith;
  int _n = 100;

  void _maybeFail() {
    final f = failWith;
    if (f != null) throw f;
  }

  @override
  Future<List<SupportTicket>> list() async {
    calls.add('list');
    _maybeFail();
    return List.of(tickets);
  }

  @override
  Future<SupportTicket> get(String id) async {
    calls.add('get:$id');
    _maybeFail();
    return tickets.firstWhere((t) => t.id == id);
  }

  @override
  Future<SupportTicket> open({required String subject, required String message, String? category, String? orderId, List<String> attachments = const []}) async {
    calls.add('open:$subject|$message|$category|$orderId|${attachments.join(',')}');
    _maybeFail();
    final t = SupportTicket.fromJson(ticketJson('${_n++}', subject: subject, category: category ?? 'general', orderId: orderId, messages: [
      {'id': 'x', 'from': 'Jean-Pierre Mukendi', 'fromId': 'r', 'role': 'rider', 'text': message, 'at': '2026-10-25T10:00:00.000Z', 'attachments': attachments}
    ]));
    tickets.insert(0, t);
    return t;
  }

  @override
  Future<SupportTicket> reply(String id, {String? text, List<String> attachments = const []}) async {
    calls.add('reply:$id|${text ?? ''}|${attachments.join(',')}');
    _maybeFail();
    final i = tickets.indexWhere((t) => t.id == id);
    final old = tickets[i];
    final msgs = [
      ...old.messages.map((m) => {'id': m.id, 'from': m.from, 'fromId': m.fromId, 'role': m.role, 'text': m.text, 'at': m.at?.toIso8601String(), 'attachments': m.attachments}),
      {'id': 'n${_n++}', 'from': 'Jean-Pierre Mukendi', 'fromId': 'r', 'role': 'rider', 'text': text ?? '', 'at': '2026-10-25T11:00:00.000Z', 'attachments': attachments},
    ];
    final t = SupportTicket.fromJson(ticketJson(id, status: 'open', messages: msgs, subject: old.subject));
    tickets[i] = t;
    return t;
  }

  @override
  Future<SupportTicket> markRead(String id) async {
    calls.add('markRead:$id');
    _maybeFail();
    final i = tickets.indexWhere((t) => t.id == id);
    tickets[i] = tickets[i].withUnread(0);
    return tickets[i];
  }
}

class FakePicker implements PhotoPicker {
  FakePicker([this.result = const []]);
  List<PickedPhoto> result;
  Object? failWith;
  final asked = <String>[];

  @override
  Future<List<PickedPhoto>> pick({required bool camera, required int limit}) async {
    asked.add('${camera ? 'camera' : 'gallery'}:$limit');
    final f = failWith;
    if (f != null) throw f;
    return result;
  }
}

class FakeUploader implements PhotoUploader {
  final uploaded = <String>[];
  Object? failWith;

  @override
  Future<String> upload(PickedPhoto photo) async {
    final f = failWith;
    if (f != null) throw f;
    uploaded.add(photo.path);
    return 'http://localhost:3001/uploads/22222222-2222-2222-2222-22222222222${uploaded.length}.jpg';
  }
}

/// Puts the support store on fakes; returns them.
({FakeSupportApi api, FakePicker picker, FakeUploader uploader}) fakeSupport({List<SupportTicket>? tickets, bool loaded = true}) {
  final s = SupportStore.instance;
  final api = FakeSupportApi(tickets);
  final picker = FakePicker();
  final uploader = FakeUploader();
  s.api = api;
  s.picker = picker;
  s.uploader = uploader;
  s.tickets
    ..clear()
    ..addAll(api.tickets);
  s.loaded = loaded;
  s.loading = false;
  s.loadError = null;
  return (api: api, picker: picker, uploader: uploader);
}

void resetSupport() {
  final s = SupportStore.instance;
  s.tickets.clear();
  s.loaded = false;
  s.loading = false;
  s.loadError = null;
  s.api = SocketSupportApi();
  s.picker = ImagePickerPhotoPicker();
  s.uploader = HttpPhotoUploader();
}

// ---- transfer runs (docs/contracts/areas.md, "Multi-warehouse transfers") ----

/// A `rider:runs` row.
Map<String, dynamic> runJson(
  String id, {
  String status = 'dispatched',
  String riderId = 'r',
  String riderName = 'Jean-Pierre Mukendi',
  int count = 18,
  int received = 0,
  int missing = 0,
  List<String>? taskIds,
  String from = 'Entrepôt Kinshasa',
  String to = 'Entrepôt Limete',
  Map<String, dynamic> extra = const {},
}) =>
    {
      'id': id,
      'reference': 'TR-${id.toUpperCase().padLeft(4, '0')}',
      'fromHubId': 'h-kin',
      'fromHubName': from,
      'toHubId': 'h-lim',
      'toHubName': to,
      'riderId': riderId,
      'riderName': riderName,
      'status': status,
      'taskIds': taskIds ?? <String>[],
      'count': count,
      'receivedCount': received,
      'missingCount': missing,
      'createdAt': '2026-10-26T07:00:00.000Z',
      ...extra,
    };

/// A transfer leg that travels in run [runId].
Map<String, dynamic> parcelJson(String id, String runId, {String status = 'picked_up', int? hop, int? hops, String reference = 'SOM-1042'}) => {
      ...legJson('transfer', id: id, status: status),
      'orderReference': reference,
      'runId': runId,
      'runReference': 'TR-${runId.toUpperCase().padLeft(4, '0')}',
      if (hop != null) 'hop': hop,
      if (hops != null) 'hops': hops,
    };
