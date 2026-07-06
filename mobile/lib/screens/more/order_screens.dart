import 'package:flutter/material.dart';
import '../../data/mock_data.dart';
import '../../data/repository.dart';
import '../../theme/app_theme.dart';
import '../../util/format.dart';
import '../../l10n/strings.dart';
import '../../widgets/kit.dart';
import '../../widgets/product_image.dart';
import 'returns_extra.dart';
import 'support_extra.dart';
import 'catalog_extra.dart';

class OrderDetailScreen extends StatefulWidget {
  final Locale locale;
  final bool delivered;
  final String? orderId;
  const OrderDetailScreen({super.key, this.locale = const Locale('en'), this.delivered = false, this.orderId});

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  Map<String, dynamic>? _order;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    if (widget.orderId != null) {
      _loading = true;
      _fetch();
    }
  }

  Future<void> _fetch() async {
    final o = await Repo.instance.orderDetail(widget.orderId!);
    if (!mounted) return;
    setState(() {
      _order = o;
      _loading = false;
    });
  }

  double _d(dynamic v) => v is num ? v.toDouble() : (double.tryParse('$v') ?? 0);
  int _i(dynamic v) => v is num ? v.toInt() : (int.tryParse('$v') ?? 0);

  @override
  Widget build(BuildContext context) {
    final lang = widget.locale.languageCode;
    if (_loading) {
      return Scaffold(
        appBar: backAppBar(context, trl(lang, 'Order')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    final order = _order;
    if (order != null) return _buildReal(context, order, lang);
    return _buildMock(context, lang);
  }

  // ---- Live order rendering (real API data) --------------------------------

  Widget _buildReal(BuildContext context, Map<String, dynamic> order, String lang) {
    final s = Strings(lang);
    final code = (order['code'] ?? '').toString();
    final status = (order['status'] ?? 'pending').toString();
    final delivered = status == 'delivered';
    final items = ((order['items'] as List?) ?? const []).whereType<Map>().toList();
    final subtotal = _d(order['subtotalUsd']);
    final fee = _d(order['deliveryFeeUsd']);
    final total = _d(order['totalUsd']);
    final payment = (order['paymentMethod'] ?? '').toString();
    final addressLine = (order['addressLine'] ?? '').toString();
    final city = (order['city'] ?? '').toString();
    final zone = (order['zone'] ?? '').toString();
    final address = [addressLine, city, zone].where((e) => e.isNotEmpty).join(', ');
    final c = delivered ? AppColors.success : AppColors.amber;

    return Scaffold(
      appBar: backAppBar(context, '${trl(lang, 'Order')} $code'),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Panel(
            child: Row(children: [
              Container(
                height: 44, width: 44,
                decoration: BoxDecoration(color: c.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(12)),
                child: Icon(delivered ? Icons.check_circle_rounded : Icons.inventory_2_rounded, color: c),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(s.orderStatus(status), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                  const SizedBox(height: 2),
                  Text('${s.itemsCount(items.length)} · ${money(total)}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                ]),
              ),
              if (!delivered)
                FilledButton(
                  onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderTrackingScreen(locale: widget.locale, status: status))),
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 40), padding: const EdgeInsets.symmetric(horizontal: 14)),
                  child: Text(trl(lang, 'Track')),
                ),
            ]),
          ),
          const SizedBox(height: 14),
          Panel(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(trl(lang, 'Items'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              const SizedBox(height: 12),
              ...items.map((it) {
                final pj = it['product'];
                final product = pj is Map ? Product.fromJson(pj.cast<String, dynamic>()) : null;
                final name = product != null && product.displayName(lang).isNotEmpty
                    ? product.displayName(lang)
                    : (it['nameSnapshot'] ?? '').toString();
                final qty = _i(it['qty']);
                final lineTotal = _d(it['lineTotal']);
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Column(children: [
                    Row(children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: SizedBox(
                          height: 60, width: 60,
                          child: product != null
                              ? ProductImage(product: product, iconSize: 26)
                              : Container(color: AppColors.background, child: const Icon(Icons.inventory_2_rounded, color: AppColors.muted)),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                        const SizedBox(height: 2),
                        Text('${trl(lang, 'Qty')} $qty', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                      ])),
                      Text(money(lineTotal), style: const TextStyle(fontWeight: FontWeight.w800)),
                    ]),
                    if (delivered && product != null) ...[
                      const SizedBox(height: 8),
                      Row(children: [
                        Expanded(child: OutlinedButton.icon(
                          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ExchangeScreen(locale: widget.locale, product: product))),
                          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 36), padding: const EdgeInsets.symmetric(horizontal: 8)),
                          icon: const Icon(Icons.swap_horiz_rounded, size: 16),
                          label: Text(trl(lang, 'Exchange'), style: const TextStyle(fontSize: 12.5)),
                        )),
                        const SizedBox(width: 8),
                        Expanded(child: OutlinedButton.icon(
                          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReturnRequestScreen(locale: widget.locale))),
                          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 36), padding: const EdgeInsets.symmetric(horizontal: 8)),
                          icon: const Icon(Icons.assignment_return_rounded, size: 16),
                          label: Text(trl(lang, 'Return'), style: const TextStyle(fontSize: 12.5)),
                        )),
                        const SizedBox(width: 8),
                        Expanded(child: OutlinedButton.icon(
                          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReviewComposeScreen(locale: widget.locale, product: product))),
                          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 36), padding: const EdgeInsets.symmetric(horizontal: 8)),
                          icon: const Icon(Icons.rate_review_rounded, size: 16),
                          label: Text(trl(lang, 'Review'), style: const TextStyle(fontSize: 12.5)),
                        )),
                      ]),
                    ],
                  ]),
                );
              }),
            ]),
          ),
          const SizedBox(height: 14),
          if (address.isNotEmpty) ...[
            Panel(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(trl(lang, 'Delivery address'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                const SizedBox(height: 10),
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Icon(Icons.location_on_rounded, size: 18, color: AppColors.primary),
                  const SizedBox(width: 8),
                  Expanded(child: Text(address, style: const TextStyle(fontSize: 13, color: AppColors.inkSoft, fontWeight: FontWeight.w500))),
                ]),
              ]),
            ),
            const SizedBox(height: 14),
          ],
          Panel(
            child: Column(children: [
              _row(trl(lang, 'Subtotal'), money(subtotal)),
              const SizedBox(height: 8),
              _row(trl(lang, 'Delivery'), money(fee)),
              const Divider(height: 22),
              _row(trl(lang, 'Total'), money(total), bold: true),
              const SizedBox(height: 12),
              Row(children: [
                Icon(Icons.verified_rounded, size: 18, color: AppColors.success),
                const SizedBox(width: 8),
                Text(s.paymentLabel(payment), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              ]),
            ]),
          ),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(child: OutlinedButton.icon(
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReturnRequestScreen(locale: widget.locale))),
                icon: const Icon(Icons.assignment_return_rounded, size: 18), label: Text(trl(lang, 'Return')))),
            const SizedBox(width: 12),
            Expanded(child: OutlinedButton.icon(
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => HelpScreen(locale: widget.locale))),
                icon: const Icon(Icons.headset_mic_rounded, size: 18), label: Text(trl(lang, 'Help')))),
          ]),
        ],
      ),
    );
  }

  // ---- Mock fallback (offline / no order id) -------------------------------

  Widget _buildMock(BuildContext context, String lang) {
    final locale = widget.locale;
    final delivered = widget.delivered;
    final items = products.take(2).toList();
    final subtotal = items.fold<double>(0, (s, p) => s + p.price);
    const fee = 5.0;

    return Scaffold(
      appBar: backAppBar(context, '${trl(lang, 'Order')} ${delivered ? 'SMB-2026-4712' : 'SMB-2026-4821'}'),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Panel(
            child: Row(children: [
              Container(
                height: 44, width: 44,
                decoration: BoxDecoration(color: AppColors.amber.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(12)),
                child: const Icon(Icons.inventory_2_rounded, color: Color(0xFFB45309)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(delivered ? trl(lang, 'Delivered') : trl(lang, 'Processing'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                  const SizedBox(height: 2),
                  Text(trl(lang, 'Placed today · arrives in 2 days'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                ]),
              ),
              FilledButton(
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderTrackingScreen(locale: locale))),
                style: FilledButton.styleFrom(minimumSize: const Size(0, 40), padding: const EdgeInsets.symmetric(horizontal: 14)),
                child: Text(trl(lang, 'Track')),
              ),
            ]),
          ),
          const SizedBox(height: 14),
          Panel(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(trl(lang, 'Items'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              const SizedBox(height: 12),
              ...items.map((p) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Column(children: [
                      Row(children: [
                        ClipRRect(borderRadius: BorderRadius.circular(12), child: SizedBox(height: 60, width: 60, child: ProductImage(product: p, iconSize: 26))),
                        const SizedBox(width: 12),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(p.displayName(locale.languageCode), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                          const SizedBox(height: 2),
                          Text('${trl(lang, 'Qty')} 1', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                        ])),
                        Text(money(p.price), style: const TextStyle(fontWeight: FontWeight.w800)),
                      ]),
                      // Delivered orders: per-product exchange / return actions.
                      if (delivered) ...[
                        const SizedBox(height: 8),
                        Row(children: [
                          Expanded(child: OutlinedButton.icon(
                            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ExchangeScreen(locale: locale, product: p))),
                            style: OutlinedButton.styleFrom(minimumSize: const Size(0, 36), padding: const EdgeInsets.symmetric(horizontal: 8)),
                            icon: const Icon(Icons.swap_horiz_rounded, size: 16),
                            label: Text(trl(lang, 'Exchange'), style: const TextStyle(fontSize: 12.5)),
                          )),
                          const SizedBox(width: 8),
                          Expanded(child: OutlinedButton.icon(
                            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReturnRequestScreen(locale: locale))),
                            style: OutlinedButton.styleFrom(minimumSize: const Size(0, 36), padding: const EdgeInsets.symmetric(horizontal: 8)),
                            icon: const Icon(Icons.assignment_return_rounded, size: 16),
                            label: Text(trl(lang, 'Return'), style: const TextStyle(fontSize: 12.5)),
                          )),
                          const SizedBox(width: 8),
                          Expanded(child: OutlinedButton.icon(
                            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReviewComposeScreen(locale: locale, product: p))),
                            style: OutlinedButton.styleFrom(minimumSize: const Size(0, 36), padding: const EdgeInsets.symmetric(horizontal: 8)),
                            icon: const Icon(Icons.rate_review_rounded, size: 16),
                            label: Text(trl(lang, 'Review'), style: const TextStyle(fontSize: 12.5)),
                          )),
                        ]),
                      ],
                    ]),
                  )),
            ]),
          ),
          const SizedBox(height: 14),
          Panel(
            child: Column(children: [
              _row(trl(lang, 'Subtotal'), money(subtotal)),
              const SizedBox(height: 8),
              _row(trl(lang, 'Delivery'), money(fee)),
              const Divider(height: 22),
              _row(trl(lang, 'Total'), money(subtotal + fee), bold: true),
              const SizedBox(height: 12),
              Row(children: [
                Icon(Icons.verified_rounded, size: 18, color: AppColors.success),
                const SizedBox(width: 8),
                Text('${trl(lang, 'Paid online')} · Airtel Money', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              ]),
            ]),
          ),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(child: OutlinedButton.icon(
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReturnRequestScreen(locale: locale))),
                icon: const Icon(Icons.assignment_return_rounded, size: 18), label: Text(trl(lang, 'Return')))),
            const SizedBox(width: 12),
            Expanded(child: OutlinedButton.icon(
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => HelpScreen(locale: locale))),
                icon: const Icon(Icons.headset_mic_rounded, size: 18), label: Text(trl(lang, 'Help')))),
          ]),
        ],
      ),
    );
  }

  Widget _row(String l, String v, {bool bold = false}) => Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text(l, style: TextStyle(fontSize: bold ? 15 : 13.5, fontWeight: bold ? FontWeight.w800 : FontWeight.w500, color: bold ? AppColors.ink : AppColors.muted)),
        Text(v, style: TextStyle(fontSize: bold ? 17 : 13.5, fontWeight: FontWeight.w800, color: bold ? AppColors.primary : AppColors.ink)),
      ]);
}

