import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import 'more/order_screens.dart';

class OrderSuccessScreen extends StatefulWidget {
  final Locale locale;
  final String orderId;

  const OrderSuccessScreen({super.key, required this.locale, required this.orderId});

  @override
  State<OrderSuccessScreen> createState() => _OrderSuccessScreenState();
}

class _OrderSuccessScreenState extends State<OrderSuccessScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 650))..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings(widget.locale.languageCode);

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              ScaleTransition(
                scale: CurvedAnimation(parent: _c, curve: Curves.elasticOut),
                child: Container(
                  height: 120,
                  width: 120,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [AppColors.success, AppColors.mint],
                    ),
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.success.withValues(alpha: 0.35),
                        blurRadius: 30,
                        offset: const Offset(0, 12),
                      ),
                    ],
                  ),
                  child: const Icon(Icons.check_rounded, color: Colors.white, size: 68),
                ),
              ),
              const SizedBox(height: 28),
              Text(s.orderConfirmed,
                  style: Theme.of(context).textTheme.headlineSmall, textAlign: TextAlign.center),
              const SizedBox(height: 10),
              Text(s.orderConfirmedHint,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.muted, fontSize: 14.5, height: 1.4)),
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(100),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.receipt_long_rounded, size: 18, color: AppColors.primary),
                    const SizedBox(width: 8),
                    Text(widget.orderId,
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, color: AppColors.primary, fontSize: 14)),
                  ],
                ),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderTrackingScreen(locale: widget.locale))),
                  icon: const Icon(Icons.local_shipping_rounded, size: 20),
                  label: Text(s.trackOrder),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => Navigator.popUntil(context, (r) => r.isFirst),
                  child: Text(s.continueShopping),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
