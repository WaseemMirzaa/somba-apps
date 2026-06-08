import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../data/mock_data.dart';
import '../data/shop_state.dart';
import 'cart_screen.dart';
import 'checkout_screen.dart';
import '../l10n/strings.dart';

class ProductDetailScreen extends StatelessWidget {
  final Product product;
  final Locale locale;

  const ProductDetailScreen({super.key, required this.product, required this.locale});

  @override
  Widget build(BuildContext context) {
    final s = Strings(locale.languageCode);
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: Text(product.displayName(locale.languageCode)),
        actions: [
          IconButton(icon: const Icon(Icons.favorite_border), onPressed: () {}),
          IconButton(icon: const Icon(Icons.share), onPressed: () {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Link copied (mock)')));
          }),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AspectRatio(
                    aspectRatio: 1,
                    child: CachedNetworkImage(imageUrl: product.image, fit: BoxFit.cover),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(product.displayName(locale.languageCode), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Icon(Icons.star, color: Colors.amber[700], size: 18),
                            Text(' ${product.rating} (${product.reviews} reviews)'),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Text('\$${product.price.toStringAsFixed(0)}', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: colorScheme.primary)),
                            const SizedBox(width: 8),
                            Text('\$${product.originalPrice.toStringAsFixed(0)}', style: const TextStyle(decoration: TextDecoration.lineThrough, color: Colors.grey)),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(color: colorScheme.primary, borderRadius: BorderRadius.circular(4)),
                              child: Text('-${product.discount}%', style: const TextStyle(color: Colors.white, fontSize: 12)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: colorScheme.primaryContainer.withValues(alpha: 0.3),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            children: [
                              Icon(Icons.local_shipping, color: colorScheme.primary),
                              const SizedBox(width: 8),
                              Text(locale.languageCode == 'fr' ? 'Livraison en 2 jours' : 'Delivery in 2 days'),
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
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10, offset: const Offset(0, -2))],
            ),
            child: Row(
              children: [
                Expanded(
                  child:                   OutlinedButton(
                    onPressed: () {
                      ShopState.instance.addToCart(product);
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.addToCart)));
                    },
                    style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                    child: Text(s.addToCart),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: () {
                      ShopState.instance.addToCart(product);
                      Navigator.push(context, MaterialPageRoute(builder: (_) => CheckoutScreen(locale: locale)));
                    },
                    style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
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
