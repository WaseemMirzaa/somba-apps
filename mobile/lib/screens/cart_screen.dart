import 'package:flutter/material.dart';
import '../data/mock_data.dart';
import '../data/shop_state.dart';
import '../l10n/strings.dart';
import 'checkout_screen.dart';

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
    final fr = widget.locale.languageCode == 'fr';

    return Scaffold(
      appBar: AppBar(title: Text(fr ? 'Panier' : 'Cart')),
      body: shop.cart.isEmpty
          ? Center(child: Text(fr ? 'Panier vide' : 'Cart is empty'))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                ...shop.cart.map((item) => Card(
                      child: ListTile(
                        title: Text(item.product.displayName(widget.locale.languageCode)),
                        subtitle: Text('${item.variant} · x${item.qty}'),
                        trailing: Text('\$${(item.product.price * item.qty).toStringAsFixed(0)}'),
                      ),
                    )),
                const SizedBox(height: 16),
                Text('${fr ? "Total" : "Total"}: \$${shop.subtotal.toStringAsFixed(0)}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => CheckoutScreen(locale: widget.locale))),
                  child: Text(fr ? 'Passer à la caisse' : 'Checkout'),
                ),
              ],
            ),
    );
  }
}
