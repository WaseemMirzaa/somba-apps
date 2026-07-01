import 'package:flutter/material.dart';
import '../data/mock_data.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../widgets/product_image.dart';
import 'product_detail_screen.dart';

class CategoriesScreen extends StatelessWidget {
  final Locale locale;
  const CategoriesScreen({super.key, required this.locale});

  @override
  Widget build(BuildContext context) {
    final s = Strings(locale.languageCode);
    final lang = locale.languageCode;

    return Scaffold(
      appBar: AppBar(title: Text(s.categories)),
      body: GridView.builder(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          childAspectRatio: 1.12,
          crossAxisSpacing: 14,
          mainAxisSpacing: 14,
        ),
        itemCount: categories.length,
        itemBuilder: (_, i) {
          final cat = categories[i];
          final grad = AppColors.tileGradients[i % AppColors.tileGradients.length];
          final count = categoryCount(cat.name);
          return GestureDetector(
            onTap: () {
              final first = products.firstWhere((p) => p.category == cat.name,
                  orElse: () => products[0]);
              Navigator.push(context,
                  MaterialPageRoute(builder: (_) => ProductDetailScreen(product: first, locale: locale)));
            },
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                    begin: Alignment.topLeft, end: Alignment.bottomRight, colors: grad),
                borderRadius: BorderRadius.circular(22),
                boxShadow: AppShadow.card,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    height: 50,
                    width: 50,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.7),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(categoryIcon(cat.name), color: AppColors.primary, size: 26),
                  ),
                  const Spacer(),
                  Text(cat.displayName(lang),
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(height: 2),
                  Text(s.itemsCount(count),
                      style: const TextStyle(color: AppColors.muted, fontSize: 12.5, fontWeight: FontWeight.w500)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
