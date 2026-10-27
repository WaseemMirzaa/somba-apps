import 'package:flutter/material.dart';
import '../../data/catalog_live.dart';
import '../../l10n/strings.dart';
import '../../services/aftersale_models.dart';
import '../../services/aftersale_store.dart';
import '../../theme/app_theme.dart';
import '../../widgets/feedback.dart';
import '../../widgets/kit.dart';
import 'aftersale_widgets.dart';
import 'chat_entry.dart';

/// Badge text for a replacement or exchange status (`received`, `allocated` and `ready` are warehouse steps: "being prepared").
String transferStatusLabel(Strings s, String status) => switch (status) {
      'approved' => s.asRsApproved,
      'received' || 'allocated' || 'ready' => s.asRsPreparing,
      'dispatched' => s.asRsDispatched,
      'delivered' => s.asRsDelivered,
      'rejected' => s.asRsRejected,
      _ => s.asRsRequested,
    };

({Color color, Color text}) replacementColors(String status) => switch (status) {
      'delivered' => (color: AppColors.success, text: AppColors.success),
      'rejected' => (color: AppColors.danger, text: AppColors.dangerStrong),
      'approved' || 'received' || 'allocated' || 'ready' || 'dispatched' => (color: AppColors.primary, text: AppColors.primaryDark),
      _ => (color: AppColors.amber, text: kAmberText),
    };

/// An option text ("Size: 42") in the user's language, from the live catalogue labels when the product is listed.
String optionText(Strings s, String sku, String? canonical) {
  final c = canonical ?? '';
  if (c.isEmpty || c == 'Default') return '';
  return productByUuid(sku)?.displayVariant(c, s.lang) ?? c;
}

/// "Size: 40 → Size: 42" for an exchange row (the product names when there are no options).
String exchangeSummary(Strings s, ExchangeView x) {
  final from = optionText(s, x.fromSku, x.fromVariant);
  final to = optionText(s, x.toSku, x.toVariant);
  if (from.isNotEmpty || to.isNotEmpty) {
    final name = x.displayFromName(s.lang);
    return '${x.qty} × $name · ${s.asExChange(from.isEmpty ? x.displayFromName(s.lang) : from, to.isEmpty ? x.displayToName(s.lang) : to)}';
  }
  return '${x.qty} × ${s.asExChange(x.displayFromName(s.lang), x.displayToName(s.lang))}';
}

/// What the money of an exchange did, or will do (null when nothing is worth saying).
String exchangeMoneyText(Strings s, ExchangeView x) {
  final d = x.priceDiffUsd;
  if (d > 0) {
    if (x.heldUsd <= 0) return s.asExDiffUnknown;
    return x.isRejected ? s.asExReturned(exactMoney(s, x.heldUsd)) : s.asExPaid(exactMoney(s, x.heldUsd));
  }
  if (d < 0) {
    if (x.isRejected) return s.asExDiffNone;
    return x.status == 'delivered' ? s.asExRefunded(exactMoney(s, -d)) : s.asExWillRefund(exactMoney(s, -d));
  }
  return s.asExDiffNone;
}

/// The progress of a replacement or exchange: requested, approved, on its way, delivered (or declined).
List<(String, String, bool)> transferSteps(
  Strings s, {
  required String status,
  required DateTime? createdAt,
  required DateTime? sellerDueAt,
  required DateTime? deliveredAt,
  required String? deliveryTaskId,
  required String? sellerReason,
}) {
  final approved = const {'approved', 'received', 'allocated', 'ready', 'dispatched', 'delivered'}.contains(status);
  final dispatched = status == 'dispatched' || status == 'delivered';
  final delivered = status == 'delivered';
  final requestedSub = status == 'requested' && sellerDueAt != null
      ? s.asRpDue(s.when(sellerDueAt))
      : (createdAt != null ? s.when(createdAt) : '');
  if (status == 'rejected') {
    return [
      (s.asRpRequested, createdAt != null ? s.when(createdAt) : '', true),
      (s.asRpRejected, (sellerReason ?? '').isNotEmpty ? s.asRpReason(sellerReason) : '', true),
    ];
  }
  return [
    (s.asRpRequested, requestedSub, true),
    (s.asRpApproved, approved && !dispatched ? s.asRpApprovedSub : '', approved),
    (s.asRpDispatched, deliveryTaskId != null && !delivered ? s.asRpRider : '', dispatched),
    (s.asRpDelivered, delivered && deliveredAt != null ? s.when(deliveredAt) : '', delivered),
  ];
}

