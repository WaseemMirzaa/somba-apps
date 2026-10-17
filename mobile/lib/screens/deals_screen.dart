import 'package:flutter/material.dart';
import '../data/catalog_live.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
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
    return ListenableBuilder(listenable: RealtimeStore.instance, builder: (_, __) => _scaffold(context));
  }

  Widget _scaffold(BuildContext context) {
    final s = Strings.of(context);
    final lang = s.lang;
    final deals = [...liveCatalog().where((p) => p.discount >= 15)]
      ..sort((a, b) => b.discount.compareTo(a.discount));

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            pinned: true,
            expandedHeight: 172,
            backgroundColor: AppColors.accentDark,
            automaticallyImplyLeading: false,
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
          if (deals.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: Text(s.dealsNone, style: const TextStyle(color: AppColors.muted))),
            )
          else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
            sliver: SliverGrid(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                childAspectRatio: 0.62,
                crossAxisSpacing: 14,
                mainAxisSpacing: 14,
              ),
              delegate: SliverChildBuilderDelegate(
                (_, i) => ProductCard(
                  product: deals[i],
                  lang: lang,
                  onTap: () => openProduct(context, deals[i], widget.locale),
                  onAdd: () => addProductToCart(context, deals[i], widget.locale, after: () => setState(() {})),
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
