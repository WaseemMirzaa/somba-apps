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

  const ProductImage({
    super.key,
    required this.product,
    this.iconSize,
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
            // Bundled 3D product image, centred on the gradient tile. Falls
            // back to the category glyph if the asset is missing.
            Padding(
              padding: EdgeInsets.all(c.maxHeight.isFinite ? c.maxHeight * 0.14 : 16),
              child: Image.asset(
                'assets/products/${product.id}.png',
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => Center(
                  child: Icon(glyph, size: size, color: AppColors.primary.withValues(alpha: 0.42)),
                ),
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