({String title, String body, IconData icon}) _bannerText(Strings s, String status, {String? reason, DateTime? due}) => switch (status) {
      'rejected' => (title: s.asRsRejected, body: (reason ?? '').isNotEmpty ? s.asRpReason(reason) : s.asRpRejected, icon: Icons.cancel_rounded),
      'delivered' => (title: s.asRsDelivered, body: '', icon: Icons.check_circle_rounded),
      'dispatched' => (title: s.asRsDispatched, body: s.asRpRider, icon: Icons.local_shipping_outlined),
      'approved' || 'received' || 'allocated' || 'ready' => (title: transferStatusLabel(s, status), body: s.asRpApprovedSub, icon: Icons.check_circle_outline_rounded),
      _ => (title: s.asStAwaitingTitle, body: due != null ? s.asRpDue(s.when(due)) : '', icon: Icons.hourglass_top_rounded),
    };

Widget _statusBanner(({String title, String body, IconData icon}) t, ({Color color, Color text}) c) => Container(
      key: const ValueKey('transfer-banner'),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: c.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(t.icon, color: c.text, size: 28),
        const SizedBox(width: AppSpace.md),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(t.title, key: const ValueKey('transfer-status'), style: TextStyle(color: c.text, fontWeight: FontWeight.w800, fontSize: 16)),
            if (t.body.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(t.body, key: const ValueKey('transfer-body'), style: const TextStyle(color: AppColors.inkSoft, fontSize: 13, height: 1.35)),
            ],
          ]),
        ),
      ]),
    );

/// One replacement: its progress from "requested" to "delivered", live.
class ReplacementDetailScreen extends StatefulWidget {
  const ReplacementDetailScreen({super.key, this.locale = const Locale('en'), this.replacement, this.requestId})
      : assert(replacement != null || requestId != null, 'give the replacement or its id');
  final Locale locale;
  final ReplacementView? replacement;
  final String? requestId;

  @override
  State<ReplacementDetailScreen> createState() => _ReplacementDetailScreenState();
}

class _ReplacementDetailScreenState extends State<ReplacementDetailScreen> {
  final _store = AfterSaleStore.instance;
  Object? _error;

