import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../data/mock_data.dart';
import '../theme/app_theme.dart';

IconData categoryIcon(String category) {
  switch (category) {
    case 'Electronics':
      return Icons.devices_other_rounded;
    case 'Fashion':
      return Icons.checkroom_rounded;
    case 'Home':
      return Icons.chair_rounded;
    case 'Beauty':
      return Icons.spa_rounded;
    case 'Sports':
      return Icons.sports_basketball_rounded;
    case 'Books':
      return Icons.menu_book_rounded;
    default:
      return Icons.shopping_bag_rounded;
  }
}

/// A premium product visual that renders a soft, on-brand gradient tile with the
/// product's category glyph so the UI is beautiful and fully self-contained.
/// If a network image is available (real device / online), it fades in on top.
class ProductImage extends StatelessWidget {
  final Product product;
  final double? iconSize;
  final BoxFit fit;

  const ProductImage({
    super.key,
    required this.product,
    this.iconSize,
    this.fit = BoxFit.cover,
  });

  @override
  Widget build(BuildContext context) {
    final grad = AppColors.tileGradients[product.id % AppColors.tileGradients.length];
    final accent = grad.last;
    final glyph = categoryIcon(product.category);

    return LayoutBuilder(
      builder: (context, c) {
        final size = iconSize ?? (c.maxWidth.isFinite ? c.maxWidth * 0.42 : 64.0);
        return Stack(
          fit: StackFit.expand,
          children: [
            // Base gradient
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: grad,
                ),
              ),
            ),
            // Decorative soft circles
            Positioned(
              top: -18,
              right: -18,
              child: _blob(64, Colors.white.withValues(alpha: 0.35)),
            ),
            Positioned(
              bottom: -24,
              left: -10,
              child: _blob(72, accent.withValues(alpha: 0.35)),
            ),
            // Category glyph
            Center(
              child: Icon(
                glyph,
                size: size,
                color: AppColors.primary.withValues(alpha: 0.42),
              ),
            ),
            // Real photo when reachable — fades over the gradient.
            Positioned.fill(
              child: CachedNetworkImage(
                imageUrl: product.image,
                fit: fit,
                fadeInDuration: const Duration(milliseconds: 350),
                placeholder: (_, __) => const SizedBox.shrink(),
                errorWidget: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _blob(double d, Color color) => Container(
        width: d,
        height: d,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      );
}
