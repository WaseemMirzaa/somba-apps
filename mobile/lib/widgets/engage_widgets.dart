import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../services/engage_models.dart';
import '../services/engage_store.dart';
import '../theme/app_theme.dart';
import 'common.dart';

/// The text colour on the amber tint of the vacation notices (contrast 6:1 on the tint).
const Color _vacationInk = Color(0xFF7A4F06);

/// "Flash sale · ends in 02:14:09": a live badge for the product page. When the countdown reaches zero the sale is
/// dropped from the [EngageStore] and the badge disappears.
class FlashBadge extends StatelessWidget {
  final FlashSaleDto sale;
  const FlashBadge({super.key, required this.sale});

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final store = EngageStore.instance;
    final end = sale.endsAt;
    return Container(
      key: const ValueKey('flash-badge'),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: AppColors.accent.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(100)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.bolt_rounded, size: 16, color: AppColors.accentDark),
        const SizedBox(width: 4),
        Flexible(
          child: end == null
              ? Text(s.flashSale, style: const TextStyle(color: AppColors.accentDark, fontWeight: FontWeight.w800, fontSize: 12))
              : CountdownTo(
                  end: end,
                  now: store.now,
                  format: s.flashEnds,
                  style: const TextStyle(color: AppColors.accentDark, fontWeight: FontWeight.w800, fontSize: 12),
                  onEnd: () => store.expireSale(sale.id),
                ),
        ),
      ]),
    );
  }
}

/// The small live timer on a product card's picture: bolt + 02:14:09.
class FlashTimerPill extends StatelessWidget {
  final FlashSaleDto sale;
  const FlashTimerPill({super.key, required this.sale});

  @override
  Widget build(BuildContext context) {
    final store = EngageStore.instance;
    final end = sale.endsAt;
    return Container(
      key: const ValueKey('flash-timer'),
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(color: AppColors.accentDark, borderRadius: BorderRadius.circular(100)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.bolt_rounded, size: 13, color: Colors.white),
        if (end != null) ...[
          const SizedBox(width: 2),
          Flexible(
            child: CountdownTo(
              end: end,
              now: store.now,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 10.5),
              onEnd: () => store.expireSale(sale.id),
            ),
          ),
        ],
      ]),
    );
  }
}

/// The notice of a store that is away, in the shopper's language.
class VacationBanner extends StatelessWidget {
  final VacationInfo info;
  const VacationBanner({super.key, required this.info});

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Container(
      key: const ValueKey('vacation-banner'),
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.amber.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.amber.withValues(alpha: 0.5)),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Icon(Icons.beach_access_rounded, size: 20, color: _vacationInk),
        const SizedBox(width: 10),
        Expanded(
          child: Text(s.vacationText(notice: info.notice, until: info.until),
              key: const ValueKey('vacation-text'), style: const TextStyle(color: _vacationInk, fontSize: 13, fontWeight: FontWeight.w600, height: 1.35)),
        ),
      ]),
    );
  }
}

/// "On vacation" tag on a product card's picture.
class VacationTag extends StatelessWidget {
  const VacationTag({super.key});

  @override
  Widget build(BuildContext context) => Container(
        key: const ValueKey('vacation-tag'),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(color: AppColors.ink.withValues(alpha: 0.78), borderRadius: BorderRadius.circular(100)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.beach_access_rounded, size: 12, color: Colors.white),
          const SizedBox(width: 3),
          Flexible(
            child: Text(Strings.of(context).vacBadge,
                maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 10.5)),
          ),
        ]),
      );
}
