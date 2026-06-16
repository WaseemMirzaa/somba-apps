import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../data/market_profiles.dart';
import '../theme/app_theme.dart';

/// Formats a USD amount with thousands grouping, e.g. `$1,199`.
String formatUsd(num amount) =>
    NumberFormat.currency(locale: 'en_US', symbol: r'$', decimalDigits: 0).format(amount);

/// Formats a CDF amount, e.g. `3,417,150 FC`.
String formatCdf(num amount) =>
    '${NumberFormat.decimalPattern('en_US').format(amount)} FC';

/// Price display that mirrors the web's dual-currency treatment: USD is the
/// primary figure and, when the active market profile defines an FX rate
/// (the DRC profile), the Congolese-franc equivalent is shown alongside it.
class PriceText extends StatelessWidget {
  final double amount;
  final TextStyle? style;
  final bool showSecondary;

  const PriceText({
    super.key,
    required this.amount,
    this.style,
    this.showSecondary = true,
  });

  @override
  Widget build(BuildContext context) {
    final baseStyle = style ??
        Theme.of(context).textTheme.titleMedium!.copyWith(color: AppColors.foreground);
    final fx = marketProfiles[currentMarketProfile]?.fxRateUsdCdf;

    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.end,
      spacing: 6,
      children: [
        Text(formatUsd(amount), style: baseStyle),
        if (showSecondary && fx != null)
          Text(
            '(${formatCdf((amount * fx).round())})',
            style: const TextStyle(fontSize: 12, color: AppColors.slate500),
          ),
      ],
    );
  }
}
