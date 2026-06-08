import 'package:flutter/material.dart';
import '../data/mock_data.dart';
import '../l10n/strings.dart';
import '../widgets/product_card.dart';
import 'product_detail_screen.dart';

class DealsScreen extends StatelessWidget {
  final Locale locale;
  const DealsScreen({super.key, required this.locale});

  @override
  Widget build(BuildContext context) {
    final s = Strings(locale.languageCode);
    final colorScheme = Theme.of(context).colorScheme;
    final deals = products.where((p) => p.discount >= 15).toList();

    return Scaffold(
      appBar: AppBar(title: Text(s.deals)),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [colorScheme.primary, const Color(0xFF4338CA)]),
            ),
            child: Column(
              children: [
                const Icon(Icons.bolt, color: Colors.white, size: 40),
                const SizedBox(height: 8),
                Text(s.flashSale, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                Text('${s.endsIn} 02:45:30', style: const TextStyle(color: Colors.white70)),
              ],
            ),
          ),
          Expanded(
            child: GridView.builder(
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                childAspectRatio: 0.72,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
              ),
              itemCount: deals.length,
              itemBuilder: (_, i) => ProductCard(
                product: deals[i],
                lang: locale.languageCode,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => ProductDetailScreen(product: deals[i], locale: locale)),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
