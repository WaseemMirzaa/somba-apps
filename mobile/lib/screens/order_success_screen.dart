import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../services/models.dart' show OrderPackage, packagesOf;
import '../services/realtime_store.dart';
import '../util/format.dart';
import '../theme/app_theme.dart';
import 'more/order_screens.dart';

class OrderSuccessScreen extends StatefulWidget {
  final Locale locale;

  /// Backend order id (the reference is looked up from the live order list).
  final String orderId;

  const OrderSuccessScreen({super.key, required this.locale, required this.orderId});

  @override
  State<OrderSuccessScreen> createState() => _OrderSuccessScreenState();
}

class _OrderSuccessScreenState extends State<OrderSuccessScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 650))..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final order = RealtimeStore.instance.orderById(widget.orderId);
    final packages = order == null ? const <OrderPackage>[] : packagesOf(order);

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              // Scrolls on its own (large text, small phone) while the buttons stay pinned below.
              Expanded(
                child: Center(
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
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
                        Text(s.orderConfirmed, style: Theme.of(context).textTheme.headlineSmall, textAlign: TextAlign.center),
                        const SizedBox(height: 10),
                        Text(s.orderConfirmedHint,
                            textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted, fontSize: 14.5, height: 1.4)),
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
                              Text(order?.reference ?? '',
                                  style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.primary, fontSize: 14)),
                            ],
                          ),
                        ),
                        // One checkout makes ONE order; with several stores it is packed as one package per store.
                        if (packages.length > 1) ...[
                          const SizedBox(height: 20),
                          Text(s.orderSplitNote(packages.length),
                              key: const ValueKey('order-split-note'),
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: AppColors.muted, fontSize: 13.5, height: 1.4)),
                          const SizedBox(height: 10),
                          for (var n = 0; n < packages.length; n++)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 3),
                              child: Row(children: [
                                const Icon(Icons.storefront_rounded, size: 16, color: AppColors.primary),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text((packages[n].sellerName ?? '').isEmpty ? s.storeOtherItems : packages[n].sellerName!,
                                      key: ValueKey('order-split-store-$n'),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                                ),
                                const SizedBox(width: 8),
                                Text(money(packages[n].subtotalUsd),
                                    key: ValueKey('order-split-subtotal-$n'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
                              ]),
                            ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () =>
                      Navigator.push(context, MaterialPageRoute(builder: (_) => OrderTrackingScreen(locale: widget.locale, orderId: widget.orderId))),
                  child: Text(s.trackOrder),
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
