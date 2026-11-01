import 'package:flutter/foundation.dart';
import 'aftersale_models.dart';
import 'feature_hooks.dart';
import 'realtime_store.dart';

/// Live state of the customer's returns, disputes, replacements and exchanges.
///
/// The three lists come from `disputes:list`, `replacements:mine` and `exchanges:mine` (loaded after sign-in and
/// whenever a screen asks), and the pushes `dispute:created|updated|message`, `replacement:updated` and
/// `exchange:updated` keep them current while a screen is open. Open detail screens listen to this notifier.
class AfterSaleStore extends ChangeNotifier {
  AfterSaleStore._();
  static final AfterSaleStore instance = AfterSaleStore._();

  /// Newest first.
  final List<DisputeView> disputes = [];
  final List<ReplacementView> replacements = [];
  final List<ExchangeView> exchanges = [];

  /// Fetched details (with their thread), by request id.
  final Map<String, DisputeView> _details = {};

  bool disputesLoaded = false;
  bool replacementsLoaded = false;
  bool exchangesLoaded = false;

  Future<dynamic> _call(String event, [Map<String, dynamic>? body]) => RealtimeStore.instance.call(event, body);

  /// The module's entry for [buildFeatureHooks].
  FeatureHook get hook => FeatureHook(
        name: 'aftersale',
        pushes: {
          'dispute:created': onDisputePush,
          'dispute:updated': onDisputePush,
          'dispute:message': onDisputeMessage,
          'replacement:updated': onReplacementPush,
          'exchange:updated': onExchangePush,
        },
        hydrate: (_) => loadAll(),
        reset: reset,
      );

  /// Open requests of every kind (a badge).
  int get openCount => disputes.where((d) => d.isOpen).length + replacements.where((r) => r.isOpen).length + exchanges.where((e) => e.isOpen).length;

  /// The best copy we have of a request: the fetched detail (with its thread), else the list row.
  DisputeView? disputeById(String id) => _details[id] ?? _firstWhereOrNull(disputes, (d) => d.id == id);
  ReplacementView? replacementById(String id) => _firstWhereOrNull(replacements, (r) => r.id == id);
  ExchangeView? exchangeById(String id) => _firstWhereOrNull(exchanges, (e) => e.id == id);

  void reset() {
    disputes.clear();
    replacements.clear();
    exchanges.clear();
    _details.clear();
    disputesLoaded = replacementsLoaded = exchangesLoaded = false;
    notifyListeners();
  }

  // ---- loading ----

  Future<void> loadAll() async {
    await Future.wait([
      loadDisputes().catchError((Object _) {}),
      loadReplacements().catchError((Object _) {}),
      loadExchanges().catchError((Object _) {}),
    ]);
  }

  Future<void> loadDisputes() async {
    final rows = await _call('disputes:list', {'limit': 100});
    final fresh = [for (final e in (rows as List)) if (e is Map) DisputeView.fromJson(asStringMap(e))];
    // A detail already fetched keeps its thread when the list row replaces it.
    disputes
      ..clear()
      ..addAll(fresh.map((d) => d.keepingMessagesOf(_details[d.id])));
    for (final d in disputes) {
      if (_details.containsKey(d.id)) _details[d.id] = d;
    }
    _sortDisputes();
    disputesLoaded = true;
    notifyListeners();
  }

  Future<void> loadReplacements() async {
    final rows = await _call('replacements:mine', {'limit': 100});
    replacements
      ..clear()
      ..addAll([for (final e in (rows as List)) if (e is Map) ReplacementView.fromJson(asStringMap(e))]);
    _sortByNewest(replacements, (r) => r.createdAt);
    replacementsLoaded = true;
    notifyListeners();
  }

  Future<void> loadExchanges() async {
    final rows = await _call('exchanges:mine', {'limit': 100});
    exchanges
      ..clear()
      ..addAll([for (final e in (rows as List)) if (e is Map) ExchangeView.fromJson(asStringMap(e))]);
    _sortByNewest(exchanges, (r) => r.createdAt);
    exchangesLoaded = true;
    notifyListeners();
  }

  /// One request with its thread (`disputes:get`).
  Future<DisputeView> fetchDispute(String id) async {
    final d = DisputeView.fromJson(asStringMap(await _call('disputes:get', {'id': id})));
    _remember(d);
    return d;
  }

