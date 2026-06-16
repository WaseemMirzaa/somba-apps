import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../data/shop_state.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../widgets/app_card.dart';
import '../widgets/price_text.dart';
import 'checkout_screen.dart';

const double kDeliveryFee = 5.0;

class CartScreen extends StatefulWidget {
  final Locale locale;

  const CartScreen({super.key, required this.locale});

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  final shop = ShopState.instance;

  @override
  Widget build(BuildContext context) {
    final s = Strings(widget.locale.languageCode);
    final lang = widget.locale.languageCode;

    return Scaffold(
      appBar: AppBar(title: Text('${s.cart}  ·  ${shop.cartCount} ${s.items}')),
      body: shop.cart.isEmpty ? _empty(context, s) : _list(context, s, lang),
      bottomNavigationBar: shop.cart.isEmpty ? null : _summary(context, s),
    );
  }

  Widget _empty(BuildContext context, Strings s) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 88,
              height: 88,
              decoration: const BoxDecoration(color: AppColors.surfaceMuted, shape: BoxShape.circle),
              child: const Icon(Icons.shopping_bag_outlined, size: 40, color: AppColors.slate400),
            ),
            const SizedBox(height: 20),
            Text(s.cartEmpty, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(
              s.cartEmptyHint,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.slate500),
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () => Navigator.pop(context),
              child: Text(s.startShopping),
            ),
          ],
        ),
      ),
    );
  }

  Widget _list(BuildContext context, Strings s, String lang) {
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: shop.cart.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (_, i) {
        final item = shop.cart[i];
        return AppCard(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(AppRadius.control),
                child: CachedNetworkImage(
                  imageUrl: item.product.image,
                  width: 74,
                  height: 74,
                  fit: BoxFit.cover,
                  placeholder: (_, __) => Container(width: 74, height: 74, color: AppColors.surfaceMuted),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.product.displayName(lang),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                    ),
                    const SizedBox(height: 3),
                    Text(item.variant, style: const TextStyle(color: AppColors.slate500, fontSize: 12.5)),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _QtyStepper(
                          qty: item.qty,
                          onChanged: (q) => setState(() => shop.setQty(item, q)),
                        ),
                        PriceText(
                          amount: item.product.price * item.qty,
                          showSecondary: false,
                          style: Theme.of(context).textTheme.titleMedium!.copyWith(color: AppColors.slate900),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.close_rounded, size: 18, color: AppColors.slate400),
                onPressed: () => setState(() => shop.removeFromCart(item)),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _summary(BuildContext context, Strings s) {
    final total = shop.subtotal + kDeliveryFee;
    return Container(
      padding: EdgeInsets.fromLTRB(16, 14, 16, 14 + MediaQuery.of(context).padding.bottom),
      decoration: const BoxDecoration(color: AppColors.surface, boxShadow: AppShadows.md),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _row(s.subtotal, formatUsd(shop.subtotal)),
          const SizedBox(height: 6),
          _row(s.delivery, formatUsd(kDeliveryFee)),
          const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: Divider()),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(s.total, style: Theme.of(context).textTheme.titleMedium),
              PriceText(
                amount: total,
                style: Theme.of(context).textTheme.titleLarge!.copyWith(color: AppColors.primary),
              ),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => CheckoutScreen(locale: widget.locale)),
              ).then((_) => setState(() {})),
              icon: const Icon(Icons.lock_outline_rounded, size: 18),
              label: Text(s.checkout),
            ),
          ),
        ],
      ),
    );
  }

  Widget _row(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: AppColors.slate500)),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
      ],
    );
  }
}

class _QtyStepper extends StatelessWidget {
  final int qty;
  final ValueChanged<int> onChanged;
  const _QtyStepper({required this.qty, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(AppRadius.pill),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _btn(Icons.remove_rounded, () => onChanged(qty - 1)),
          SizedBox(
            width: 28,
            child: Text(
              '$qty',
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          _btn(Icons.add_rounded, () => onChanged(qty + 1)),
        ],
      ),
    );
  }

  Widget _btn(IconData icon, VoidCallback onTap) {
    return InkResponse(
      onTap: onTap,
      radius: 20,
      child: Padding(
        padding: const EdgeInsets.all(7),
        child: Icon(icon, size: 16, color: AppColors.primary),
      ),
    );
  }
}
