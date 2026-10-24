import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../data/catalog_live.dart';
import '../../l10n/strings.dart';
import '../../services/models.dart';
import '../../services/realtime_store.dart';
import '../../theme/app_theme.dart';
import '../../util/format.dart';
import '../../util/delivery_estimate.dart';
import '../../widgets/kit.dart';
import '../../widgets/product_image.dart';
import '../payment_pending_screen.dart';
import 'order_after_sale.dart';
import 'returns_extra.dart';
import 'support_extra.dart';

/// Order detail — straight from the live order (updated by server pushes).
class OrderDetailScreen extends StatefulWidget {
  final Locale locale;
  final String orderId;
  const OrderDetailScreen({super.key, this.locale = const Locale('en'), required this.orderId});

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  bool _busy = false;

  Future<void> _cancel(OrderDto o) async {
    final s = Strings.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(s.orderCancelQ),
        content: Text(o.status == 'pending' ? s.orderCancelUnpaid : s.orderCancelRefund),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(s.orderKeep)),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(s.cancelOrder)),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await RealtimeStore.instance.cancelOrder(o.id);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(Strings.current.errorText(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return ListenableBuilder(
      listenable: RealtimeStore.instance,
      builder: (context, _) {
        final store = RealtimeStore.instance;
        final o = store.orderById(widget.orderId);
        if (o == null) {
          return Scaffold(appBar: backAppBar(context, s.kvOrder), body: Center(child: Text(s.orderNotFound)));
        }
        final payment = store.paymentForOrder(o.id);
        final cancellable = o.status == 'pending' || o.status == 'confirmed';
        final trackable = const {'confirmed', 'processing', 'shipped', 'out_for_delivery'}.contains(o.status);
        final c = switch (o.status) {
          'delivered' => AppColors.success,
          'cancelled' || 'returned' => AppColors.danger,
          'out_for_delivery' || 'shipped' => AppColors.primary,
          _ => AppColors.amber,
        };

        return Scaffold(
          appBar: backAppBar(context, s.orderRef(o.reference)),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              Panel(
                child: Row(children: [
                  Container(
                    height: 44,
                    width: 44,
                    decoration: BoxDecoration(color: c.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(12)),
                    child: Icon(Icons.inventory_2_rounded, color: c),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(s.orderStatus(o.status), key: const ValueKey('order-status'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                      const SizedBox(height: 2),
                      if (o.createdAt != null)
                        Text(s.orderPlacedWhen(s.when(o.createdAt!)), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                    ]),
                  ),
                  if (o.status == 'pending' && payment != null && payment.isPending)
                    FilledButton(
                      onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => PaymentPendingScreen(locale: widget.locale, orderId: o.id))),
                      style: FilledButton.styleFrom(minimumSize: const Size(0, 40), padding: const EdgeInsets.symmetric(horizontal: 14)),
                      child: Text(s.orderPay),
                    )
                  else if (trackable)
                    FilledButton(
                      onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderTrackingScreen(locale: widget.locale, orderId: o.id))),
                      style: FilledButton.styleFrom(minimumSize: const Size(0, 40), padding: const EdgeInsets.symmetric(horizontal: 14)),
                      child: Text(s.orderTrack),
                    ),
                ]),
              ),
              DeliveryCodeCard(orderId: o.id, status: o.status),
              const SizedBox(height: 14),
              Panel(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: _itemsSection(s, o)),
              ),
              const SizedBox(height: 14),
              Panel(
                child: Column(children: [
                  _row(s.subtotal, money(o.subtotalUsd)),
                  if (o.campaignDiscountUsd > 0)
                    Align(
                      alignment: Alignment.centerRight,
                      child: Text(s.orderCampaignSaved(money(o.campaignDiscountUsd)),
                          key: const ValueKey('order-campaign-saved'),
                          style: const TextStyle(fontSize: 12, color: AppColors.success, fontWeight: FontWeight.w700)),
                    ),
                  const SizedBox(height: 8),
                  _row(s.delivery, o.deliveryFeeUsd == 0 ? s.free : money(o.deliveryFeeUsd)),
                  if (dayLabel(o.estimatedDeliveryDate, s.lang) != null) ...[
                    const SizedBox(height: 6),
                    _row(s.estimatedDelivery, dayLabel(o.estimatedDeliveryDate, s.lang)!, key: const ValueKey('order-estimate-row')),
                  ],
                  if (o.discountUsd > 0) ...[
                    const SizedBox(height: 8),
                    _row(s.promoRow(o.promoCode ?? ''), '- ${money(o.discountUsd)}'),
                  ],
                  const Divider(height: 22),
                  _row(s.total, money(o.totalUsd), bold: true),
                  if (o.refundedUsd > 0) ...[
                    const SizedBox(height: 8),
                    _row(s.orderRefunded, money(o.refundedUsd), valueColor: AppColors.success, key: const ValueKey('order-refunded-row')),
                  ],
                  const SizedBox(height: 12),
                  Row(children: [
                    Icon(
                      payment == null || payment.status == 'succeeded' ? Icons.verified_rounded : (payment.isPending ? Icons.hourglass_top_rounded : Icons.error_outline_rounded),
                      size: 18,
                      color: payment?.status == 'failed' ? AppColors.danger : (payment?.isPending == true ? AppColors.amber : AppColors.success),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '${_paymentState(s, payment)} · ${s.paymentLabel(o.paymentMethod)}',
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                      ),
                    ),
                  ]),
                ]),
              ),
              const SizedBox(height: 14),
              Row(children: [
                if (cancellable)
                  Expanded(
                    child: OutlinedButton.icon(
                      key: const ValueKey('cancel-order'),
                      onPressed: _busy ? null : () => _cancel(o),
                      icon: const Icon(Icons.close_rounded, size: 18),
                      label: Text(s.cancelOrder),
                    ),
                  )
                else if (o.status == 'delivered')
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReturnRequestScreen(locale: widget.locale, order: o))),
                      icon: const Icon(Icons.assignment_return_rounded, size: 18),
                      label: Text(s.orderReturn),
                    ),
                  ),
                if (cancellable || o.status == 'delivered') const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => HelpScreen(locale: widget.locale))),
                    icon: const Icon(Icons.headset_mic_rounded, size: 18),
                    label: Text(s.orderHelp),
                  ),
                ),
              ]),
              if (o.status == 'delivered') ...[
                const SizedBox(height: 10),
                // Stacked full width: "Replace or exchange" does not fit half a phone row (and must survive large text).
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.tonalIcon(
                    key: const ValueKey('buy-again'),
                    onPressed: () => buyAgain(context, o, widget.locale),
                    icon: const Icon(Icons.replay_rounded, size: 18),
                    label: Text(s.buyAgain),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    key: const ValueKey('item-issue'),
                    onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ItemIssueScreen(order: o))),
                    icon: const Icon(Icons.swap_horiz_rounded, size: 18),
                    label: Text(s.issueOpen),
                  ),
                ),
                const SizedBox(height: 14),
                ReviewPromptCard(order: o, locale: widget.locale),
              ],
              if (o.status != 'pending') ...[
                const SizedBox(height: 10),
                TextButton.icon(
                  key: const ValueKey('order-receipt'),
                  onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderReceiptScreen(order: o))),
                  icon: const Icon(Icons.receipt_long_rounded, size: 18),
                  label: Text(s.receiptTitle),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  static String _paymentState(Strings s, PaymentDto? p) {
    if (p == null) return s.orderPaid;
    return switch (p.status) {
      'succeeded' => s.orderPaid,
      'pending' => s.orderAwaiting,
      'refunded' => s.orderRefunded,
      _ => s.orderPayFailed,
    };
  }

  Widget _row(String l, String v, {bool bold = false, Color? valueColor, Key? key}) => Row(key: key, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Flexible(child: Text(l, style: TextStyle(fontSize: bold ? 15 : 13.5, fontWeight: bold ? FontWeight.w800 : FontWeight.w500, color: bold ? AppColors.ink : AppColors.muted))),
        const SizedBox(width: 8),
        Text(v, style: TextStyle(fontSize: bold ? 17 : 13.5, fontWeight: FontWeight.w800, color: valueColor ?? (bold ? AppColors.primary : AppColors.ink))),
      ]);

  /// The "Items" card content. One seller and nothing cancelled: the plain list with a single
  /// "Sold by" line. Otherwise one block per seller package, each with its own progress badge.
  List<Widget> _itemsSection(Strings s, OrderDto o) {
    final packages = packagesOf(o);
    final grouped = packages.length > 1 || o.cancelledLineCount > 0;
    final title = Text(s.orderItems, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15));
    if (!grouped) {
      final seller = packages.isEmpty ? null : packages.first.sellerName;
      return [
        title,
        if ((seller ?? '').isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(s.soldBy(seller), key: const ValueKey('order-sold-by'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5, fontWeight: FontWeight.w600)),
        ],
        const SizedBox(height: 12),
        ...o.items.map((i) => _line(s, i)),
      ];
    }
    return [
      title,
      const SizedBox(height: 12),
      for (var n = 0; n < packages.length; n++) ...[
        if (n > 0) const Divider(height: 20),
        _packageBlock(s, packages[n], n + 1, packages.length),
      ],
    ];
  }

  Widget _packageBlock(Strings s, OrderPackage pkg, int n, int total) {
    final seller = pkg.sellerName ?? '';
    final c = packageStatusColor(pkg.status);
    return Column(
      key: ValueKey('order-package-$n'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Text(
              seller.isEmpty ? s.orderPackageOfPlain(n, total) : s.orderPackageOf(n, total, seller),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, color: AppColors.inkSoft),
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Container(
              key: ValueKey('package-status-$n'),
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(100)),
              child: Text(packageStatusLabel(s, pkg.status),
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: c, fontSize: 11, fontWeight: FontWeight.w700)),
            ),
          ),
        ]),
        const SizedBox(height: 10),
        ...pkg.items.map((i) => _line(s, i)),
      ],
    );
  }

  Widget _line(Strings s, OrderItemDto i) {
    final p = productByUuid(i.productId);
    final cancelled = i.isCancelled;
    final strike = cancelled ? TextDecoration.lineThrough : null;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(crossAxisAlignment: cancelled ? CrossAxisAlignment.start : CrossAxisAlignment.center, children: [
        Opacity(
          opacity: cancelled ? 0.5 : 1,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              height: 60,
              width: 60,
              child: p != null
                  ? ProductImage(product: p, iconSize: 26)
                  : Container(color: AppColors.background, child: const Icon(Icons.shopping_bag_outlined, color: AppColors.faint)),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(i.displayName(s.lang),
              key: ValueKey('order-line-name-${i.productId}'),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5, decoration: strike, color: cancelled ? AppColors.muted : AppColors.ink)),
          const SizedBox(height: 2),
          if (i.hasVariant)
            Text(i.displayVariant(s.lang),
                key: ValueKey('order-line-variant-${i.productId}'),
                style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
          Text(s.orderQty(i.qty), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
          if (cancelled) ...[
            const SizedBox(height: 4),
            Text(
              (i.cancelReason ?? '').trim().isEmpty ? s.lineCancelledPlain : s.lineCancelledReason(i.cancelReason!.trim()),
              key: ValueKey('cancel-reason-${i.productId}'),
              style: const TextStyle(color: AppColors.danger, fontSize: 12, fontWeight: FontWeight.w600),
            ),
            if (i.refundedUsd > 0)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(s.lineRefundedWallet(money(i.refundedUsd)),
                    key: ValueKey('line-refund-${i.productId}'),
                    style: const TextStyle(color: AppColors.success, fontSize: 12, fontWeight: FontWeight.w700)),
              ),
          ],
        ])),
        const SizedBox(width: 8),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(money(i.priceUsd * i.qty),
              style: TextStyle(fontWeight: FontWeight.w800, decoration: strike, color: cancelled ? AppColors.muted : AppColors.ink)),
          if (!cancelled && i.listPriceUsd > i.priceUsd)
            Text(money(i.listPriceUsd * i.qty), style: const TextStyle(fontSize: 11.5, color: AppColors.faint, decoration: TextDecoration.lineThrough)),
        ]),
      ]),
    );
  }
}

