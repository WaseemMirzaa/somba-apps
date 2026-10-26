import 'package:flutter/material.dart';
import '../data/catalog_models.dart';
import '../data/shop_state.dart';
import '../l10n/strings.dart';
import '../screens/cart_screen.dart';
import '../screens/product_detail_screen.dart';
import '../services/engage_store.dart';
import 'feedback.dart';
import 'product_card.dart';

/// Open the product page (shared by every grid of product cards).
void openProduct(BuildContext context, Product p, Locale locale) {
  EngageStore.instance.trackClick(p); // a promoted product was opened (once per session, silent)
  Navigator.push(context, MaterialPageRoute(builder: (_) => ProductDetailScreen(product: p, locale: locale)));
}

/// Quick "+" on a card: add one to the cart (stock permitting) and confirm with
/// a snackbar that links to the cart. [after] lets the caller refresh its own cart badge.
void addProductToCart(BuildContext context, Product p, Locale locale, {VoidCallback? after}) {
  // A store on vacation takes no new orders (the server refuses too): say so instead of adding.
  if (blockedByVacation(context, p, locale)) return;
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

/// True (after telling the shopper why, in a snackbar) when the product's store is on vacation. Every path that puts a
/// product into the cart should ask this first.
bool blockedByVacation(BuildContext context, Product p, Locale locale) {
  final v = EngageStore.instance.vacationOf(p);
  if (v == null) return false;
  showSnack(context, Strings(locale.languageCode).vacationText(notice: v.notice, until: v.until));
  return true;
}

/// A [ProductCard] that opens the product on tap and adds to the cart on "+".
Widget productCard(BuildContext context, Product p, Locale locale, {VoidCallback? afterAdd}) => ProductCard(
      product: p,
      lang: locale.languageCode,
      onTap: () => openProduct(context, p, locale),
      onAdd: () => addProductToCart(context, p, locale, after: afterAdd),
    );