  String get _id => widget.replacement?.id ?? widget.requestId!;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_error != null) setState(() => _error = null);
    try {
      await _store.fetchReplacement(_id);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e);
      if (_store.replacementById(_id) != null || widget.replacement != null) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return ListenableBuilder(
      listenable: _store,
      builder: (context, _) {
        final r = _store.replacementById(_id) ?? widget.replacement;
        if (r == null) {
          return Scaffold(
            appBar: backAppBar(context, s.asTabReplacements),
            body: _error != null ? AfterSaleError(error: _error!, onRetry: _load) : const Center(child: CircularProgressIndicator()),
          );
        }
        final c = replacementColors(r.status);
        return Scaffold(
          appBar: backAppBar(context, r.reference.isEmpty ? s.asTabReplacements : r.reference),
          body: RefreshIndicator(
            onRefresh: _load,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                _statusBanner(_bannerText(s, r.status, reason: r.sellerReason, due: r.sellerDueAt), c),
                const SizedBox(height: AppSpace.lg),
                Panel(
                  key: const ValueKey('transfer-progress'),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    SectionTitle(s.asRpProgress),
                    StatusTimeline(transferSteps(s,
                        status: r.status, createdAt: r.createdAt, sellerDueAt: r.sellerDueAt, deliveredAt: r.deliveredAt, deliveryTaskId: r.deliveryTaskId, sellerReason: r.sellerReason)),
                  ]),
                ),
                const SizedBox(height: AppSpace.lg),
                Panel(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    KeyValueRow(s.kvOrder, r.orderReference),
                    const SizedBox(height: AppSpace.sm),
                    KeyValueRow(s.asRpItem, '${r.qty} × ${r.displayName(s.lang)}'),
                    if (optionText(s, r.sku, r.variant).isNotEmpty) ...[
                      const SizedBox(height: AppSpace.sm),
                      KeyValueRow(s.asRpOption, optionText(s, r.sku, r.variant)),
                    ],
                    if (r.createdAt != null) ...[
                      const SizedBox(height: AppSpace.sm),
                      KeyValueRow(s.asKvOpened, s.date(r.createdAt!)),
                    ],
                    if (r.reason.isNotEmpty) ...[
                      const Divider(height: 22),
                      Text(s.yourMessage, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                      const SizedBox(height: 4),
                      Text(r.reason, key: const ValueKey('transfer-reason'), style: const TextStyle(fontSize: 13.5, height: 1.4)),
                    ],
                    if (r.attachments.isNotEmpty) ...[
                      const SizedBox(height: AppSpace.md),
                      RemotePhotos(urls: r.attachments),
                    ],
                  ]),
                ),
                if (r.sellerId != null) ...[
                  const SizedBox(height: AppSpace.sm),
                  MessageSellerButton(sellerId: r.sellerId!, orderId: r.orderId, locale: widget.locale),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

/// One exchange: the change, the price difference and where it stands, live.
class ExchangeDetailScreen extends StatefulWidget {
  const ExchangeDetailScreen({super.key, this.locale = const Locale('en'), this.exchange, this.requestId})
      : assert(exchange != null || requestId != null, 'give the exchange or its id');
  final Locale locale;
  final ExchangeView? exchange;
  final String? requestId;

  @override
  State<ExchangeDetailScreen> createState() => _ExchangeDetailScreenState();
}

class _ExchangeDetailScreenState extends State<ExchangeDetailScreen> {
  final _store = AfterSaleStore.instance;
  Object? _error;

  String get _id => widget.exchange?.id ?? widget.requestId!;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_error != null) setState(() => _error = null);
    try {
      await _store.fetchExchange(_id);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e);
      if (_store.exchangeById(_id) != null || widget.exchange != null) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return ListenableBuilder(
      listenable: _store,
      builder: (context, _) {
        final x = _store.exchangeById(_id) ?? widget.exchange;
        if (x == null) {
          return Scaffold(
            appBar: backAppBar(context, s.asTabExchanges),
            body: _error != null ? AfterSaleError(error: _error!, onRetry: _load) : const Center(child: CircularProgressIndicator()),
          );
        }
        final c = replacementColors(x.status);
        final from = optionText(s, x.fromSku, x.fromVariant);
        final to = optionText(s, x.toSku, x.toVariant);
        return Scaffold(
          appBar: backAppBar(context, x.reference.isEmpty ? s.asTabExchanges : x.reference),
          body: RefreshIndicator(
            onRefresh: _load,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                _statusBanner(_bannerText(s, x.status, reason: x.sellerReason, due: x.sellerDueAt), c),
                const SizedBox(height: AppSpace.lg),
                Panel(
                  key: const ValueKey('transfer-progress'),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    SectionTitle(s.asRpProgress),
                    StatusTimeline(transferSteps(s,
                        status: x.status, createdAt: x.createdAt, sellerDueAt: x.sellerDueAt, deliveredAt: x.deliveredAt, deliveryTaskId: x.deliveryTaskId, sellerReason: x.sellerReason)),
                  ]),
                ),
                const SizedBox(height: AppSpace.lg),
                Panel(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    KeyValueRow(s.kvOrder, x.orderReference),
                    const SizedBox(height: AppSpace.sm),
                    KeyValueRow(s.asRpItem, '${x.qty} × ${x.displayFromName(s.lang)}'),
                    const SizedBox(height: AppSpace.sm),
                    KeyValueRow(s.issueExchange, s.asExChange(from.isEmpty ? x.displayFromName(s.lang) : from, to.isEmpty ? x.displayToName(s.lang) : to)),
                    if (x.createdAt != null) ...[
                      const SizedBox(height: AppSpace.sm),
                      KeyValueRow(s.asKvOpened, s.date(x.createdAt!)),
                    ],
                    if (x.reason.isNotEmpty) ...[
                      const Divider(height: 22),
                      Text(s.yourMessage, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                      const SizedBox(height: 4),
                      Text(x.reason, key: const ValueKey('transfer-reason'), style: const TextStyle(fontSize: 13.5, height: 1.4)),
                    ],
                  ]),
                ),
                const SizedBox(height: AppSpace.lg),
                Panel(
                  key: const ValueKey('exchange-money'),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    SectionTitle(s.asExDiffTitle),
                    Text(exchangeMoneyText(s, x), key: const ValueKey('exchange-money-text'), style: const TextStyle(fontSize: 13.5, height: 1.4)),
                  ]),
                ),
                if (x.sellerId != null) ...[
                  const SizedBox(height: AppSpace.sm),
                  MessageSellerButton(sellerId: x.sellerId!, orderId: x.orderId, locale: widget.locale),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}
