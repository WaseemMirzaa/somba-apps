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
            // Real product photo (white-background studio shot). Prefer the
            // live network image; fall back to a bundled asset (offline mock
            // ids 1–12); finally a category glyph.
            Padding(
              padding: EdgeInsets.all(pad),
              child: _photo(size, glyph),
            ),
          ],
        );
      },
    );
  }

  Widget _glyph(double size, IconData glyph) => Center(
        child: Icon(glyph, size: size, color: AppColors.primary.withValues(alpha: 0.42)),
      );

  Widget _photo(double size, IconData glyph) {
    final url = product.image;
    if (url.isNotEmpty && (url.startsWith('http://') || url.startsWith('https://'))) {
      return CachedNetworkImage(
        imageUrl: url,
        fit: BoxFit.contain,
        placeholder: (_, __) => _glyph(size, glyph),
        errorWidget: (_, __, ___) => _assetOrGlyph(size, glyph),
      );
    }
    return _assetOrGlyph(size, glyph);
  }

  Widget _assetOrGlyph(double size, IconData glyph) => Image.asset(
        'assets/products/${product.id}.jpg',
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) => _glyph(size, glyph),
      );
}
