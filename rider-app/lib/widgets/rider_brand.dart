import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// The Somba&Teka logo (copied from the web app) on a white tile, wrapped in a
/// soft luminous halo so it reads as premium over the deep-blue backdrop.
class RiderBrandLogo extends StatelessWidget {
  final double size;
  final double radius;
  final bool halo;
  const RiderBrandLogo({super.key, this.size = 84, this.radius = 24, this.halo = true});
  @override
  Widget build(BuildContext context) {
    final tile = Container(
      height: size,
      width: size,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Colors.white, Color(0xFFF3F6FF)],
        ),
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: Colors.white.withValues(alpha: 0.9), width: 1),
        boxShadow: [
          BoxShadow(color: AppColors.primaryDark.withValues(alpha: 0.35), blurRadius: 30, offset: const Offset(0, 16)),
          BoxShadow(color: Colors.black.withValues(alpha: 0.14), blurRadius: 10, offset: const Offset(0, 4)),
        ],
      ),
      padding: EdgeInsets.all(size * 0.13),
      child: Image.asset('assets/brand/logo.png', fit: BoxFit.contain),
    );
    if (!halo) return tile;
    // Luminous ring behind the tile for depth.
    return SizedBox(
      height: size + 34,
      width: size + 34,
      child: Stack(alignment: Alignment.center, children: [
        Container(
          height: size + 30,
          width: size + 30,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(colors: [
              const Color(0xFF7DA2FF).withValues(alpha: 0.55),
              const Color(0xFF7DA2FF).withValues(alpha: 0.0),
            ]),
          ),
        ),
        tile,
      ]),
    );
  }
}

/// Frosted glass card holding auth forms over the blue gradient. Real backdrop
/// blur plus a bright top edge give it a premium, layered-glass feel.
class RiderGlassCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  const RiderGlassCard({super.key, required this.child, this.padding = const EdgeInsets.all(22)});
  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(28),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
        child: Container(
          width: double.infinity,
          padding: padding,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Colors.white.withValues(alpha: 0.97), Colors.white.withValues(alpha: 0.90)],
            ),
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: Colors.white.withValues(alpha: 0.75), width: 1.2),
            boxShadow: [
              BoxShadow(color: AppColors.primaryDark.withValues(alpha: 0.28), blurRadius: 50, offset: const Offset(0, 24)),
              BoxShadow(color: Colors.black.withValues(alpha: 0.10), blurRadius: 14, offset: const Offset(0, 6)),
            ],
          ),
          child: child,
        ),
      ),
    );
  }
}

/// Premium blue backdrop: deep royal gradient, layered soft blobs, a radial
/// halo of light and a faint conic sheen for depth.
class RiderAuthBackdrop extends StatelessWidget {
  final Widget child;
  const RiderAuthBackdrop({super.key, required this.child});
  @override
  Widget build(BuildContext context) {
    return Stack(children: [
      // Base deep-royal gradient.
      const Positioned.fill(
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF2E56D8), Color(0xFF16308F), Color(0xFF0A1747)],
              stops: [0.0, 0.55, 1.0],
            ),
          ),
        ),
      ),
      // Warm halo of light from the top, lifting the logo area.
      Positioned.fill(
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: const Alignment(0, -0.75),
              radius: 1.1,
              colors: [const Color(0xFF6D8FF5).withValues(alpha: 0.45), Colors.transparent],
            ),
          ),
        ),
      ),
      // Soft colour blobs.
      Positioned(top: -70, right: -50, child: _blob(240, const Color(0xFF8FB0FF).withValues(alpha: 0.30))),
      Positioned(bottom: -90, left: -60, child: _blob(300, const Color(0xFF38BDF8).withValues(alpha: 0.28))),
      Positioned(top: 150, left: -70, child: _blob(170, AppColors.accent.withValues(alpha: 0.20))),
      Positioned(bottom: 120, right: -40, child: _blob(160, const Color(0xFF22D3EE).withValues(alpha: 0.16))),
      // Subtle sheen sweeping across the top.
      Positioned(
        top: -40, left: -20, right: -20,
        child: Container(
          height: 260,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Colors.white.withValues(alpha: 0.10), Colors.transparent],
            ),
          ),
        ),
      ),
      Positioned.fill(child: child),
    ]);
  }

  Widget _blob(double d, Color c) => Container(
        height: d,
        width: d,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(colors: [c, c.withValues(alpha: 0)]),
        ),
      );
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
