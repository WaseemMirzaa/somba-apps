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
    case 'Jewelery':
      return Icons.diamond_rounded;
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
    final glyph = categoryIcon(product.category);

    return LayoutBuilder(
      builder: (context, c) {
        final size = iconSize ?? (c.maxWidth.isFinite ? c.maxWidth * 0.42 : 64.0);
        final pad = c.maxHeight.isFinite ? c.maxHeight * 0.10 : 12.0;
        return Stack(
          fit: StackFit.expand,
          children: [
            // Clean, catalogue-style light backdrop for the professional photo.
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xFFFFFFFF), Color(0xFFF3F4F8)],
                ),
              ),
            ),
            // Real product photo (white-background studio shot).
            Padding(
              padding: EdgeInsets.all(pad),
              child: Image.asset(
                'assets/products/${product.id}.jpg',
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
}
