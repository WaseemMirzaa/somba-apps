import 'mock_data.dart';

class CartItem {
  final Product product;
  final String variant;
  int qty;

  CartItem({required this.product, this.variant = 'Default', this.qty = 1});
}

class ShopState {
  static final ShopState instance = ShopState._();

  final List<CartItem> cart = [];
  final List<int> wishlist = [1, 3];
  final List<int> recentlyViewed = [1, 3, 5];

  ShopState._() {
    if (products.isNotEmpty) {
      cart.add(CartItem(product: products[0], variant: '256GB Black'));
      cart.add(CartItem(product: products[2], variant: 'White', qty: 2));
    }
  }

  void addToCart(Product p, {String variant = 'Default', int qty = 1}) {
    CartItem? existing;
    for (final c in cart) {
      if (c.product.id == p.id && c.variant == variant) {
        existing = c;
        break;
      }
    }
    if (existing != null) {
      existing.qty += qty;
    } else {
      cart.add(CartItem(product: p, variant: variant, qty: qty));
    }
  }

  double get subtotal => cart.fold(0.0, (s, i) => s + i.product.price * i.qty);
  int get cartCount => cart.fold(0, (s, i) => s + i.qty);

  void addRecentlyViewed(int id) {
    recentlyViewed.remove(id);
    recentlyViewed.insert(0, id);
    if (recentlyViewed.length > 12) recentlyViewed.removeLast();
  }
}