  Future<ReplacementView> fetchReplacement(String id) async {
    final r = ReplacementView.fromJson(asStringMap(await _call('replacements:get', {'id': id})));
    _upsert(replacements, r, (x) => x.id, (x) => x.updatedAt, (x) => x.createdAt);
    notifyListeners();
    return r;
  }

  Future<ExchangeView> fetchExchange(String id) async {
    final x = ExchangeView.fromJson(asStringMap(await _call('exchanges:get', {'id': id})));
    _upsert(exchanges, x, (e) => e.id, (e) => e.updatedAt, (e) => e.createdAt);
    notifyListeners();
    return x;
  }

  /// Like the fetches above, but null when the request can't be loaded (a notice then opens the list instead).
  Future<DisputeView?> tryFetchDispute(String id) async {
    try {
      return await fetchDispute(id);
    } catch (_) {
      return null;
    }
  }

  Future<ReplacementView?> tryFetchReplacement(String id) async {
    try {
      return await fetchReplacement(id);
    } catch (_) {
      return null;
    }
  }

  Future<ExchangeView?> tryFetchExchange(String id) async {
    try {
      return await fetchExchange(id);
    } catch (_) {
      return null;
    }
  }

  // ---- actions ----

  Future<ReturnEligibility> eligibility(String orderId) async =>
      ReturnEligibility.fromJson(asStringMap(await _call('disputes:eligibility', {'orderId': orderId})));

  /// `disputes:open`: the request, plus its siblings when a return spanned several stores.
  Future<DisputeOpened> open({
    required String orderId,
    required String type,
    required String reason,
    String? category,
    List<Map<String, dynamic>> items = const [],
    List<String> attachments = const [],
    String? refundTo,
  }) async {
    final res = asStringMap(await _call('disputes:open', {
      'orderId': orderId,
      'type': type,
      'reason': reason,
      if (category != null) 'category': category,
      if (items.isNotEmpty) 'items': items,
      if (attachments.isNotEmpty) 'attachments': attachments,
      if (refundTo != null) 'refundTo': refundTo,
    }));
    final d = DisputeView.fromJson(res);
    final siblings = res['siblings'] is List ? [for (final e in res['siblings'] as List) '$e'] : <String>[];
    _remember(d);
    return DisputeOpened(d, siblings);
  }

  Future<DisputeMessageView> reply(String id, String message, {List<String> attachments = const []}) async {
    final m = DisputeMessageView.fromJson(asStringMap(await _call('disputes:reply', {
      'id': id,
      'message': message,
      if (attachments.isNotEmpty) 'attachments': attachments,
    })));
    _appendMessage(id, m);
    return m;
  }

  Future<DisputeView> escalate(String id, {String? note}) async {
    final d = DisputeView.fromJson(asStringMap(await _call('disputes:escalate', {
      'id': id,
      if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
    })));
    _remember(d);
    return d;
  }

  Future<DisputeView> cancel(String id) async {
    final d = DisputeView.fromJson(asStringMap(await _call('disputes:cancel', {'id': id})));
    _remember(d);
    return d;
  }

  Future<ReplacementView> createReplacement({
    required String orderId,
    required String sku,
    required String productName,
    required String reason,
    String? condition,
    int qty = 1,
    List<String> attachments = const [],
  }) async {
    final r = ReplacementView.fromJson(asStringMap(await _call('replacements:create', {
      'orderId': orderId,
      'sku': sku,
      'productName': productName,
      'reason': reason,
      if (condition != null) 'condition': condition,
      'qty': qty,
      if (attachments.isNotEmpty) 'attachments': attachments,
    })));
    _upsert(replacements, r, (x) => x.id, (x) => x.updatedAt, (x) => x.createdAt);
    notifyListeners();
    return r;
  }

  Future<ExchangeView> createExchange({
    required String orderId,
    required String fromSku,
    required String fromName,
    required String toSku,
    required String toName,
    String? toVariant,
    int qty = 1,
    required String reason,
  }) async {
    final x = ExchangeView.fromJson(asStringMap(await _call('exchanges:create', {
      'orderId': orderId,
      'fromSku': fromSku,
      'fromName': fromName,
      'toSku': toSku,
      'toName': toName,
      if (toVariant != null) 'toVariant': toVariant,
      'qty': qty,
      'reason': reason,
    })));
    _upsert(exchanges, x, (e) => e.id, (e) => e.updatedAt, (e) => e.createdAt);
    notifyListeners();
    return x;
  }

