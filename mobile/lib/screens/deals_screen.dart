import 'package:flutter/material.dart';
import '../data/mock_data.dart';
import '../data/shop_state.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import '../widgets/product_card.dart';
import 'product_detail_screen.dart';

class DealsScreen extends StatefulWidget {
  final Locale locale;
  const DealsScreen({super.key, required this.locale});

  @override
  State<DealsScreen> createState() => _DealsScreenState();
}

class _DealsScreenState extends State<DealsScreen> {
  @override
  Widget build(BuildContext context) {
    final s = Strings(widget.locale.languageCode);
    final lang = widget.locale.languageCode;
    final deals = [...products.where((p) => p.discount >= 15)]
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
              title: Text(s.flashSale,
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
                    Positioned(
                      left: 20,
                      bottom: 52,
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.22),
                              borderRadius: BorderRadius.circular(100),
                            ),
                            child: Text('${s.endsIn} ',
                                style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
                          ),
                          const SizedBox(width: 8),
                          const Countdown(boxColor: Colors.white),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
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
                  soldPercent: 60 + (i * 13) % 38,
                  onTap: () => Navigator.push(context,
                      MaterialPageRoute(builder: (_) => ProductDetailScreen(product: deals[i], locale: widget.locale))),
                  onAdd: () {
                    setState(() => ShopState.instance.addToCart(deals[i]));
                    ScaffoldMessenger.of(context)
                      ..hideCurrentSnackBar()
                      ..showSnackBar(SnackBar(content: Text(s.addedToCart)));
                  },
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
