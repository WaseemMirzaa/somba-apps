import 'package:flutter/material.dart';
import '../data/shop_state.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../util/format.dart';
import 'order_success_screen.dart';
import 'more/account_more.dart';

class CheckoutScreen extends StatefulWidget {
  final Locale locale;

  const CheckoutScreen({super.key, required this.locale});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final shop = ShopState.instance;
  String payment = 'stripe_card';

  static const _methods = [
    ('stripe_card', Icons.credit_card_rounded),
    ('airtel_money', Icons.smartphone_rounded),
    ('orange_money', Icons.smartphone_rounded),
    ('vodacom_mpesa', Icons.account_balance_wallet_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    final s = Strings(widget.locale.languageCode);
    final lang = widget.locale.languageCode;
    final deliveryFee = deliveryFeeUsd;
    final discount = shop.promoDiscount(shop.subtotal);
    final total = shop.subtotal + deliveryFee - discount;

    return Scaffold(
      appBar: AppBar(
        title: Text(s.checkout),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          _sectionTitle(s.deliveryAddress),
          const SizedBox(height: 10),
          _card(
            child: Row(
              children: [
                Container(
                  height: 44,
                  width: 44,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(Icons.location_on_rounded, color: AppColors.primary),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Marie Dubois · +243 970 000 000',
                          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                      const SizedBox(height: 2),
                      Text(lang == 'fr' ? 'Av. du Commerce, Gombe, Kinshasa' : '12 Commerce Ave, Gombe, Kinshasa',
                          style: const TextStyle(color: AppColors.muted, fontSize: 13)),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.edit_rounded, size: 18, color: AppColors.muted),
                  onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => AddressBookScreen(locale: widget.locale))),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          _sectionTitle('Delivery zone'),
          const SizedBox(height: 10),
          _card(
            child: Column(children: [
              for (final z in currentMarket.zones) ...[
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => setState(() {
                    shop.selectedZoneId = z.id;
                    shop.save();
                  }),
                  child: Row(children: [
                    Icon(selectedZone.id == z.id ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded,
                        color: selectedZone.id == z.id ? AppColors.primary : AppColors.faint, size: 22),
                    const SizedBox(width: 12),
                    Expanded(child: Text('${lang == 'fr' ? z.nameFr : z.name} · ${z.city}',
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5))),
                    Text(z.deliveryFeeUsd == 0 ? 'FREE' : money(z.deliveryFeeUsd),
                        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: z.deliveryFeeUsd == 0 ? AppColors.success : AppColors.ink)),
                  ]),
                ),
                if (z != currentMarket.zones.last) const Divider(height: 20),
              ],
            ]),
          ),
          const SizedBox(height: 22),
          _sectionTitle(s.payment),
          const SizedBox(height: 10),
          ..._methods.map((m) {
            final selected = payment == m.$1;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: GestureDetector(
                onTap: () => setState(() => payment = m.$1),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: selected ? AppColors.primary : AppColors.line,
                      width: selected ? 1.8 : 1.2,
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(m.$2, color: selected ? AppColors.primary : AppColors.muted, size: 22),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(s.paymentLabel(m.$1),
                            style: TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 14,
                                color: selected ? AppColors.ink : AppColors.inkSoft)),
                      ),
                      Icon(
                        selected ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded,
                        color: selected ? AppColors.primary : AppColors.faint,
                        size: 22,
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
          const SizedBox(height: 12),
          _sectionTitle(s.orderSummary),
          const SizedBox(height: 10),
          _card(
            child: Column(
              children: [
                _row(s.subtotal, money(shop.subtotal)),
                const SizedBox(height: 8),
                _row('${s.delivery} · ${selectedZone.name}', deliveryFee == 0 ? 'FREE' : money(deliveryFee)),
                if (discount > 0) ...[
                  const SizedBox(height: 8),
                  _row('Promo ${shop.appliedPromo!.code}', '- ${money(discount)}'),
                ],
                const Divider(height: 22),
                _row(s.total, money(total), bold: true),
                if (secondaryMoney(total) != null)
                  Align(alignment: Alignment.centerRight, child: Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(secondaryMoney(total)!, style: const TextStyle(color: AppColors.muted, fontSize: 12.5, fontWeight: FontWeight.w600)),
                  )),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: Container(
        padding: EdgeInsets.fromLTRB(16, 14, 16, 12 + MediaQuery.of(context).padding.bottom),
        decoration: BoxDecoration(
          color: AppColors.surface,
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF1E293B).withValues(alpha: 0.08),
              blurRadius: 20,
              offset: const Offset(0, -4),
            ),
          ],
        ),
        child: FilledButton(
          onPressed: () => Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (_) => OrderSuccessScreen(locale: widget.locale, orderId: 'SMB-2026-4821'),
            ),
          ),
          child: Text('${s.placeOrder}  ·  ${money(total)}'),
        ),
      ),
    );
  }

  Widget _sectionTitle(String t) => Text(t, style: Theme.of(context).textTheme.titleMedium);

  Widget _card({required Widget child}) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          boxShadow: AppShadow.card,
        ),
        child: child,
      );

  Widget _row(String label, String value, {bool bold = false}) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: TextStyle(
                  fontSize: bold ? 16 : 14,
                  fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
                  color: bold ? AppColors.ink : AppColors.muted)),
          Text(value,
              style: TextStyle(
                  fontSize: bold ? 18 : 14,
                  fontWeight: bold ? FontWeight.w800 : FontWeight.w700,
                  color: bold ? AppColors.primary : AppColors.ink)),
        ],
      );
}
