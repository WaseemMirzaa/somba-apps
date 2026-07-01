import 'package:flutter/material.dart';
import '../../data/mock_data.dart';
import '../../theme/app_theme.dart';
import '../../util/format.dart';
import '../../widgets/kit.dart';
import '../../widgets/product_image.dart';
import 'returns_extra.dart';
import 'support_extra.dart';

class OrderDetailScreen extends StatelessWidget {
  final Locale locale;
  const OrderDetailScreen({super.key, this.locale = const Locale('en')});

  @override
  Widget build(BuildContext context) {
    final items = products.take(2).toList();
    final subtotal = items.fold<double>(0, (s, p) => s + p.price);
    const fee = 5.0;

    return Scaffold(
      appBar: backAppBar(context, 'Order SMB-2026-4821'),
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
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: const [
                  Text('Processing', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                  SizedBox(height: 2),
                  Text('Placed today · arrives in 2 days', style: TextStyle(color: AppColors.muted, fontSize: 12.5)),
                ]),
              ),
              FilledButton(
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderTrackingScreen(locale: locale))),
                style: FilledButton.styleFrom(minimumSize: const Size(0, 40), padding: const EdgeInsets.symmetric(horizontal: 14)),
                child: const Text('Track'),
              ),
            ]),
          ),
          const SizedBox(height: 14),
          Panel(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Items', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              const SizedBox(height: 12),
              ...items.map((p) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Row(children: [
                      ClipRRect(borderRadius: BorderRadius.circular(12), child: SizedBox(height: 60, width: 60, child: ProductImage(product: p, iconSize: 26))),
                      const SizedBox(width: 12),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(p.displayName(locale.languageCode), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                        const SizedBox(height: 2),
                        const Text('Qty 1', style: TextStyle(color: AppColors.muted, fontSize: 12.5)),
                      ])),
                      Text(money(p.price), style: const TextStyle(fontWeight: FontWeight.w800)),
                    ]),
                  )),
            ]),
          ),
          const SizedBox(height: 14),
          Panel(
            child: Column(children: [
              _row('Subtotal', money(subtotal)),
              const SizedBox(height: 8),
              _row('Delivery', money(fee)),
              const Divider(height: 22),
              _row('Total', money(subtotal + fee), bold: true),
              const SizedBox(height: 12),
              Row(children: [
                Icon(Icons.verified_rounded, size: 18, color: AppColors.success),
                const SizedBox(width: 8),
                const Text('Paid online · Airtel Money', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              ]),
            ]),
          ),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(child: OutlinedButton.icon(
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReturnRequestScreen(locale: locale))),
                icon: const Icon(Icons.assignment_return_rounded, size: 18), label: const Text('Return'))),
            const SizedBox(width: 12),
            Expanded(child: OutlinedButton.icon(
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => HelpScreen(locale: locale))),
                icon: const Icon(Icons.headset_mic_rounded, size: 18), label: const Text('Help'))),
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

class OrderTrackingScreen extends StatelessWidget {
  final Locale locale;
  const OrderTrackingScreen({super.key, this.locale = const Locale('en')});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, 'Track order'),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          // Map preview
          Container(
            height: 180,
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), boxShadow: AppShadow.card),
            clipBehavior: Clip.antiAlias,
            child: Stack(children: [
              Positioned.fill(child: CustomPaint(painter: _MiniMapPainter(), child: const DecoratedBox(
                decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFEAF0FF), Color(0xFFF3E9EC)])),
              ))),
              const Positioned(right: 16, bottom: 16, child: _Bubble(icon: Icons.two_wheeler_rounded)),
              Positioned(left: 16, top: 14, child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(100), boxShadow: AppShadow.soft),
                child: const Text('Arriving in ~14 min', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5)),
              )),
            ]),
          ),
          const SizedBox(height: 14),
          Panel(
            child: Row(children: [
              const CircleAvatar(radius: 22, backgroundColor: AppColors.background, child: Text('JM', style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.primary))),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: const [
                Text('Jean Mukendi', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
                Text('Your rider · ⭐ 4.9', style: TextStyle(color: AppColors.muted, fontSize: 12.5)),
              ])),
              Container(decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
                child: IconButton(icon: const Icon(Icons.call_rounded, color: AppColors.primary), onPressed: () {})),
            ]),
          ),
          const SizedBox(height: 14),
          Panel(
            child: const StatusTimeline([
              ('Order placed', 'Today, 09:14', true),
              ('Packed at warehouse', 'Today, 10:02', true),
              ('Shipped', 'Today, 11:20', true),
              ('Out for delivery', 'Rider on the way', true),
              ('Delivered', 'Estimated 14:30', false),
            ]),
          ),
        ],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  final IconData icon;
  const _Bubble({required this.icon});
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: AppShadow.card),
        child: Container(height: 34, width: 34, decoration: const BoxDecoration(gradient: AppColors.brandGradient, shape: BoxShape.circle), child: Icon(icon, color: Colors.white, size: 19)),
      );
}

class _MiniMapPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final grid = Paint()..color = const Color(0xFF0B1020).withValues(alpha: 0.04)..strokeWidth = 1;
    for (double x = 0; x < size.width; x += 30) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), grid);
    }
    for (double y = 0; y < size.height; y += 30) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }
    final route = Paint()..color = AppColors.primary..style = PaintingStyle.stroke..strokeWidth = 4..strokeCap = StrokeCap.round;
    final path = Path()..moveTo(30, 40)..cubicTo(120, 90, 160, 60, size.width - 40, size.height - 30);
    canvas.drawPath(path, route);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