/// Badge text for one seller package.
String packageStatusLabel(Strings s, String status) => switch (status) {
      'pending' => s.pkgStatusPending,
      'to_pack' => s.pkgStatusToPack,
      'ready' => s.pkgStatusReady,
      'at_hub' => s.pkgStatusAtHub,
      'shipped' || 'out_for_delivery' => s.pkgStatusOnWay,
      'delivered' => s.pkgStatusDelivered,
      'returned' => s.pkgStatusReturned,
      'cancelled' => s.pkgStatusCancelled,
      _ => status,
    };

Color packageStatusColor(String status) => switch (status) {
      'delivered' => AppColors.success,
      'cancelled' || 'returned' => AppColors.danger,
      'ready' || 'at_hub' || 'shipped' || 'out_for_delivery' => AppColors.primary,
      _ => AppColors.amber,
    };

/// Tracking — the timeline follows the order status and the rider's position is
/// the one the rider app streams (`delivery:location`). Nothing is simulated.
class OrderTrackingScreen extends StatelessWidget {
  final Locale locale;
  final String orderId;
  const OrderTrackingScreen({super.key, this.locale = const Locale('en'), required this.orderId});

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return ListenableBuilder(
      listenable: RealtimeStore.instance,
      builder: (context, _) {
        final store = RealtimeStore.instance;
        final o = store.orderById(orderId);
        if (o == null) {
          return Scaffold(appBar: backAppBar(context, s.trackOrder), body: Center(child: Text(s.orderNotFound)));
        }
        const flow = ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'];
        final reached = flow.indexOf(o.status);
        final cancelled = o.status == 'cancelled' || o.status == 'returned';
        final loc = store.riderLocations[o.id];
        String label(int i) => s.orderStatus(flow[i]);
        final steps = <(String, String, bool)>[
          (s.trackPlaced, o.reference, true),
          for (var i = 0; i < flow.length; i++)
            (label(i), i == reached ? s.trackCurrent : '', !cancelled && reached >= i),
        ];
        return Scaffold(
          appBar: backAppBar(context, s.trackOrder),
          body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
            Panel(
              child: Row(children: [
                Container(
                  height: 44,
                  width: 44,
                  decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
                  child: const Icon(Icons.electric_moped_rounded, color: AppColors.primary),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(
                      o.status == 'delivered'
                          ? s.trackDone
                          : loc != null
                              ? s.trackOnway
                              : (o.status == 'out_for_delivery' ? s.trackHeading : s.trackNotYet),
                      key: const ValueKey('track-headline'),
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5),
                    ),
                    Text(
                      o.status == 'delivered'
                          ? s.trackDoneHint
                          : loc != null
                              ? s.trackLivePos(loc.lat.toStringAsFixed(4), loc.lng.toStringAsFixed(4))
                              : s.trackLiveHint,
                      style: const TextStyle(color: AppColors.muted, fontSize: 12.5),
                    ),
                  ]),
                ),
              ]),
            ),
            DeliveryCodeCard(orderId: o.id, status: o.status),
            if (o.rider != null && o.rider!.dialNumber.isNotEmpty) ...[
              const SizedBox(height: 14),
              Panel(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(s.trackYourRider, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                  const SizedBox(height: 2),
                  Text(o.rider!.name, key: const ValueKey('rider-name'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    key: const ValueKey('call-rider'),
                    onPressed: () => callRider(context, o.rider!),
                    icon: const Icon(Icons.call_rounded, size: 18),
                    label: Text(s.trackCallRider(o.rider!.name)),
                  ),
                ]),
              ),
            ],
            if (loc != null) ...[
              const SizedBox(height: 14),
              Panel(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  if (riderMapAvailable) ...[
                    RiderMap(rider: (lat: loc.lat, lng: loc.lng), destination: o.destination),
                    const SizedBox(height: 10),
                  ],
                  Text(s.trackRiderPos(loc.lat.toStringAsFixed(5), loc.lng.toStringAsFixed(5)),
                      key: const ValueKey('rider-coords'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    key: const ValueKey('open-maps'),
                    onPressed: () => openInMaps(context, loc.lat, loc.lng),
                    icon: const Icon(Icons.map_rounded, size: 18),
                    label: Text(s.trackOpenMaps),
                  ),
                ]),
              ),
            ],
            const SizedBox(height: 14),
            Panel(child: cancelled ? Text(s.orderStatus(o.status), style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w800)) : StatusTimeline(steps)),
          ]),
        );
      },
    );
  }
}

