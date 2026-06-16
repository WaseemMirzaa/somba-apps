import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';

/// Tinted pill badge variants, mirroring `web/src/components/ui/badge.tsx`.
enum BadgeTone { neutral, primary, royal, success, warning, danger, amber }

class AppBadge extends StatelessWidget {
  final String label;
  final BadgeTone tone;
  final IconData? icon;

  const AppBadge(this.label, {super.key, this.tone = BadgeTone.neutral, this.icon});

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = _palette(tone);
    return Container(
      padding: EdgeInsets.symmetric(horizontal: icon != null ? 8 : 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: fg),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: GoogleFonts.inter(fontSize: 11.5, fontWeight: FontWeight.w700, color: fg),
          ),
        ],
      ),
    );
  }

  (Color, Color) _palette(BadgeTone tone) {
    switch (tone) {
      case BadgeTone.primary:
        return (AppColors.primaryLight, AppColors.primaryHover);
      case BadgeTone.royal:
        return (AppColors.royalTint, AppColors.royal);
      case BadgeTone.success:
        return (AppColors.successLight, AppColors.success);
      case BadgeTone.warning:
        return (AppColors.warningLight, AppColors.warning);
      case BadgeTone.danger:
        return (AppColors.primaryLight, AppColors.danger);
      case BadgeTone.amber:
        return (AppColors.amberLight, AppColors.amberText);
      case BadgeTone.neutral:
        return (AppColors.surfaceMuted, AppColors.slate600);
    }
  }
}

/// Uppercase eyebrow label pill (web `.section-label`).
class SectionLabel extends StatelessWidget {
  final String label;
  final IconData? icon;
  final bool light;

  const SectionLabel(this.label, {super.key, this.icon, this.light = false});

  @override
  Widget build(BuildContext context) {
    final bg = light ? Colors.white.withValues(alpha: 0.18) : AppColors.primaryLight;
    final fg = light ? Colors.white : AppColors.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppRadius.pill),
        border: Border.all(color: light ? Colors.white.withValues(alpha: 0.25) : AppColors.primaryTint),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: fg),
            const SizedBox(width: 6),
          ],
          Text(
            label.toUpperCase(),
            style: GoogleFonts.inter(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}
