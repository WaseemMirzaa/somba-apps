import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Premium surface card — white background, 1px hairline border, rounded
/// corners and a soft layered shadow. Mirrors the web `.card-premium` style.
///
/// When [onTap] is provided the card shows an ink ripple clipped to its
/// rounded corners.
class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;
  final Color? color;
  final double radius;
  final List<BoxShadow> shadow;
  final Border? border;

  const AppCard({
    super.key,
    required this.child,
    this.padding,
    this.onTap,
    this.color,
    this.radius = AppRadius.card,
    this.shadow = AppShadows.sm,
    this.border,
  });

  @override
  Widget build(BuildContext context) {
    final corners = BorderRadius.circular(radius);

    // Outer box carries the shadow only; the Material clips the surface and
    // ink ripple while the inner box paints the hairline border on top.
    return DecoratedBox(
      decoration: BoxDecoration(borderRadius: corners, boxShadow: shadow),
      child: Material(
        color: color ?? AppColors.surface,
        clipBehavior: Clip.antiAlias,
        borderRadius: corners,
        child: InkWell(
          onTap: onTap,
          child: Ink(
            decoration: BoxDecoration(
              borderRadius: corners,
              border: border ?? Border.all(color: AppColors.border),
            ),
            child: Padding(
              padding: padding ?? EdgeInsets.zero,
              child: child,
            ),
          ),
        ),
      ),
    );
  }
}
