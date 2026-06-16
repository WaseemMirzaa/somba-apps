import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../widgets/app_card.dart';

class OrderSuccessScreen extends StatelessWidget {
  final Locale locale;
  final String orderId;

  const OrderSuccessScreen({super.key, required this.locale, required this.orderId});

  @override
  Widget build(BuildContext context) {
    final s = Strings(locale.languageCode);

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 96,
                  height: 96,
                  decoration: const BoxDecoration(color: AppColors.successLight, shape: BoxShape.circle),
                  child: const Icon(Icons.check_circle_rounded, color: AppColors.success, size: 56),
                ),
              ),
              const SizedBox(height: 24),
              Text(
                s.orderConfirmed,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 8),
              Text(
                s.orderConfirmedHint,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.slate500, height: 1.5),
              ),
              const SizedBox(height: 24),
              AppCard(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.receipt_long_outlined, color: AppColors.royal, size: 20),
                    const SizedBox(width: 10),
                    Text(orderId, style: Theme.of(context).textTheme.titleMedium),
                  ],
                ),
              ),
              const SizedBox(height: 28),
              FilledButton.icon(
                onPressed: () => ScaffoldMessenger.of(context)
                    .showSnackBar(SnackBar(content: Text('${s.trackOrder} (mock)'))),
                icon: const Icon(Icons.local_shipping_outlined, size: 18),
                label: Text(s.trackOrder),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () => Navigator.popUntil(context, (r) => r.isFirst),
                child: Text(s.continueShopping),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