/// Opens the phone's dialler on the rider's number.
Future<void> callRider(BuildContext context, RiderContact rider) async {
  final messenger = ScaffoldMessenger.of(context);
  final failed = Strings.of(context).trackCallFail;
  try {
    final ok = await launchUrl(Uri(scheme: 'tel', path: rider.dialNumber));
    if (!ok) messenger.showSnackBar(SnackBar(content: Text(failed)));
  } catch (_) {
    messenger.showSnackBar(SnackBar(content: Text(failed)));
  }
}

/// Opens the rider's position in the phone's maps app (or the browser).
Future<void> openInMaps(BuildContext context, double lat, double lng) async {
  final messenger = ScaffoldMessenger.of(context);
  final failed = Strings.of(context).trackMapsFail;
  try {
    final ok = await launchUrl(Uri.parse('https://www.google.com/maps?q=$lat,$lng'), mode: LaunchMode.externalApplication);
    if (!ok) messenger.showSnackBar(SnackBar(content: Text(failed)));
  } catch (_) {
    messenger.showSnackBar(SnackBar(content: Text(failed)));
  }
}

/// Proof of delivery: while the parcel is on its way the customer sees a 4-digit
/// code to give to the rider. Asks the server (`orders:deliveryCode`) and only
/// renders when a code is required and available.
class DeliveryCodeCard extends StatefulWidget {
  final String orderId;
  final String status;
  const DeliveryCodeCard({super.key, required this.orderId, required this.status});

