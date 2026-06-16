import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../data/mock_data.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../widgets/app_card.dart';

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
        padding: const EdgeInsets.all(16),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          childAspectRatio: 0.92,
          crossAxisSpacing: 14,
          mainAxisSpacing: 14,
        ),
        itemCount: categories.length,
        itemBuilder: (_, i) {
          final cat = categories[i];
          final count = products.where((p) => p.category == cat.name).length;
          return AppCard(
            radius: AppRadius.lg,
            onTap: () {},
            child: Stack(
              fit: StackFit.expand,
              children: [
                CachedNetworkImage(imageUrl: cat.image, fit: BoxFit.cover),
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.bottomCenter,
                      end: Alignment.center,
                      colors: [Color(0xE60B1020), Colors.transparent],
                    ),
                  ),
                ),
                Positioned(
                  left: 14,
                  right: 14,
                  bottom: 14,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        cat.displayName(lang),
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 17),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Text(
                            count > 0
                                ? '$count ${lang == 'fr' ? 'articles' : 'items'}'
                                : (lang == 'fr' ? 'Explorer' : 'Explore'),
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12.5),
                          ),
                          const SizedBox(width: 4),
                          const Icon(Icons.arrow_forward_rounded, color: Colors.white, size: 14),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
