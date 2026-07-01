import 'package:flutter/material.dart';
import '../data/mock_data.dart';
import '../data/shop_state.dart';
import '../theme/app_theme.dart';
import '../util/format.dart';
import 'common.dart';
import 'product_image.dart';

/// Premium grid product card: image tile, wishlist heart, discount badge,
/// rating, name, price with strikethrough and a quick add button.
class ProductCard extends StatefulWidget {
  final Product product;
  final String lang;
  final VoidCallback? onTap;
  final VoidCallback? onAdd;

  const ProductCard({
    super.key,
    required this.product,
    required this.lang,
    this.onTap,
    this.onAdd,
  });

  @override
  State<ProductCard> createState() => _ProductCardState();
}

class _ProductCardState extends State<ProductCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    final shop = ShopState.instance;
    final wished = shop.wishlist.contains(p.id);

    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1,
        duration: const Duration(milliseconds: 120),
        child: Container(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: AppRadius.card,
            boxShadow: AppShadow.card,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Stack(
                  children: [
                    ClipRRect(
                      borderRadius:
                          const BorderRadius.vertical(top: Radius.circular(20)),
                      child: SizedBox.expand(child: ProductImage(product: p)),
                    ),
                    if (p.discount > 0)
                      Positioned(
                        top: 10,
                        left: 10,
                        child: Pill('-${p.discount}%', color: AppColors.accent),
                      ),
                    Positioned(
                      top: 6,
                      right: 6,
                      child: CircleIconButton(
                        icon: wished
                            ? Icons.favorite_rounded
                            : Icons.favorite_border_rounded,
                        color: wished ? AppColors.accent : AppColors.muted,
                        background: Colors.white.withValues(alpha: 0.9),
                        onTap: () {
                          setState(() {
                            wished
                                ? shop.wishlist.remove(p.id)
                                : shop.wishlist.add(p.id);
                          });
                        },
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      p.displayName(widget.lang),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        height: 1.25,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        RatingPill(p.rating),
                        const SizedBox(width: 5),
                        Flexible(
                          child: Text(
                            '(${compact(p.reviews)})',
                            style: const TextStyle(
                                fontSize: 11.5, color: AppColors.faint),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                money(p.price),
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.ink,
                                  letterSpacing: -0.3,
                                ),
                              ),
                              if (p.originalPrice > p.price)
                                Text(
                                  money(p.originalPrice),
                                  style: const TextStyle(
                                    fontSize: 11.5,
                                    color: AppColors.faint,
                                    decoration: TextDecoration.lineThrough,
                                  ),
                                ),
                            ],
                          ),
                        ),
                        _AddButton(onTap: widget.onAdd),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AddButton extends StatelessWidget {
  final VoidCallback? onTap;
  const _AddButton({this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: AppColors.brandGradient,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppShadow.lifted,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: const Padding(
            padding: EdgeInsets.all(8),
            child: Icon(Icons.add_rounded, color: Colors.white, size: 20),
          ),
        ),
      ),
    );
  }
}

/// Compact horizontal card used in carousels (recently viewed, etc).
class MiniProductCard extends StatelessWidget {
  final Product product;
  final String lang;
  final VoidCallback? onTap;
  const MiniProductCard({
    super.key,
    required this.product,
    required this.lang,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        width: 130,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 120,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                boxShadow: AppShadow.card,
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: ProductImage(product: product),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              product.displayName(lang),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  fontSize: 12.5, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 2),
            Text(
              money(product.price),
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: AppColors.primary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
