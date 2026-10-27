import 'dart:async';
import 'package:flutter/foundation.dart';
import '../data/catalog_models.dart';
import 'engage_models.dart';
import 'feature_hooks.dart';
import 'models.dart';
import 'realtime_store.dart';

/// A question pushed live (`question:created` / `question:updated`).
class QuestionEvent {
  const QuestionEvent(this.question, {required this.created});
  final QuestionDto question;
  final bool created;
}

/// Live state of the engagement features: running flash sales, stores on vacation, product Q&A pushes and the
/// campaign view/click counters. It is a [ChangeNotifier]: a screen listens to it next to [RealtimeStore].
///
/// Single source of truth for a store's vacation: the product payload carries `sellerOnVacation`, the
/// `store:vacation` push carries the change; both are stamped when received and [vacationOf] answers with the
/// NEWER of the two, so a push never gets undone by an older product copy, and a product update that arrives
/// after the push wins. Screens must read the vacation through [vacationOf] and never from the product alone.
class EngageStore extends ChangeNotifier {
  EngageStore._();
  static final EngageStore instance = EngageStore._();

  /// The clock for countdowns and flash-sale arithmetic (tests replace it).
  DateTime Function() now = DateTime.now;

  // ---- flash sales -------------------------------------------------------------------------------------
  final Map<String, FlashSaleDto> _sales = {};

  /// The sales running now, the ones ending soonest first.
  List<FlashSaleDto> get flashSales {
    final t = now();
    final list = _sales.values.where((s) => s.runningAt(t)).toList()
      ..sort((a, b) {
        final ea = a.endsAt, eb = b.endsAt;
        if (ea == null || eb == null) return ea == null && eb == null ? 0 : (ea == null ? 1 : -1);
        return ea.compareTo(eb);
      });
    return list;
  }

  /// The sale running on a product, if any.
  FlashSaleDto? flashFor(String productId) {
    final t = now();
    for (final s in _sales.values) {
      if (s.productId == productId && s.runningAt(t)) return s;
    }
    return null;
  }

  /// Loads the running sales (`flashsales:list`), replacing what was known.
  Future<void> loadFlashSales() async {
    final res = await RealtimeStore.instance.call('flashsales:list', const <String, dynamic>{});
    final t = now();
    _sales.clear();
    if (res is List) {
      for (final e in res) {
        final sale = _parseSale(e, t);
        if (sale != null && sale.runningAt(t)) _sales[sale.id] = sale;
      }
    }
    notifyListeners();
  }

  FlashSaleDto? _parseSale(Object? e, DateTime t) {
    if (e is! Map) return null;
    try {
      return FlashSaleDto.fromJson(e.map((k, v) => MapEntry(k.toString(), v)), t);
    } catch (_) {
      return null; // a malformed row must not blank the others
    }
  }

  void _onFlashUpdated(dynamic d) {
    final sale = _parseSale(d, now());
    if (sale == null) return;
    // Only a sale that is running now is shown; an update that ended or postponed it takes it away.
    if (sale.runningAt(now())) {
      _sales[sale.id] = sale;
    } else if (_sales.remove(sale.id) == null) {
      return;
    }
    notifyListeners();
  }

  void _onFlashRemoved(dynamic d) {
    if (d is! Map) return;
    final id = d['id'];
    final productId = d['productId'];
    var changed = false;
    if (id is String) {
      changed = _sales.remove(id) != null;
    } else if (productId is String) {
      final ids = _sales.values.where((s) => s.productId == productId).map((s) => s.id).toList();
      for (final i in ids) {
        _sales.remove(i);
        changed = true;
      }
    }
    if (changed) notifyListeners();
  }

  /// A countdown reached zero: the sale is over (the server's sweep will say so too, up to 30 s later).
  void expireSale(String id) {
    if (_sales.remove(id) != null) notifyListeners();
  }

  // ---- stores on vacation ------------------------------------------------------------------------------
  final Map<String, StoreVacation> _vacations = {};

