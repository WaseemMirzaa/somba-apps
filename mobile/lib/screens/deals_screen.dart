import 'package:flutter/material.dart';
import '../data/catalog_live.dart';
import '../data/catalog_models.dart';
import '../l10n/strings.dart';
import '../services/engage_store.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart' show CircleIconButton;
import '../widgets/flash_section.dart';
import '../widgets/product_actions.dart';
import '../widgets/product_card.dart';
import '../services/realtime_store.dart';

class DealsScreen extends StatefulWidget {
  final Locale locale;
  const DealsScreen({super.key, required this.locale});

  @override
  State<DealsScreen> createState() => _DealsScreenState();
}

class _DealsScreenState extends State<DealsScreen> {
  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(listenable: Listenable.merge([RealtimeStore.instance, EngageStore.instance]), builder: (_, __) => _scaffold(context));
  }

  Widget _scaffold(BuildContext context) {
    final s = Strings.of(context);
    final lang = s.lang;
    final catalogue = liveCatalog();
    // The sales running right now (real ones, from the server); none = the normal deals page, no timer.
    final flash = flashEntries(catalogue);
    final flashIds = {for (final e in flash) e.product.uuid};
    final deals = [...catalogue.where((p) => p.discount >= 15 && !flashIds.contains(p.uuid))]
      ..sort((a, b) => b.discount.compareTo(a.discount));

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            pinned: true,
            expandedHeight: 172,
            backgroundColor: AppColors.accentDark,
            automaticallyImplyLeading: false,
            // Opened from the home page's flash-sale section it is a pushed page: give it a way back.
            leading: Navigator.canPop(context)
                ? Padding(padding: const EdgeInsets.all(8), child: CircleIconButton(icon: Icons.arrow_back_rounded, background: Colors.white, onTap: () => Navigator.pop(context)))
                : null,
            flexibleSpace: FlexibleSpaceBar(
              titlePadding: const EdgeInsets.only(left: 20, bottom: 16),
              title: Text(s.deals,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 20)),
              background: Container(
                decoration: const BoxDecoration(gradient: AppColors.dealGradient),
                child: Stack(
                  children: [
                    Positioned(
                      right: -20,
                      top: -10,
                      child: Icon(Icons.local_fire_department_rounded,
                          size: 180, color: Colors.white.withValues(alpha: 0.15)),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (flash.isNotEmpty) ...[
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                child: Column(key: const ValueKey('deals-flash'), crossAxisAlignment: CrossAxisAlignment.start, children: [
                  FlashHeader(soonest: flash.first.sale),
                  const SizedBox(height: 4),
                  Text(s.flashDealsHint, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                ]),
              ),
            ),
            SliverPadding(
              padding: EdgeInsets.fromLTRB(16, 12, 16, deals.isEmpty ? 120 : 8),
              sliver: _grid([for (final e in flash) e.product], lang),
            ),
            if (deals.isNotEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: Text(s.flashMoreDeals, style: Theme.of(context).textTheme.titleMedium),
                ),
              ),
          ],
          if (deals.isEmpty && flash.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: Text(s.dealsNone, style: const TextStyle(color: AppColors.muted))),
            )
          else if (deals.isNotEmpty)
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
              sliver: _grid(deals, lang),
            ),
        ],
      ),
    );
  }

  Widget _grid(List<Product> items, String lang) => SliverGrid(
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          childAspectRatio: 0.62,
          crossAxisSpacing: 14,
          mainAxisSpacing: 14,
        ),
        delegate: SliverChildBuilderDelegate(
          (_, i) => ProductCard(
            key: ValueKey('deal-${items[i].uuid}'),
            product: items[i],
            lang: lang,
            onTap: () => openProduct(context, items[i], widget.locale),
            onAdd: () => addProductToCart(context, items[i], widget.locale, after: () => setState(() {})),
          ),
          childCount: items.length,
        ),
      );
}
