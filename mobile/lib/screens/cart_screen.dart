import 'package:flutter/material.dart';
import '../data/shop_state.dart';
import '../data/promos.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../util/format.dart';
import '../widgets/common.dart';
import '../widgets/product_image.dart';
import 'checkout_screen.dart';

class CartScreen extends StatefulWidget {
  final Locale locale;

  const CartScreen({super.key, required this.locale});

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  final shop = ShopState.instance;
  final _promoCtrl = TextEditingController();

  @override
  void dispose() {
    _promoCtrl.dispose();
    super.dispose();
  }

  void _applyPromo() {
    final code = _promoCtrl.text.trim();
    if (code.isEmpty) return;
    final promo = findPromo(code);
    String msg;
    if (promo == null) {
      msg = 'Invalid promo code';
    } else if (shop.subtotal < promo.minOrderUsd) {
      msg = 'Spend ${money(promo.minOrderUsd)} to use ${promo.code}';
    } else {
      shop.appliedPromo = promo;
      msg = '${promo.code} applied';
    }
    setState(() {});
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings(widget.locale.languageCode);
    final lang = widget.locale.languageCode;
    final empty = shop.cart.isEmpty;

    return Scaffold(
      appBar: AppBar(
        title: Text('${s.cart}  (${shop.cartCount})'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: empty ? _emptyState(s) : _cartList(s, lang),
      bottomNavigationBar: empty ? null : _summaryBar(s),
    );
  }

  Widget _emptyState(Strings s) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            height: 110,
            width: 110,
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.08),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.shopping_bag_outlined, size: 52, color: AppColors.primary),
          ),
          const SizedBox(height: 20),
          Text(s.cartEmpty, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 6),
          Text(s.cartEmptyHint, style: const TextStyle(color: AppColors.muted)),
          const SizedBox(height: 22),
          SizedBox(
            width: 220,
            child: FilledButton(
              onPressed: () => Navigator.pop(context),
              child: Text(s.startShopping),
            ),
          ),
        ],
      ),
    );
  }

  Widget _cartList(Strings s, String lang) {
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
      itemCount: shop.cart.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (_, i) {
        final item = shop.cart[i];
        return Dismissible(
          key: ValueKey('${item.product.id}-${item.variant}'),
          direction: DismissDirection.endToStart,
          onDismissed: (_) => setState(() => shop.cart.removeAt(i)),
          background: Container(
            alignment: Alignment.centerRight,
            padding: const EdgeInsets.only(right: 24),
            decoration: BoxDecoration(
              color: AppColors.accent,
              borderRadius: AppRadius.card,
            ),
            child: const Icon(Icons.delete_outline_rounded, color: Colors.white),
          ),
          child: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: AppRadius.card,
              boxShadow: AppShadow.card,
            ),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: SizedBox(
                    height: 78,
                    width: 78,
                    child: ProductImage(product: item.product, iconSize: 32),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(item.product.displayName(lang),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                      const SizedBox(height: 3),
                      Text(item.variant,
                          style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Text(money(item.product.price),
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800, fontSize: 15, color: AppColors.primary)),
                          const Spacer(),
                          QuantityStepper(
                            value: item.qty,
                            onChanged: (v) => setState(() => item.qty = v),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _summaryBar(Strings s) {
    final deliveryFee = deliveryFeeUsd;
    final discount = shop.promoDiscount(shop.subtotal);
    final total = shop.subtotal + deliveryFee - discount;
    return Container(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 12 + MediaQuery.of(context).padding.bottom),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF1E293B).withValues(alpha: 0.08),
            blurRadius: 20,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Promo row
          Row(
            children: [
              const Icon(Icons.local_offer_rounded, size: 18, color: AppColors.primary),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _promoCtrl,
                  textCapitalization: TextCapitalization.characters,
                  onSubmitted: (_) => _applyPromo(),
                  decoration: InputDecoration(
                    isDense: true,
                    hintText: s.promoHint,
                    border: InputBorder.none,
                    hintStyle: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w500),
                  ),
                ),
              ),
              TextButton(onPressed: _applyPromo, child: Text(s.apply)),
            ],
          ),
          const Divider(height: 18),
          _row(s.subtotal, money(shop.subtotal)),
          const SizedBox(height: 6),
          _row(s.delivery, deliveryFee == 0 ? 'FREE' : money(deliveryFee)),
          if (discount > 0) ...[
            const SizedBox(height: 6),
            _row('Promo ${shop.appliedPromo!.code}', '- ${money(discount)}'),
          ],
          const SizedBox(height: 10),
          _row(s.total, money(total), bold: true),
          const SizedBox(height: 14),
          FilledButton(
            onPressed: () => Navigator.push(context,
                MaterialPageRoute(builder: (_) => CheckoutScreen(locale: widget.locale))),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text('${s.checkout}  ·  ${money(total)}'),
                const SizedBox(width: 6),
                const Icon(Icons.arrow_forward_rounded, size: 20),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _row(String label, String value, {bool bold = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label,
            style: TextStyle(
                fontSize: bold ? 16 : 14,
                fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
                color: bold ? AppColors.ink : AppColors.muted)),
        Text(value,
            style: TextStyle(
                fontSize: bold ? 18 : 14,
                fontWeight: bold ? FontWeight.w800 : FontWeight.w700,
                color: bold ? AppColors.primary : AppColors.ink)),
      ],
    );
  }
}
