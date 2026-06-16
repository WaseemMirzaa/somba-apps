import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../data/mock_data.dart';
import '../data/shop_state.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../widgets/app_badge.dart';
import '../widgets/app_card.dart';
import '../widgets/price_text.dart';
import 'checkout_screen.dart';

class ProductDetailScreen extends StatefulWidget {
  final Product product;
  final Locale locale;

  const ProductDetailScreen({super.key, required this.product, required this.locale});

  @override
  State<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends State<ProductDetailScreen> {
  @override
  void initState() {
    super.initState();
    ShopState.instance.addRecentlyViewed(widget.product.id);
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings(widget.locale.languageCode);
    final p = widget.product;
    final saved = ShopState.instance.isInWishlist(p.id);

    return Scaffold(
      appBar: AppBar(
        title: Text(p.displayName(widget.locale.languageCode), overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(
            icon: Icon(
              saved ? Icons.favorite : Icons.favorite_border,
              color: saved ? AppColors.primary : AppColors.slate600,
            ),
            onPressed: () => setState(() => ShopState.instance.toggleWishlist(p.id)),
          ),
          IconButton(
            icon: const Icon(Icons.share_outlined, color: AppColors.slate600),
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.linkCopied))),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Image
                  Stack(
                    children: [
                      AspectRatio(
                        aspectRatio: 1,
                        child: DecoratedBox(
                          decoration: const BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [AppColors.surfaceMuted, AppColors.royalTint],
                            ),
                          ),
                          child: CachedNetworkImage(imageUrl: p.image, fit: BoxFit.cover),
                        ),
                      ),
                      if (p.discount > 0)
                        Positioned(
                          left: 16,
                          top: 16,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: AppColors.primary,
                              borderRadius: BorderRadius.circular(10),
                              boxShadow: AppShadows.md,
                            ),
                            child: Text(
                              '-${p.discount}%',
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13),
                            ),
                          ),
                        ),
                    ],
                  ),

                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(p.displayName(widget.locale.languageCode), style: Theme.of(context).textTheme.headlineSmall),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: AppColors.amberLight,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.star_rounded, size: 16, color: AppColors.amber),
                                  const SizedBox(width: 3),
                                  Text(
                                    '${p.rating}',
                                    style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.amberText),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text('${p.reviews} ${s.reviews}', style: const TextStyle(color: AppColors.slate500)),
                          ],
                        ),
                        const SizedBox(height: 16),

                        // Price
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            PriceText(
                              amount: p.price,
                              style: Theme.of(context).textTheme.displaySmall!.copyWith(color: AppColors.slate900),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            if (p.originalPrice > p.price)
                              Text(
                                formatUsd(p.originalPrice),
                                style: const TextStyle(
                                  color: AppColors.slate400,
                                  decoration: TextDecoration.lineThrough,
                                  fontSize: 15,
                                ),
                              ),
                            if (p.originalPrice > p.price) const SizedBox(width: 8),
                            if (p.discount > 0)
                              AppBadge(
                                '${p.discount}% ${widget.locale.languageCode == 'fr' ? 'remise' : 'off'}',
                                tone: BadgeTone.danger,
                              ),
                          ],
                        ),
                        const SizedBox(height: 16),

                        // Delivery info
                        AppCard(
                          color: AppColors.successLight,
                          border: Border.all(color: AppColors.successLight),
                          padding: const EdgeInsets.all(14),
                          child: Row(
                            children: [
                              const Icon(Icons.local_shipping_outlined, color: AppColors.success, size: 22),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      s.deliveryInDays,
                                      style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.success),
                                    ),
                                    Text(
                                      s.freeDelivery,
                                      style: const TextStyle(color: AppColors.success, fontSize: 12.5),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 20),

                        Text(s.description, style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 8),
                        Text(
                          s.productBlurb,
                          style: const TextStyle(color: AppColors.slate600, height: 1.55, fontSize: 14),
                        ),
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            _TrustChip(icon: Icons.verified_outlined, label: s.securePayment),
                            _TrustChip(icon: Icons.replay_rounded, label: widget.locale.languageCode == 'fr' ? 'Retours 7j' : '7-day returns'),
                            _TrustChip(icon: Icons.workspace_premium_outlined, label: widget.locale.languageCode == 'fr' ? 'Garantie' : 'Warranty'),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Sticky action bar
          Container(
            padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + MediaQuery.of(context).padding.bottom),
            decoration: const BoxDecoration(
              color: AppColors.surface,
              boxShadow: AppShadows.md,
            ),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () {
                      ShopState.instance.addToCart(p);
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.addedToCart)));
                    },
                    icon: const Icon(Icons.add_shopping_cart_rounded, size: 18),
                    label: Text(s.addToCart),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: () {
                      ShopState.instance.addToCart(p);
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => CheckoutScreen(locale: widget.locale)),
                      );
                    },
                    child: Text(s.buyNow),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TrustChip extends StatelessWidget {
  final IconData icon;
  final String label;
  const _TrustChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(AppRadius.pill),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: AppColors.royal),
          const SizedBox(width: 6),
          Text(label, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.slate700)),
        ],
      ),
    );
  }
}
