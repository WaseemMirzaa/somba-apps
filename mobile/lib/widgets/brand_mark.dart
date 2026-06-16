import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';

/// Somba & Tekka brand lockup — a royal-blue shopping-bag tile with the
/// signature red accent stripe, paired with the wordmark (red ampersand).
///
/// Mirrors `web/src/components/landing/brand-mark.tsx`.
class BrandMark extends StatelessWidget {
  /// Render the full "Somba & Tekka" lockup instead of just "Somba".
  final bool full;

  /// Render only the icon tile, no wordmark.
  final bool iconOnly;

  /// Light wordmark for use on dark / gradient backgrounds.
  final bool light;

  /// Size of the square icon tile.
  final double size;

  const BrandMark({
    super.key,
    this.full = false,
    this.iconOnly = false,
    this.light = false,
    this.size = 38,
  });

  @override
  Widget build(BuildContext context) {
    final tile = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: AppGradients.royalTile,
        borderRadius: BorderRadius.circular(size * 0.3),
        boxShadow: [
          BoxShadow(
            color: AppColors.royal.withValues(alpha: 0.28),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Stack(
        children: [
          Center(
            child: Icon(Icons.shopping_bag_outlined, color: Colors.white, size: size * 0.5),
          ),
          // Signature red accent stripe down the right edge.
          Positioned(
            top: 0,
            bottom: 0,
            right: 0,
            child: Container(width: size * 0.12, color: AppColors.primary),
          ),
        ],
      ),
    );

    if (iconOnly) return tile;

    final wordColor = light ? Colors.white : AppColors.royal;
    final wordStyle = GoogleFonts.plusJakartaSans(
      fontSize: size * 0.52,
      fontWeight: FontWeight.w800,
      letterSpacing: -0.6,
      color: wordColor,
    );

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        tile,
        SizedBox(width: size * 0.26),
        if (full)
          Text.rich(
            TextSpan(
              style: wordStyle,
              children: const [
                TextSpan(text: 'Somba '),
                TextSpan(text: '& ', style: TextStyle(color: AppColors.primary)),
                TextSpan(text: 'Tekka'),
              ],
            ),
          )
        else
          Text('Somba', style: wordStyle),
      ],
    );
  }
}
