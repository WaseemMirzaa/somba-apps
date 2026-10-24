import 'package:flutter/material.dart';
import '../data/catalog_models.dart';
import '../data/shop_state.dart';
import '../l10n/strings.dart';
import '../screens/cart_screen.dart';
import '../screens/product_detail_screen.dart';
import 'product_card.dart';

/// Open the product page (shared by every grid of product cards).
void openProduct(BuildContext context, Product p, Locale locale) {
  Navigator.push(context, MaterialPageRoute(builder: (_) => ProductDetailScreen(product: p, locale: locale)));
}

/// Quick "+" on a card: add one to the cart (stock permitting) and confirm with
/// a snackbar that links to the cart. [after] lets the caller refresh its own cart badge.
void addProductToCart(BuildContext context, Product p, Locale locale, {VoidCallback? after}) {
  // A size/colour must be chosen first: open the product instead of guessing.
  if (p.variants.isNotEmpty) {
    openProduct(context, p, locale);
    return;
  }
  final added = ShopState.instance.addToCart(p);
  after?.call();
  final s = Strings(locale.languageCode);
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      persist: false, // auto-dismiss (a SnackBar with an action would otherwise stay until dismissed)
      content: Text(added == 0 ? s.cartStockCap(p.stock) : '${p.displayName(locale.languageCode)} — ${s.addedToCart}'),
      action: SnackBarAction(
        label: s.cart,
        onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => CartScreen(locale: locale))),
      ),
    ));
}

/// A [ProductCard] that opens the product on tap and adds to the cart on "+".
Widget productCard(BuildContext context, Product p, Locale locale, {VoidCallback? afterAdd}) => ProductCard(
      product: p,
      lang: locale.languageCode,
      onTap: () => openProduct(context, p, locale),
      onAdd: () => addProductToCart(context, p, locale, after: afterAdd),
    );