  @override
  State<DeliveryCodeCard> createState() => _DeliveryCodeCardState();
}

class _DeliveryCodeCardState extends State<DeliveryCodeCard> {
  String? _code;

  static const _statuses = {'processing', 'shipped', 'out_for_delivery'};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant DeliveryCodeCard old) {
    super.didUpdateWidget(old);
    if (old.status != widget.status || old.orderId != widget.orderId) _load();
  }

  Future<void> _load() async {
    if (!_statuses.contains(widget.status)) {
      if (_code != null) setState(() => _code = null);
      return;
    }
    try {
      final r = await RealtimeStore.instance.call('orders:deliveryCode', {'orderId': widget.orderId});
      final m = r is Map ? r : const {};
      final code = m['required'] == true && m['code'] != null ? '${m['code']}' : null;
      if (mounted) setState(() => _code = code);
    } catch (_) {
      if (mounted) setState(() => _code = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final code = _code;
    if (code == null) return const SizedBox.shrink();
    final s = Strings.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Container(
        key: const ValueKey('delivery-code-card'),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: AppColors.brandGradient,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(children: [
          const Icon(Icons.lock_rounded, color: Colors.white, size: 30),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Text('${s.codeTitle}  ', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14)),
                Text(code, key: const ValueKey('delivery-code'), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 28, letterSpacing: 6)),
              ]),
              const SizedBox(height: 4),
              Text(s.codeHint,
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.92), fontSize: 12.5, height: 1.3)),
            ]),
          ),
        ]),
      ),
    );
  }
}
