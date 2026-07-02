import 'package:flutter/material.dart';
import '../data/shop_state.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../util/format.dart';
import '../widgets/product_image.dart';
import 'more/checkout_flow.dart';
import 'more/account_more.dart';

class CheckoutScreen extends StatefulWidget {
  final Locale locale;

  const CheckoutScreen({super.key, required this.locale});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final shop = ShopState.instance;
  // Selected payment: 'card:<last4>' or 'wallet:<number>'.
  String _payment = '';

  @override
  void initState() {
    super.initState();
    _selectFirstPayment();
  }

  void _selectFirstPayment() {
    if (shop.savedCards.isNotEmpty) {
      _payment = 'card:${shop.savedCards.first.last4}';
    } else if (shop.wallets.isNotEmpty) {
      _payment = 'wallet:${shop.wallets.first.number}';
    }
  }

  String get _paymentLabel {
    if (_payment.startsWith('card:')) {
      final last4 = _payment.substring(5);
      final c = shop.savedCards.firstWhere((c) => c.last4 == last4, orElse: () => shop.savedCards.first);
      return '${c.brand} ···· ${c.last4}';
    }
    if (_payment.startsWith('wallet:')) {
      final num = _payment.substring(7);
      final w = shop.wallets.firstWhere((w) => w.number == num, orElse: () => shop.wallets.first);
      return '${w.provider} · ${w.number}';
    }
    return 'Select payment';
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings(widget.locale.languageCode);
    final lang = widget.locale.languageCode;
    final stores = shop.cartByStore;
    final address = shop.selectedAddress;

    return Scaffold(
      appBar: AppBar(
        title: Text(s.checkout),
        leading: IconButton(icon: const Icon(Icons.arrow_back_rounded), onPressed: () => Navigator.pop(context)),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          // 1. Review the cart, grouped by store.
          _sectionTitle('Review your order'),
          const SizedBox(height: 10),
          ...stores.map((so) => Padding(padding: const EdgeInsets.only(bottom: 12), child: _card(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                const Icon(Icons.storefront_outlined, size: 18, color: AppColors.primary),
                const SizedBox(width: 8),
                Expanded(child: Text(so.seller.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14))),
                Text('${so.count} item${so.count == 1 ? '' : 's'}', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
              ]),
              const Divider(height: 18),
              ...so.items.map((it) => Padding(padding: const EdgeInsets.only(bottom: 10), child: Row(children: [
                ClipRRect(borderRadius: BorderRadius.circular(10), child: SizedBox(height: 48, width: 48, child: ProductImage(product: it.product, iconSize: 20))),
                const SizedBox(width: 10),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(it.product.displayName(lang), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12.5)),
                  Text('Qty ${it.qty} · ${it.variant}', style: const TextStyle(color: AppColors.muted, fontSize: 11.5)),
                ])),
                Text(money(it.product.price * it.qty), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
              ]))),
            ]),
          ))),
          const SizedBox(height: 10),
          // 2. Delivery address (zone is auto-derived from the address).
          Row(children: [
            Expanded(child: _sectionTitle(s.deliveryAddress)),
            TextButton.icon(
              onPressed: _pickAddress,
              icon: const Icon(Icons.swap_horiz_rounded, size: 16),
              label: Text(address == null ? 'Add' : 'Change'),
            ),
          ]),
          const SizedBox(height: 6),
          if (address == null)
            GestureDetector(
              onTap: _pickAddress,
              child: _card(child: Row(children: const [
                Icon(Icons.add_location_alt_rounded, color: AppColors.primary),
                SizedBox(width: 12),
                Expanded(child: Text('Add a delivery address to continue', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5))),
                Icon(Icons.chevron_right_rounded, color: AppColors.faint),
              ])),
            )
          else
            _card(child: Row(children: [
              Container(height: 44, width: 44, decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(14)), child: const Icon(Icons.location_on_rounded, color: AppColors.primary)),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${address.label} · ${address.name}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                const SizedBox(height: 2),
                Text('${address.line}, ${address.city}', style: const TextStyle(color: AppColors.muted, fontSize: 13)),
                const SizedBox(height: 2),
                Text('Delivery zone: ${address.zone} · ${deliveryFeeUsd == 0 ? 'FREE' : money(deliveryFeeUsd)}/store', style: const TextStyle(color: AppColors.faint, fontSize: 11.5)),
              ])),
            ])),
          const SizedBox(height: 22),
          // 3. Payment — cards + mobile money only.
          _sectionTitle(s.payment),
          const SizedBox(height: 10),
          ...shop.savedCards.map((c) => _paymentTile(
            key: 'card:${c.last4}',
            icon: Icons.credit_card_rounded,
            title: '${c.brand} ···· ${c.last4}',
            subtitle: 'Expires ${c.expiry}',
          )),
          ...shop.wallets.map((w) => _paymentTile(
            key: 'wallet:${w.number}',
            icon: Icons.smartphone_rounded,
            title: w.provider,
            subtitle: w.number,
          )),
          const SizedBox(height: 6),
          Row(children: [
            Expanded(child: OutlinedButton.icon(
              onPressed: () async {
                final added = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => const AddCardScreen()));
                if (added == true) setState(() => _payment = 'card:${shop.savedCards.last.last4}');
              },
              icon: const Icon(Icons.add_card_rounded, size: 18),
              label: const Text('Add card'),
            )),
            const SizedBox(width: 10),
            Expanded(child: OutlinedButton.icon(
              onPressed: () async {
                final added = await showAddWalletSheet(context);
                if (added == true) setState(() => _payment = 'wallet:${shop.wallets.last.number}');
              },
              icon: const Icon(Icons.smartphone_rounded, size: 18),
              label: const Text('Mobile money'),
            )),
          ]),
        ],
      ),
      bottomNavigationBar: Container(
        padding: EdgeInsets.fromLTRB(16, 14, 16, 12 + MediaQuery.of(context).padding.bottom),
        decoration: BoxDecoration(
          color: AppColors.surface,
          boxShadow: [BoxShadow(color: const Color(0xFF1E293B).withValues(alpha: 0.08), blurRadius: 20, offset: const Offset(0, -4))],
        ),
        child: FilledButton(
          onPressed: (address == null || _payment.isEmpty)
              ? null
              : () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderSummaryScreen(locale: widget.locale, paymentLabel: _paymentLabel, address: address))),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text(address == null ? 'Add an address first' : 'Review order'),
            if (address != null) ...[const SizedBox(width: 6), const Icon(Icons.arrow_forward_rounded, size: 20)],
          ]),
        ),
      ),
    );
  }

  Future<void> _pickAddress() async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => AddressBookScreen(locale: widget.locale, selectMode: true)));
    if (mounted) setState(_selectFirstPaymentIfNeeded);
  }

  void _selectFirstPaymentIfNeeded() {
    if (_payment.isEmpty) _selectFirstPayment();
  }

  Widget _paymentTile({required String key, required IconData icon, required String title, required String subtitle}) {
    final selected = _payment == key;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GestureDetector(
        onTap: () => setState(() => _payment = key),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: selected ? AppColors.primary : AppColors.line, width: selected ? 1.8 : 1.2),
          ),
          child: Row(children: [
            Icon(icon, color: selected ? AppColors.primary : AppColors.muted, size: 22),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: selected ? AppColors.ink : AppColors.inkSoft)),
              Text(subtitle, style: const TextStyle(color: AppColors.muted, fontSize: 12)),
            ])),
            Icon(selected ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded, color: selected ? AppColors.primary : AppColors.faint, size: 22),
          ]),
        ),
      ),
    );
  }

  Widget _sectionTitle(String t) => Text(t, style: Theme.of(context).textTheme.titleMedium);

  Widget _card({required Widget child}) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(18), boxShadow: AppShadow.card),
        child: child,
      );
}
