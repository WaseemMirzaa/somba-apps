import 'package:flutter/material.dart';
import '../data/shop_state.dart';
import '../services/realtime_store.dart';
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

  /// Lines removed / reduced because stock ran out, shown until dismissed.
  final List<String> _stockNotices = [];

  @override
  void dispose() {
    _promoCtrl.dispose();
    super.dispose();
  }

  /// The SERVER validates the code (and applies it again when the order is placed).
  Future<void> _applyPromo() async {
    final code = _promoCtrl.text.trim();
    if (code.isEmpty) return;
    final messenger = ScaffoldMessenger.of(context);
    final error = await shop.applyPromo(code);
    if (!mounted) return;
    setState(() {});
    messenger.showSnackBar(SnackBar(content: Text(error ?? Strings.of(context).promoApplied(shop.appliedPromo!.code))));
  }

  /// A cart change invalidates a previewed discount: re-check it.
  void _cartChanged() {
    shop.save();
    setState(() {});
    shop.revalidatePromo().then((_) {
      if (mounted) setState(() {});
    });
  }

  /// Remove a line, with Undo for a few seconds.
  void _remove(int i) {
    final s = Strings.of(context);
    final removed = shop.removeAt(i);
    _cartChanged();
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        persist: false, // auto-dismiss (a SnackBar with an action would otherwise stay until dismissed)
        content: Text(s.cartRemoved(removed.product.displayName(s.lang))),
        action: SnackBarAction(
          label: s.undo,
          onPressed: () {
            shop.restoreLine(i, removed);
            _cartChanged();
          },
        ),
      ));
  }

  void _saveForLater(int i) {
    final s = Strings.of(context);
    final name = shop.cart[i].product.displayName(s.lang);
    shop.saveForLater(i);
    _cartChanged();
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(s.cartSavedForLater(name))));
  }

  void _moveToCart(int i) {
    final s = Strings.of(context);
    final item = shop.savedForLater[i];
    final added = shop.moveToCart(i);
    _cartChanged();
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
          content: Text(added == 0 ? s.cartStockCap(item.product.stock) : s.cartMovedToCart(item.product.displayName(s.lang)))));
  }

  @override
  Widget build(BuildContext context) {
    // Prices/stock follow the live catalogue pushed by the server.
    return ListenableBuilder(listenable: RealtimeStore.instance, builder: (_, __) {
      shop.syncWithCatalog();
      _stockNotices.addAll(shop.takeStockNotices());
      return _scaffold(context);
    });
  }

  Widget _scaffold(BuildContext context) {
    final s = Strings.of(context);
    final lang = s.lang;
    final empty = shop.cart.isEmpty;

    return Scaffold(
      appBar: AppBar(
        title: Text('${s.cart}  (${shop.cartCount})'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: Column(children: [
        if (_stockNotices.isNotEmpty) _stockBanner(),
        Expanded(child: empty && shop.savedForLater.isEmpty ? _emptyState(s) : _cartList(s, lang)),
      ]),
      bottomNavigationBar: empty ? null : _summaryBar(s),
    );
  }

  /// Why lines disappeared or shrank since the shopper last looked (stock ran out).
  Widget _stockBanner() {
    return Container(
      key: const ValueKey('cart-stock-notice'),
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
      decoration: BoxDecoration(
        color: AppColors.amber.withValues(alpha: 0.12),
        borderRadius: AppRadius.card,
        border: Border.all(color: AppColors.amber.withValues(alpha: 0.45)),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Padding(
          padding: EdgeInsets.only(top: 2),
          child: Icon(Icons.inventory_2_outlined, size: 20, color: AppColors.amber),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            for (final n in _stockNotices)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Text(n, style: const TextStyle(color: AppColors.inkSoft, fontSize: 13, fontWeight: FontWeight.w600)),
              ),
          ]),
        ),
        IconButton(
          key: const ValueKey('cart-stock-notice-close'),
          visualDensity: VisualDensity.compact,
          tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
          icon: const Icon(Icons.close_rounded, size: 18, color: AppColors.muted),
          onPressed: () => setState(_stockNotices.clear),
        ),
      ]),
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
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
      children: [
        if (shop.cart.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Center(child: Text(s.cartEmpty, style: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w600))),
          ),
        for (var i = 0; i < shop.cart.length; i++) ...[
          _cartLine(s, lang, i),
          const SizedBox(height: 12),
        ],
        if (shop.savedForLater.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(s.cartSavedSection(shop.savedForLater.length),
              key: const ValueKey('saved-for-later-title'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 10),
          for (var i = 0; i < shop.savedForLater.length; i++) ...[
            _savedLine(s, lang, i),
            const SizedBox(height: 10),
          ],
        ],
      ],
    );
  }

  Widget _savedLine(Strings s, String lang, int i) {
    final item = shop.savedForLater[i];
    final soldOut = item.product.stock <= 0;
    return Container(
      key: ValueKey('saved-${item.product.id}-${item.variant}'),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: AppRadius.card, border: Border.all(color: AppColors.line)),
      child: Row(children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(height: 56, width: 56, child: ProductImage(product: item.product, iconSize: 24)),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(item.product.displayName(lang), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
            const SizedBox(height: 2),
            Text(soldOut ? s.pdOutOfStock : money(item.product.price),
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, color: soldOut ? AppColors.danger : AppColors.primary)),
            Row(children: [
              TextButton(
                key: ValueKey('move-to-cart-${item.product.id}'),
                style: TextButton.styleFrom(padding: EdgeInsets.zero, visualDensity: VisualDensity.compact),
                onPressed: soldOut ? null : () => _moveToCart(i),
                child: Text(s.cartMoveToCart),
              ),
              const SizedBox(width: 12),
              TextButton(
                style: TextButton.styleFrom(padding: EdgeInsets.zero, visualDensity: VisualDensity.compact, foregroundColor: AppColors.muted),
                onPressed: () {
                  shop.removeSaved(i);
                  _cartChanged();
                },
                child: Text(s.cartRemove),
              ),
            ]),
          ]),
        ),
      ]),
    );
  }

  Widget _cartLine(Strings s, String lang, int i) {
    final item = shop.cart[i];
        return Dismissible(
          key: ValueKey('${item.product.id}-${item.variant}'),
          direction: DismissDirection.endToStart,
          onDismissed: (_) => _remove(i),
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
                      Text(item.variantText(s),
                          style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                      if ((item.product.sellerName ?? '').isNotEmpty)
                        Text(s.soldBy(item.product.sellerName),
                            key: ValueKey('cart-sold-by-${item.product.id}'),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: AppColors.muted, fontSize: 12, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Text(money(item.product.price),
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800, fontSize: 15, color: AppColors.primary)),
                          if (item.product.strikePrice != null) ...[
                            const SizedBox(width: 6),
                            Flexible(
                              child: Text(money(item.product.strikePrice!),
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 12, color: AppColors.faint, decoration: TextDecoration.lineThrough)),
                            ),
                          ],
                          const Spacer(),
                          QuantityStepper(
                            value: item.qty,
                            onChanged: (v) {
                              item.qty = v.clamp(1, item.product.stock < 1 ? 1 : item.product.stock);
                              _cartChanged();
                            },
                          ),
                        ],
                      ),
                      if (item.product.stock <= 5)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(s.cartOnlyLeft(item.product.stock),
                              key: ValueKey('cart-low-stock-${item.product.id}'),
                              style: const TextStyle(color: Color(0xFFB45309), fontSize: 12, fontWeight: FontWeight.w700)),
                        ),
                      if (item.priceChange != 0)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                              item.priceChange < 0 ? s.cartPriceDown(money(item.priceWhenAdded!)) : s.cartPriceUp(money(item.priceWhenAdded!)),
                              key: ValueKey('cart-price-change-${item.product.id}'),
                              style: TextStyle(
                                  color: item.priceChange < 0 ? AppColors.success : AppColors.danger, fontSize: 12, fontWeight: FontWeight.w700)),
                        ),
                      Row(children: [
                        TextButton.icon(
                          key: ValueKey('save-later-${item.product.id}'),
                          style: TextButton.styleFrom(padding: EdgeInsets.zero, visualDensity: VisualDensity.compact),
                          onPressed: () => _saveForLater(i),
                          icon: const Icon(Icons.bookmark_add_outlined, size: 17),
                          label: Text(s.cartSaveLater, style: const TextStyle(fontSize: 12.5)),
                        ),
                        const SizedBox(width: 14),
                        TextButton.icon(
                          key: ValueKey('remove-${item.product.id}'),
                          style: TextButton.styleFrom(padding: EdgeInsets.zero, visualDensity: VisualDensity.compact, foregroundColor: AppColors.muted),
                          onPressed: () => _remove(i),
                          icon: const Icon(Icons.delete_outline_rounded, size: 17),
                          label: Text(s.cartRemove, style: const TextStyle(fontSize: 12.5)),
                        ),
                      ]),
                    ],
                  ),
                ),
              ],
            ),
          ),
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
          if (_savings > 0)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Align(
                alignment: Alignment.centerRight,
                child: Text(s.youSave(money(_savings)),
                    key: const ValueKey('cart-savings'),
                    style: const TextStyle(fontSize: 12, color: AppColors.success, fontWeight: FontWeight.w700)),
              ),
            ),
          const SizedBox(height: 6),
          _row(s.delivery, deliveryFee == 0 ? s.free.toUpperCase() : money(deliveryFee)),
          if (discount > 0) ...[
            const SizedBox(height: 6),
            _row(s.promoRow(shop.appliedPromo!.code), '- ${money(discount)}'),
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

  /// What the shopper saves compared with the old prices (information only: the totals already use the charged prices).
  double get _savings => shop.cart.fold(0.0, (sum, i) => sum + ((i.product.strikePrice ?? i.product.price) - i.product.price) * i.qty);

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
