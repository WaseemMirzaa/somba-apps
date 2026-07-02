import 'package:flutter/material.dart';
import '../data/mock_data.dart';
import '../data/shop_state.dart';
import '../theme/app_theme.dart';
import '../util/format.dart';
import '../l10n/strings.dart';
import '../screens/product_detail_screen.dart';
import 'common.dart';
import 'product_image.dart';

/// Premium grid product card: image tile, wishlist heart, discount badge,
/// rating, name, price with strikethrough and a quick add button.
class ProductCard extends StatefulWidget {
  final Product product;
  final String lang;
  final VoidCallback? onTap;
  final VoidCallback? onAdd;
  final int? soldPercent;

  const ProductCard({
    super.key,
    required this.product,
    required this.lang,
    this.onTap,
    this.onAdd,
    this.soldPercent,
  });

  @override
  State<ProductCard> createState() => _ProductCardState();
}

class _ProductCardState extends State<ProductCard> {
  bool _pressed = false;

  void _openDetail() {
    Navigator.push(context, MaterialPageRoute(
        builder: (_) => ProductDetailScreen(product: widget.product, locale: Locale(widget.lang))));
  }

  void _quickAdd() {
    setState(() => ShopState.instance.addToCart(widget.product));
    final s = Strings(widget.lang);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text('${widget.product.displayName(widget.lang)} — ${s.addedToCart}')));
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    final shop = ShopState.instance;
    final wished = shop.wishlist.contains(p.id);

    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      onTap: widget.onTap ?? _openDetail,
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
                    if (widget.soldPercent != null) ...[
                      const SizedBox(height: 8),
                      _ClaimBar(percent: widget.soldPercent!, lang: widget.lang),
                    ],
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
                        _AddButton(onTap: widget.onAdd ?? _quickAdd),
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

/// Slim "N% claimed" progress bar used on deal cards to add urgency.
class _ClaimBar extends StatelessWidget {
  final int percent;
  final String lang;
  const _ClaimBar({required this.percent, required this.lang});

  @override
  Widget build(BuildContext context) {
    final p = (percent.clamp(0, 100)) / 100;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(100),
          child: Stack(
            children: [
              Container(height: 6, color: AppColors.accent.withValues(alpha: 0.14)),
              FractionallySizedBox(
                widthFactor: p,
                child: Container(
                  height: 6,
                  decoration: const BoxDecoration(gradient: AppColors.dealGradient),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            const Icon(Icons.local_fire_department_rounded, size: 12, color: AppColors.accent),
            const SizedBox(width: 2),
            Text(
              lang == 'fr' ? '$percent% réclamé' : '$percent% claimed',
              style: const TextStyle(
                fontSize: 10.5,
                fontWeight: FontWeight.w700,
                color: AppColors.accentDark,
              ),
            ),
          ],
        ),
      ],
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