  // ---- pushes ----

  @visibleForTesting
  void onDisputePush(dynamic data) {
    if (data is! Map) return;
    final d = DisputeView.fromJson(asStringMap(data));
    if (d.id.isEmpty) return;
    _remember(d);
  }

  /// `dispute:message {disputeId, message}`: also arrives for the author's own reply (other devices, and this one).
  @visibleForTesting
  void onDisputeMessage(dynamic data) {
    if (data is! Map) return;
    final m = asStringMap(data);
    final id = '${m['disputeId'] ?? ''}';
    if (id.isEmpty || m['message'] is! Map) return;
    _appendMessage(id, DisputeMessageView.fromJson(asStringMap(m['message'])));
  }

  @visibleForTesting
  void onReplacementPush(dynamic data) {
    if (data is! Map) return;
    final r = ReplacementView.fromJson(asStringMap(data));
    if (r.id.isEmpty) return;
    _upsert(replacements, r, (x) => x.id, (x) => x.updatedAt, (x) => x.createdAt);
    notifyListeners();
  }

  @visibleForTesting
  void onExchangePush(dynamic data) {
    if (data is! Map) return;
    final x = ExchangeView.fromJson(asStringMap(data));
    if (x.id.isEmpty) return;
    _upsert(exchanges, x, (e) => e.id, (e) => e.updatedAt, (e) => e.createdAt);
    notifyListeners();
  }

  // ---- internals ----

  /// Stores [d] in the list and in the detail cache, never replacing a newer copy with an older one.
  void _remember(DisputeView d) {
    final known = _details[d.id] ?? _firstWhereOrNull(disputes, (x) => x.id == d.id);
    if (known != null && _isOlder(d.updatedAt, known.updatedAt)) return;
    final merged = d.keepingMessagesOf(known);
    final i = disputes.indexWhere((x) => x.id == d.id);
    if (i >= 0) {
      disputes[i] = merged;
    } else {
      disputes.add(merged);
    }
    if (_details.containsKey(d.id) || merged.messages != null) _details[d.id] = merged;
    _sortDisputes();
    notifyListeners();
  }

  void _appendMessage(String disputeId, DisputeMessageView m) {
    final cur = _details[disputeId] ?? _firstWhereOrNull(disputes, (x) => x.id == disputeId);
    if (cur == null || cur.messages == null) return; // not opened on this device: the screen fetches the thread itself
    if (m.id.isNotEmpty && cur.messages!.any((x) => x.id == m.id)) return;
    final next = cur.copyWith(messages: [...cur.messages!, m], messageCount: cur.messageCount + 1);
    _details[disputeId] = next;
    final i = disputes.indexWhere((x) => x.id == disputeId);
    if (i >= 0) disputes[i] = next;
    notifyListeners();
  }

  void _sortDisputes() => _sortByNewest(disputes, (d) => d.createdAt);

  static bool _isOlder(DateTime? incoming, DateTime? known) => incoming != null && known != null && incoming.isBefore(known);

  static void _sortByNewest<T>(List<T> list, DateTime? Function(T) at) {
    final epoch = DateTime.fromMillisecondsSinceEpoch(0);
    list.sort((a, b) => (at(b) ?? epoch).compareTo(at(a) ?? epoch));
  }

  static void _upsert<T>(List<T> list, T item, String Function(T) id, DateTime? Function(T) updatedAt, DateTime? Function(T) createdAt) {
    final i = list.indexWhere((x) => id(x) == id(item));
    if (i >= 0) {
      if (_isOlder(updatedAt(item), updatedAt(list[i]))) return;
      list[i] = item;
    } else {
      list.add(item);
    }
    _sortByNewest(list, createdAt);
  }

  static T? _firstWhereOrNull<T>(Iterable<T> items, bool Function(T) test) {
    for (final e in items) {
      if (test(e)) return e;
    }
    return null;
  }
}
