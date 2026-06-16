import 'package:flutter/material.dart';
import '../data/mock_data.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../widgets/app_badge.dart';
import '../widgets/product_card.dart';
import 'product_detail_screen.dart';

class DealsScreen extends StatelessWidget {
  final Locale locale;
  const DealsScreen({super.key, required this.locale});

  @override
  Widget build(BuildContext context) {
    final s = Strings(locale.languageCode);
    final deals = products.where((p) => p.discount >= 13).toList();

    return Scaffold(
      appBar: AppBar(title: Text(s.deals)),
      body: CustomScrollView(
        slivers: [
          // Flash sale hero band
          SliverToBoxAdapter(
            child: Container(
              margin: const EdgeInsets.fromLTRB(16, 16, 16, 4),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(AppRadius.xl),
                child: Container(
                  decoration: const BoxDecoration(gradient: AppGradients.band),
                  padding: const EdgeInsets.all(22),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.18),
                              borderRadius: BorderRadius.circular(AppRadius.control),
                            ),
                            child: const Icon(Icons.bolt_rounded, color: Colors.white, size: 26),
                          ),
                          const Spacer(),
                          const AppBadge('-50%', tone: BadgeTone.amber),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Text(
                        s.flashSale,
                        style: Theme.of(context).textTheme.headlineSmall!.copyWith(color: Colors.white),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(Icons.schedule_rounded, color: Colors.white70, size: 15),
                          const SizedBox(width: 6),
                          Text(
                            '${s.endsIn} 02:45:30',
                            style: const TextStyle(color: Colors.white70, fontSize: 13),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),

          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            sliver: SliverGrid(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisExtent: 252,
                crossAxisSpacing: 14,
                mainAxisSpacing: 14,
              ),
              delegate: SliverChildBuilderDelegate(
                (_, i) => ProductCard(
                  product: deals[i],
                  lang: locale.languageCode,
                  flash: true,
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => ProductDetailScreen(product: deals[i], locale: locale),
                    ),
                  ),
                ),
                childCount: deals.length,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
