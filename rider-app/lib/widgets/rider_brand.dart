import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// The Somba&Teka logo (copied from the web app) on a white tile.
class RiderBrandLogo extends StatelessWidget {
  final double size;
  final double radius;
  const RiderBrandLogo({super.key, this.size = 84, this.radius = 24});
  @override
  Widget build(BuildContext context) {
    return Container(
      height: size,
      width: size,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(radius),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 24, offset: const Offset(0, 10))],
      ),
      padding: EdgeInsets.all(size * 0.12),
      child: Image.asset('assets/brand/logo.png', fit: BoxFit.contain),
    );
  }
}

/// Frosted glass card holding auth forms over the blue gradient.
class RiderGlassCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  const RiderGlassCard({super.key, required this.child, this.padding = const EdgeInsets.all(22)});
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: Colors.white.withValues(alpha: 0.6)),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.16), blurRadius: 40, offset: const Offset(0, 18))],
      ),
      child: child,
    );
  }
}

/// Blue gradient backdrop with soft blobs (rider theme).
class RiderAuthBackdrop extends StatelessWidget {
  final Widget child;
  const RiderAuthBackdrop({super.key, required this.child});
  @override
  Widget build(BuildContext context) {
    return Stack(children: [
      const Positioned.fill(child: DecoratedBox(decoration: BoxDecoration(gradient: AppColors.brandGradient))),
      Positioned(top: -60, right: -40, child: _blob(220, Colors.white.withValues(alpha: 0.16))),
      Positioned(bottom: -80, left: -50, child: _blob(260, const Color(0xFF38BDF8).withValues(alpha: 0.30))),
      Positioned(top: 140, left: -60, child: _blob(150, AppColors.accent.withValues(alpha: 0.22))),
      Positioned.fill(child: child),
    ]);
  }

  Widget _blob(double d, Color c) => Container(height: d, width: d, decoration: BoxDecoration(shape: BoxShape.circle, color: c));
}

/// Pill-shaped primary auth button with elevation.
class RiderAuthButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final bool loading;
  const RiderAuthButton(this.label, {super.key, this.icon, this.onPressed, this.loading = false});
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

/// A glassy auth page scaffold: blue backdrop, logo, title/subtitle, glass card.
class RiderAuthPage extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget form;
  final bool showBack;
  final bool centered;
  const RiderAuthPage({super.key, required this.title, required this.subtitle, required this.form, this.showBack = false, this.centered = false});

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
    final content = <Widget>[
      const Center(child: RiderBrandLogo(size: 78, radius: 22)),
      const SizedBox(height: 18),
      Text(title, textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800, fontFamily: 'PlusJakartaSans', letterSpacing: -0.5)),
      const SizedBox(height: 6),
      Text(subtitle, textAlign: TextAlign.center, style: TextStyle(color: Colors.white.withValues(alpha: 0.92), fontSize: 14)),
      const SizedBox(height: 24),
      RiderGlassCard(child: form),
    ];
    return Scaffold(
      body: RiderAuthBackdrop(
        child: SafeArea(
          child: Stack(children: [
            if (showBack)
              Positioned(
                left: 8, top: 4,
                child: Material(
                  color: Colors.white.withValues(alpha: 0.2),
                  shape: const CircleBorder(),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: () => Navigator.of(context).maybePop(),
                    child: const Padding(padding: EdgeInsets.all(9), child: Icon(Icons.arrow_back_rounded, color: Colors.white, size: 22)),
                  ),
                ),
              ),
            if (centered)
              Center(
                child: SingleChildScrollView(
                  padding: EdgeInsets.fromLTRB(22, top + 56, 22, 30),
                  child: Column(mainAxisSize: MainAxisSize.min, children: content),
                ),
              )
            else
              ListView(padding: EdgeInsets.fromLTRB(22, top + (showBack ? 8 : 40), 22, 30), children: content),
          ]),
        ),
      ),
    );
  }
}
