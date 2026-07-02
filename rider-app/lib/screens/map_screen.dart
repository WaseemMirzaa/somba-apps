import 'package:flutter/material.dart';
import '../data/mock_tasks.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import '../l10n/strings.dart';

class MapScreen extends StatelessWidget {
  final Locale locale;
  const MapScreen({super.key, required this.locale});

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
    return Stack(
      children: [
        // Faux map backdrop
        Positioned.fill(
          child: CustomPaint(
            painter: _MapPainter(),
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xFFE8F1EC), Color(0xFFDCEBF5)],
                ),
              ),
            ),
          ),
        ),
        // Top bar
        Positioned(
          top: top + 12,
          left: 16,
          right: 16,
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), boxShadow: AppShadow.soft),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.route_rounded, color: AppColors.primary, size: 20),
                  const SizedBox(width: 8),
                  Text(tr(context, 'Optimized route'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
                  const SizedBox(width: 8),
                  Text(tr(context, '3 stops · 12.4 km'), style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                ]),
              ),
              const Spacer(),
              CircleIconButton(icon: Icons.my_location_rounded, color: AppColors.primary,
                  onTap: () => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr(context, 'Centering on your location'))))),
            ],
          ),
        ),
        // Route markers
        Positioned(top: 210, left: 60, child: _Marker(label: tr(context, 'You'), color: AppColors.info, icon: Icons.two_wheeler_rounded)),
        const Positioned(top: 330, right: 70, child: _Marker(label: '1', color: AppColors.primary)),
        const Positioned(top: 470, left: 90, child: _Marker(label: '2', color: AppColors.violet)),
        // Next stop card
        Positioned(
          left: 16,
          right: 16,
          bottom: 96,
          child: SurfaceCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Pill(tr(context, 'Next stop'), color: AppColors.primary.withValues(alpha: 0.14), textColor: AppColors.primary, fontSize: 11),
                  const Spacer(),
                  Text(tr(context, 'ETA 8 min'), style: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w700, fontSize: 12.5)),
                ]),
                const SizedBox(height: 12),
                Row(children: [
                  Container(
                    height: 46,
                    width: 46,
                    decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
                    child: const Icon(Icons.local_shipping_rounded, color: AppColors.primary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: const [
                      Text('Marie Dubois', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                      SizedBox(height: 2),
                      Text('8 Rue de la Paix, Paris 2e', style: TextStyle(color: AppColors.muted, fontSize: 12.5)),
                    ]),
                  ),
                  Text('${mockTasks.first.distanceKm} km', style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.primary)),
                ]),
                const SizedBox(height: 14),
                Row(children: [
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr(context, 'Opening turn-by-turn navigation…')))),
                      icon: const Icon(Icons.navigation_rounded, size: 20),
                      label: Text(tr(context, 'Start navigation')),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Container(
                    decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(16)),
                    child: IconButton(
                      icon: const Icon(Icons.call_rounded, color: AppColors.primary),
                      onPressed: () => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr(context, 'Calling Marie Dubois…')))),
                      iconSize: 22,
                    ),
                  ),
                ]),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Marker extends StatelessWidget {
  final String label;
  final Color color;
  final IconData? icon;
  const _Marker({required this.label, required this.color, this.icon});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: AppShadow.card),
          child: Container(
            height: 30,
            width: 30,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            child: icon != null
                ? Icon(icon, color: Colors.white, size: 17)
                : Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13)),
          ),
        ),
      ],
    );
  }
}

class _MapPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final grid = Paint()
      ..color = const Color(0xFF0B1220).withValues(alpha: 0.04)
      ..strokeWidth = 1;
    const step = 42.0;
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), grid);
    }
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }

    // A couple of "blocks"
    final block = Paint()..color = Colors.white.withValues(alpha: 0.45);
    canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(30, 120, 120, 90), const Radius.circular(10)), block);
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(size.width - 170, 260, 140, 110), const Radius.circular(10)), block);
    canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(40, 420, 130, 120), const Radius.circular(10)), block);

    // Route polyline
    final route = Paint()
      ..color = AppColors.primary
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;
    final path = Path()
      ..moveTo(75, 225)
      ..cubicTo(160, 260, 220, 300, size.width - 55, 345)
      ..cubicTo(size.width - 120, 420, 180, 440, 105, 485);
    // dashed
    final dashed = Paint()
      ..color = AppColors.primary.withValues(alpha: 0.35)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 10
      ..strokeCap = StrokeCap.round;
    canvas.drawPath(path, dashed);
    canvas.drawPath(path, route);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
