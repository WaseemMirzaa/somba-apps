import 'package:flutter/material.dart';
import '../data/shop_state.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../widgets/app_card.dart';
import '../widgets/price_text.dart';
import '../widgets/section_header.dart';
import 'cart_screen.dart';
import 'order_success_screen.dart';

class CheckoutScreen extends StatefulWidget {
  final Locale locale;

  const CheckoutScreen({super.key, required this.locale});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final shop = ShopState.instance;
  String payment = 'cod';

  @override
  Widget build(BuildContext context) {
    final s = Strings(widget.locale.languageCode);
    final total = shop.subtotal + kDeliveryFee;

    final methods = <(String, String, IconData)>[
      ('stripe_card', s.payCard, Icons.credit_card_rounded),
      ('cod', s.payCod, Icons.payments_outlined),
      ('airtel_money', s.payMobile, Icons.smartphone_rounded),
      ('wallet', s.payWallet, Icons.account_balance_wallet_outlined),
    ];

    return Scaffold(
      appBar: AppBar(title: Text(s.checkoutTitle)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SectionHeader(title: s.deliveryAddress, flourish: false),
          const SizedBox(height: 12),
          AppCard(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: AppColors.royalTint,
                    borderRadius: BorderRadius.circular(AppRadius.control),
                  ),
                  child: const Icon(Icons.location_on_outlined, color: AppColors.royal),
                ),
                const SizedBox(width: 14),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Marie Dubois', style: TextStyle(fontWeight: FontWeight.w700)),
                      SizedBox(height: 2),
                      Text(
                        'Gombe, Kinshasa · +243 …',
                        style: TextStyle(color: AppColors.slate500, fontSize: 13),
                      ),
                    ],
                  ),
                ),
                TextButton(
                  onPressed: () => ScaffoldMessenger.of(context)
                      .showSnackBar(SnackBar(content: Text(s.comingSoon))),
                  child: Text(s.change),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),

          SectionHeader(title: s.paymentMethod, flourish: false),
          const SizedBox(height: 12),
          ...methods.map((m) {
            final selected = payment == m.$1;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: AppCard(
                onTap: () => setState(() => payment = m.$1),
                border: Border.all(
                  color: selected ? AppColors.primary : AppColors.border,
                  width: selected ? 1.5 : 1,
                ),
                color: selected ? AppColors.primaryLight : AppColors.surface,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                child: Row(
                  children: [
                    Icon(m.$3, color: selected ? AppColors.primary : AppColors.slate600),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Text(
                        m.$2,
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          color: selected ? AppColors.primaryHover : AppColors.foreground,
                        ),
                      ),
                    ),
                    Icon(
                      selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                      color: selected ? AppColors.primary : AppColors.slate400,
                      size: 22,
                    ),
                  ],
                ),
              ),
            );
          }),
          const SizedBox(height: 12),

          SectionHeader(title: s.orderSummary, flourish: false),
          const SizedBox(height: 12),
          AppCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                _row(s.subtotal, formatUsd(shop.subtotal)),
                const SizedBox(height: 8),
                _row(s.delivery, formatUsd(kDeliveryFee)),
                const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: Divider()),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(s.total, style: Theme.of(context).textTheme.titleMedium),
                    PriceText(
                      amount: total,
                      style: Theme.of(context).textTheme.titleLarge!.copyWith(color: AppColors.primary),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: Container(
        padding: EdgeInsets.fromLTRB(16, 14, 16, 14 + MediaQuery.of(context).padding.bottom),
        decoration: const BoxDecoration(color: AppColors.surface, boxShadow: AppShadows.md),
        child: SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: () => Navigator.pushReplacement(
              context,
              MaterialPageRoute(
                builder: (_) => OrderSuccessScreen(locale: widget.locale, orderId: 'ORD-2024-001'),
              ),
            ),
            child: Text('${s.placeOrder}  ·  ${formatUsd(total)}'),
          ),
        ),
      ),
    );
  }

  Widget _row(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: AppColors.slate500)),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
      ],
    );
  }
}