class OrderTrackingScreen extends StatefulWidget {
  final Locale locale;
  final String? status;
  const OrderTrackingScreen({super.key, this.locale = const Locale('en'), this.status});

  @override
  State<OrderTrackingScreen> createState() => _OrderTrackingScreenState();
}

class _OrderTrackingScreenState extends State<OrderTrackingScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(seconds: 16))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  /// The order-status flow, in fulfillment order.
  static const _flow = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'];
  static const _flowLabels = {
    'pending': 'Order placed',
    'confirmed': 'Order confirmed',
    'processing': 'Packed at warehouse',
    'shipped': 'Shipped',
    'out_for_delivery': 'Out for delivery',
    'delivered': 'Delivered',
  };

  /// Build the timeline from the live order status (stages up to and including
  /// the current one are marked done). Falls back to the sample list when no
  /// status was supplied.
  List<(String, String, bool)> _timeline() {
    final status = widget.status;
    if (status == null) {
      return const [
        ('Order placed', 'Today, 09:14', true),
        ('Packed at warehouse', 'Today, 10:02', true),
        ('Shipped', 'Today, 11:20', true),
        ('Out for delivery', 'Rider on the way', true),
        ('Delivered', 'Estimated 14:30', false),
      ];
    }
    final lang = widget.locale.languageCode;
    var idx = _flow.indexOf(status);
    if (idx < 0) idx = 0;
    return [
      for (var i = 0; i < _flow.length; i++)
        (
          trl(lang, _flowLabels[_flow[i]]!),
          trl(lang, i < idx ? 'Completed' : i == idx ? 'In progress' : 'Pending'),
          i <= idx,
        ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, trl(widget.locale.languageCode, 'Track order')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          // Live map with an animated rider marker + ETA countdown.
          Container(
            height: 190,
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), boxShadow: AppShadow.card),
            clipBehavior: Clip.antiAlias,
            child: AnimatedBuilder(
              animation: _c,
              builder: (context, _) {
                final progress = _c.value;
                final minsLeft = (14 * (1 - progress)).ceil().clamp(1, 14);
                return Stack(children: [
                  Positioned.fill(child: CustomPaint(foregroundPainter: _LiveMapPainter(progress), child: const DecoratedBox(
                    decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFEAF0FF), Color(0xFFF3E9EC)])),
                  ))),
                  Positioned(left: 16, top: 14, child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(100), boxShadow: AppShadow.soft),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Container(width: 7, height: 7, decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle)),
                      const SizedBox(width: 6),
                      Text('${trl(widget.locale.languageCode, 'Arriving in')} ~$minsLeft min', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5)),
                    ]),
                  )),
                ]);
              },
            ),
          ),
          const SizedBox(height: 14),
          Panel(
            child: Row(children: [
              const CircleAvatar(radius: 22, backgroundColor: AppColors.background, child: Text('JM', style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.primary))),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Jean Mukendi', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
                Text('${trl(widget.locale.languageCode, 'Your rider')} · ⭐ 4.9', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
              ])),
              Container(decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
                child: IconButton(icon: const Icon(Icons.call_rounded, color: AppColors.primary),
                  onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Calling your rider Jean…'))))),
            ]),
          ),
          const SizedBox(height: 14),
          Panel(
            child: StatusTimeline(_timeline()),
          ),
        ],
      ),
    );
  }
}

