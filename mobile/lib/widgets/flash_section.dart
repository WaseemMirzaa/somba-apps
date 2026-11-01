import 'package:flutter/material.dart';
import '../data/catalog_models.dart';
import '../l10n/strings.dart';
import '../services/engage_models.dart';
import '../services/engage_store.dart';
import '../theme/app_theme.dart';
import 'common.dart';

/// A running flash sale paired with its product (sales whose product is not in the catalogue are left out).
class FlashEntry {
  final FlashSaleDto sale;
  final Product product;
  const FlashEntry(this.sale, this.product);
}

/// The running sales that have a product in [catalogue], the ones ending soonest first.
List<FlashEntry> flashEntries(Iterable<Product> catalogue) {
  final byId = {for (final p in catalogue) p.uuid: p};
  return [
    for (final sale in EngageStore.instance.flashSales)
      if (byId[sale.productId] != null) FlashEntry(sale, byId[sale.productId]!),
  ];
}

/// "Flash sale: ends in [02:14:09]": the live countdown to the sale that ends first. When it reaches zero the sale
/// leaves the [EngageStore] and the screen drops it (the next one's timer takes over).
class FlashHeader extends StatelessWidget {
  final FlashSaleDto soonest;
  final bool onDark;
  const FlashHeader({super.key, required this.soonest, this.onDark = false});

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final store = EngageStore.instance;
    final end = soonest.endsAt;
    final ink = onDark ? Colors.white : AppColors.accentDark;
    return Wrap(
      key: const ValueKey('flash-header'),
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: 10,
      runSpacing: 6,
      children: [
        Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.bolt_rounded, color: ink, size: 20),
          const SizedBox(width: 4),
          Text(s.flashSale, style: TextStyle(color: ink, fontWeight: FontWeight.w800, fontSize: 16)),
        ]),
        if (end != null)
          Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 6, runSpacing: 4, children: [
            Text(s.endsIn, style: TextStyle(color: ink, fontWeight: FontWeight.w600, fontSize: 12.5)),
            CountdownTo(
              key: ValueKey('flash-header-${soonest.id}'),
              end: end,
              now: store.now,
              boxed: true,
              boxColor: onDark ? Colors.white : AppColors.accentDark,
              textColor: onDark ? AppColors.accentDark : Colors.white,
              onEnd: () => store.expireSale(soonest.id),
            ),
          ]),
      ],
    );
  }
}
