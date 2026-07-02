import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// The Somba&Teka logo (copied from the web app) rendered on a white tile.
/// Used on splash and across the auth screens.
class BrandLogo extends StatelessWidget {
  final double size;
  final double radius;
  const BrandLogo({super.key, this.size = 84, this.radius = 24});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: size,
      width: size,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(radius),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 24, offset: const Offset(0, 10)),
        ],
      ),
      padding: EdgeInsets.all(size * 0.12),
      child: Image.asset('assets/brand/logo.png', fit: BoxFit.contain),
    );
  }
}

/// Google "G" mark drawn natively (image CDNs are blocked in this environment).
class GoogleGMark extends StatelessWidget {
  final double size;
  const GoogleGMark({super.key, this.size = 20});
  @override
  Widget build(BuildContext context) => CustomPaint(size: Size.square(size), painter: _GooglePainter());
}

class _GooglePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final r = size.width / 2;
    final c = Offset(r, r);
    final stroke = size.width * 0.22;
    final rect = Rect.fromCircle(center: c, radius: r - stroke / 2);
    final p = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.butt;
    // Four coloured arcs of the Google ring.
    p.color = const Color(0xFF4285F4); canvas.drawArc(rect, -0.30, 1.35, false, p); // blue
    p.color = const Color(0xFF34A853); canvas.drawArc(rect, 1.15, 1.35, false, p);  // green
    p.color = const Color(0xFFFBBC05); canvas.drawArc(rect, 2.55, 1.15, false, p);  // yellow
    p.color = const Color(0xFFEA4335); canvas.drawArc(rect, 3.75, 1.35, false, p);  // red
    // The horizontal bar of the G.
    final bar = Paint()..color = const Color(0xFF4285F4);
    canvas.drawRect(Rect.fromLTWH(c.dx, c.dy - stroke / 2, r - stroke / 2, stroke), bar);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// A frosted "glass" card used to hold auth forms over the gradient background.
class GlassCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  const GlassCard({super.key, required this.child, this.padding = const EdgeInsets.all(22)});
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: Colors.white.withValues(alpha: 0.6)),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.16), blurRadius: 40, offset: const Offset(0, 18)),
        ],
      ),
      child: child,
    );
  }
}

/// Soft coloured blobs behind the glass, for the premium gradient backdrop.
class AuthBackdrop extends StatelessWidget {
  final Widget child;
  const AuthBackdrop({super.key, required this.child});
  @override
  Widget build(BuildContext context) {
    return Stack(children: [
      const Positioned.fill(child: DecoratedBox(decoration: BoxDecoration(gradient: AppColors.brandGradient))),
      Positioned(top: -60, right: -40, child: _blob(220, Colors.white.withValues(alpha: 0.18))),
      Positioned(bottom: -80, left: -50, child: _blob(260, const Color(0xFFFF5A6E).withValues(alpha: 0.35))),
      Positioned.fill(child: child),
    ]);
  }

  Widget _blob(double d, Color c) => Container(
        height: d, width: d,
        decoration: BoxDecoration(shape: BoxShape.circle, color: c),
      );
}

/// Pill-shaped primary auth button with elevation.
class AuthButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final bool loading;
  const AuthButton(this.label, {super.key, this.icon, this.onPressed, this.loading = false});
  @override
  Widget build(BuildContext context) => SizedBox(
        width: double.infinity,
        height: 54,
        child: FilledButton(
          onPressed: loading ? null : onPressed,
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.primary,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(100)),
            elevation: 6,
            shadowColor: AppColors.primary.withValues(alpha: 0.5),
          ),
          child: loading
              ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
              : Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  if (icon != null) ...[Icon(icon, size: 20), const SizedBox(width: 8)],
                  Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5)),
                ]),
        ),
      );
}
