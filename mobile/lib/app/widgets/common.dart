import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../core/services/session_service.dart';
import '../core/services/shop_service.dart';
import '../core/theme/app_theme.dart';
import '../data/models/models.dart';
import '../routes/app_routes.dart';

/// Picks the string matching the active locale.
String tx(String en, String fr) =>
    (Get.locale?.languageCode ?? 'fr') == 'fr' ? fr : en;

extension ProductL10n on Product {
  String get name => tx(nameEn, nameFr);
  String get description => tx(descriptionEn, descriptionFr);
}

extension CategoryL10n on Category {
  String get name => tx(nameEn, nameFr);
  List<String> get subcategories =>
      tx('en', 'fr') == 'fr' ? subcategoriesFr : subcategoriesEn;
}

extension WalletL10n on WalletEntry {
  String get description => tx(descriptionEn, descriptionFr);
}

extension NotificationL10n on AppNotification {
  String get title => tx(titleEn, titleFr);
  String get body => tx(bodyEn, bodyFr);
}

String mockImageUrl(String seed, {int w = 600, int h = 600}) =>
    'https://picsum.photos/seed/$seed/$w/$h';

String formatDate(DateTime d) =>
    '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

class NetImage extends StatelessWidget {
  final String seed;
  final double? width;
  final double? height;
  final BoxFit fit;
  final BorderRadius? radius;

  const NetImage({
    super.key,
    required this.seed,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.radius,
  });

  @override
  Widget build(BuildContext context) {
    final image = CachedNetworkImage(
      imageUrl: mockImageUrl(seed),
      width: width,
      height: height,
      fit: fit,
      placeholder: (_, __) => Container(color: AppColors.primaryLight),
      errorWidget: (_, __, ___) => Container(
        color: AppColors.primaryLight,
        alignment: Alignment.center,
        child: const Icon(Icons.image_outlined, color: AppColors.primary),
      ),
    );
    if (radius != null) {
      return ClipRRect(borderRadius: radius!, child: image);
    }
    return image;
  }
}

class RatingStars extends StatelessWidget {
  final double rating;
  final double size;

  const RatingStars({super.key, required this.rating, this.size = 14});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (i) {
        final filled = rating >= i + 0.75;
        final half = !filled && rating >= i + 0.25;
        return Icon(
          filled
              ? Icons.star_rounded
              : half
                  ? Icons.star_half_rounded
                  : Icons.star_outline_rounded,
          size: size,
          color: AppColors.warning,
        );
      }),
    );
  }
}

class SectionHeader extends StatelessWidget {
  final String title;
  final VoidCallback? onSeeAll;

  const SectionHeader({super.key, required this.title, this.onSeeAll});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 8, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: AppColors.ink,
              ),
            ),
          ),
          if (onSeeAll != null)
            TextButton(onPressed: onSeeAll, child: Text('see_all'.tr)),
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  const EmptyState({
    super.key,
    required this.icon,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircleAvatar(
              radius: 36,
              backgroundColor: AppColors.primaryLight,
              child: Icon(icon, size: 36, color: AppColors.primary),
            ),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.muted, fontSize: 15),
            ),
            if (actionLabel != null) ...[
              const SizedBox(height: 20),
              FilledButton(
                style: FilledButton.styleFrom(
                  minimumSize: const Size(200, 48),
                ),
                onPressed: onAction,
                child: Text(actionLabel!),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class QtyStepper extends StatelessWidget {
  final int quantity;
  final ValueChanged<int> onDelta;

  const QtyStepper({super.key, required this.quantity, required this.onDelta});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            visualDensity: VisualDensity.compact,
            icon: const Icon(Icons.remove, size: 18),
            onPressed: () => onDelta(-1),
          ),
          Text('$quantity',
              style: const TextStyle(fontWeight: FontWeight.w700)),
          IconButton(
            visualDensity: VisualDensity.compact,
            icon: const Icon(Icons.add, size: 18),
            onPressed: () => onDelta(1),
          ),
        ],
      ),
    );
  }
}

Color statusColor(OrderStatus status) {
  switch (status) {
    case OrderStatus.delivered:
    case OrderStatus.completed:
      return AppColors.success;
    case OrderStatus.cancelled:
    case OrderStatus.deliveryFailed:
      return AppColors.danger;
    case OrderStatus.returnRequested:
    case OrderStatus.returned:
    case OrderStatus.refunded:
      return AppColors.warning;
    default:
      return AppColors.primary;
  }
}

class StatusChip extends StatelessWidget {
  final OrderStatus status;

  const StatusChip({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final color = statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        status.trKey.tr,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class ProductCard extends StatelessWidget {
  final Product product;
  final double width;

  const ProductCard({super.key, required this.product, this.width = 160});

  @override
  Widget build(BuildContext context) {
    final session = Get.find<SessionService>();
    final shop = Get.find<ShopService>();
    return SizedBox(
      width: width,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => Get.toNamed(AppRoutes.product, arguments: product),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Stack(
                children: [
                  NetImage(
                      seed: product.imageSeeds.first,
                      width: double.infinity,
                      height: width * 0.82),
                  if (product.discountPercent > 0)
                    Positioned(
                      top: 8,
                      left: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.brandRed,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          '-${product.discountPercent}%',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                  Positioned(
                    top: 4,
                    right: 4,
                    child: Obx(
                      () => IconButton(
                        visualDensity: VisualDensity.compact,
                        icon: Icon(
                          shop.wishlist.contains(product.id)
                              ? Icons.favorite
                              : Icons.favorite_border,
                          color: AppColors.brandRed,
                          size: 20,
                        ),
                        onPressed: () => shop.toggleWishlist(product),
                      ),
                    ),
                  ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.all(10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      product.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w600, height: 1.2),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        RatingStars(rating: product.rating, size: 12),
                        const SizedBox(width: 4),
                        Text(
                          '(${product.reviewCount})',
                          style: const TextStyle(
                              fontSize: 11, color: AppColors.muted),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Obx(
                      () => Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Flexible(
                            child: Text(
                              session.money(product.price),
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                                color: AppColors.primary,
                              ),
                            ),
                          ),
                          if (product.originalPrice != null) ...[
                            const SizedBox(width: 6),
                            Flexible(
                              child: Text(
                                session.money(product.originalPrice!),
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: AppColors.muted,
                                  decoration: TextDecoration.lineThrough,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
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