class _LiveMapPainter extends CustomPainter {
  final double progress; // 0..1 rider position along the route
  _LiveMapPainter(this.progress);

  @override
  void paint(Canvas canvas, Size size) {
    final grid = Paint()..color = const Color(0xFF0B1020).withValues(alpha: 0.04)..strokeWidth = 1;
    for (double x = 0; x < size.width; x += 30) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), grid);
    }
    for (double y = 0; y < size.height; y += 30) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }

    // Route as a cubic Bézier from warehouse (P0) to the customer (P3).
    final p0 = Offset(34, 44);
    final p1 = Offset(size.width * 0.32, size.height * 0.9);
    final p2 = Offset(size.width * 0.62, size.height * 0.18);
    final p3 = Offset(size.width - 36, size.height - 34);

    final full = Paint()..color = AppColors.line..style = PaintingStyle.stroke..strokeWidth = 4..strokeCap = StrokeCap.round;
    final done = Paint()..color = AppColors.primary..style = PaintingStyle.stroke..strokeWidth = 4..strokeCap = StrokeCap.round;
    final path = Path()..moveTo(p0.dx, p0.dy)..cubicTo(p1.dx, p1.dy, p2.dx, p2.dy, p3.dx, p3.dy);
    canvas.drawPath(path, full);

    // Travelled portion of the path (approximate by sampling up to progress).
    final travelled = Path()..moveTo(p0.dx, p0.dy);
    for (double t = 0; t <= progress; t += 0.02) {
      final pt = _bezier(p0, p1, p2, p3, t);
      travelled.lineTo(pt.dx, pt.dy);
    }
    canvas.drawPath(travelled, done);

    // Start & destination pins.
    canvas.drawCircle(p0, 6, Paint()..color = AppColors.muted);
    canvas.drawCircle(p3, 7, Paint()..color = AppColors.danger);
    canvas.drawCircle(p3, 3, Paint()..color = Colors.white);

    // Rider marker at the current position.
    final rider = _bezier(p0, p1, p2, p3, progress);
    canvas.drawCircle(rider, 13, Paint()..color = AppColors.primary.withValues(alpha: 0.18));
    canvas.drawCircle(rider, 9, Paint()..color = Colors.white);
    canvas.drawCircle(rider, 7, Paint()..color = AppColors.primary);
  }

  Offset _bezier(Offset p0, Offset p1, Offset p2, Offset p3, double t) {
    final u = 1 - t;
    final x = u * u * u * p0.dx + 3 * u * u * t * p1.dx + 3 * u * t * t * p2.dx + t * t * t * p3.dx;
    final y = u * u * u * p0.dy + 3 * u * u * t * p1.dy + 3 * u * t * t * p2.dy + t * t * t * p3.dy;
    return Offset(x, y);
  }

  @override
  bool shouldRepaint(covariant _LiveMapPainter oldDelegate) => oldDelegate.progress != progress;
}