  void _onVacation(dynamic d) {
    if (d is! Map) return;
    final v = StoreVacation.fromJson(d.map((k, v) => MapEntry(k.toString(), v)));
    if (v.sellerId.isEmpty) return;
    _vacations[v.sellerId] = v;
    notifyListeners();
  }

  /// Whether a store is away, from the freshest of [stamp] (the copy the caller holds: a product payload, a
  /// storefront fetch) and the last `store:vacation` push. Null when the store takes orders.
  VacationInfo? resolveVacation({
    String? sellerId,
    required bool onVacation,
    DateTime? until,
    Map<String, String>? notice,
    required int stamp,
  }) {
    final push = sellerId == null ? null : _vacations[sellerId];
    final bool on;
    DateTime? when = until;
    Map<String, String>? text = notice;
    if (push != null && push.stamp > stamp) {
      on = push.onVacation;
      when = push.until;
      text = push.notice;
    } else {
      on = onVacation;
    }
    if (!on) return null;
    // The return date passed and the server's sweep has not said so yet: the store is open again.
    if (when != null && !when.isAfter(now())) return null;
    return VacationInfo(until: when, notice: text);
  }

  /// The vacation a product's store is on, or null when it takes orders.
  VacationInfo? vacationOf(Product p) => resolveVacation(
        sellerId: p.sellerId,
        onVacation: p.sellerOnVacation,
        until: p.sellerVacationUntil,
        notice: p.sellerVacationNotice,
        stamp: p.stamp,
      );

  // ---- product Q&A ---------------------------------------------------------------------------------------
  /// The latest question pushed by the server; an open product page picks it up when it is about its product.
  final ValueNotifier<QuestionEvent?> questionEvents = ValueNotifier(null);

  void _onQuestion(dynamic d, {required bool created}) {
    if (d is! Map) return;
    try {
      questionEvents.value = QuestionEvent(QuestionDto.fromJson(d.map((k, v) => MapEntry(k.toString(), v))), created: created);
    } catch (_) {/* a malformed push is ignored */}
  }

  /// Sends a question (`questions:ask`). Returns it as the server stored it; throws the server's message.
  Future<QuestionDto?> askQuestion(String productId, String question) async {
    final res = await RealtimeStore.instance.call('questions:ask', {'productId': productId, 'question': question});
    return res is Map && res['id'] is String ? QuestionDto.fromJson(res.map((k, v) => MapEntry(k.toString(), v))) : null;
  }

  // ---- campaign tracking -------------------------------------------------------------------------------------
  final Set<String> _tracked = {};

  /// How many `campaigns:track` calls went out this session (tests).
  @visibleForTesting
  int trackCalls = 0;

  /// A promoted product was shown: counted once per product per session. Silent when it fails.
  void trackView(Product p) => _track(p, 'view');

  /// A promoted product was opened: counted once per product per session. Silent when it fails.
  void trackClick(Product p) => _track(p, 'click');

  void _track(Product p, String kind) {
    final campaign = p.campaignId;
    if (campaign == null || campaign.isEmpty) return;
    if (!_tracked.add('$kind|${p.uuid}')) return;
    trackCalls++;
    // Fire and forget: the shopper must never see a counting error, and a lost count is not worth a retry.
    unawaited(RealtimeStore.instance.call('campaigns:track', {'campaignId': campaign, 'kind': kind}).then<void>((_) {}).catchError((Object _) {}));
  }

  // ---- plumbing ----------------------------------------------------------------------------------------------
  /// Forgets everything that belongs to the account (sign-out).
  void reset() {
    _sales.clear();
    _vacations.clear();
    _tracked.clear();
    trackCalls = 0;
    questionEvents.value = null;
    notifyListeners();
  }

  late final FeatureHook hook = FeatureHook(
    name: 'engage',
    pushes: {
      'flashsale:updated': _onFlashUpdated,
      'flashsale:removed': _onFlashRemoved,
      'store:vacation': _onVacation,
      'question:created': (d) => _onQuestion(d, created: true),
      'question:updated': (d) => _onQuestion(d, created: false),
    },
    hydrate: (_) => loadFlashSales(),
    reset: reset,
  );
}
