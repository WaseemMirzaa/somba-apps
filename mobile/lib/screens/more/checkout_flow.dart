import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../data/shop_state.dart';
import '../../theme/app_theme.dart';
import '../../util/format.dart';
import '../../widgets/kit.dart';
import '../../widgets/product_image.dart';
import 'order_screens.dart';

/// Add a new payment card and associate it with the account (CF-11).
class AddCardScreen extends StatefulWidget {
  const AddCardScreen({super.key});
  @override
  State<AddCardScreen> createState() => _AddCardScreenState();
}

class _AddCardScreenState extends State<AddCardScreen> {
  final _number = TextEditingController();
  final _holder = TextEditingController();
  final _expiry = TextEditingController();
  final _cvv = TextEditingController();
  bool _makeDefault = true;
  String? _error;

  @override
  void dispose() {
    _number.dispose();
    _holder.dispose();
    _expiry.dispose();
    _cvv.dispose();
    super.dispose();
  }

  String _brandFor(String digits) {
    if (digits.startsWith('4')) return 'Visa';
    if (digits.startsWith('5') || digits.startsWith('2')) return 'Mastercard';
    if (digits.startsWith('3')) return 'Amex';
    return 'Card';
  }

  void _save() {
    final digits = _number.text.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 12 || _holder.text.trim().isEmpty || _expiry.text.trim().length < 4) {
      setState(() => _error = 'Please enter a valid card number, name and expiry.');
      return;
    }
    ShopState.instance.addCard(SavedCard(
      brand: _brandFor(digits),
      last4: digits.substring(digits.length - 4),
      holder: _holder.text.trim(),
      expiry: _expiry.text.trim(),
    ));
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Card saved to your account')));
    Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final digits = _number.text.replaceAll(RegExp(r'\D'), '');
    return Scaffold(
      appBar: backAppBar(context, 'Add card'),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 12, 20, 24), children: [
        // Live card preview.
        Container(
          height: 180,
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.circular(20), boxShadow: AppShadow.lifted),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Icon(Icons.contactless_rounded, color: Colors.white70),
              const Spacer(),
              Text(digits.isEmpty ? 'Card' : _brandFor(digits), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
            ]),
            const Spacer(),
            Text(_masked(digits), style: const TextStyle(color: Colors.white, fontSize: 20, letterSpacing: 2, fontWeight: FontWeight.w700)),
            const Spacer(),
            Row(children: [
              Expanded(child: Text(_holder.text.isEmpty ? 'CARDHOLDER NAME' : _holder.text.toUpperCase(),
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w600))),
              Text(_expiry.text.isEmpty ? 'MM/YY' : _expiry.text, style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w600)),
            ]),
          ]),
        ),
        const SizedBox(height: 20),
        _field('Card number', _number, hint: '4242 4242 4242 4242', keyboard: TextInputType.number,
            formatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(16)]),
        const SizedBox(height: 16),
        _field('Cardholder name', _holder, hint: 'Marie Dubois'),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: _field('Expiry', _expiry, hint: 'MM/YY', keyboard: TextInputType.number,
              formatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)])),
          const SizedBox(width: 12),
          Expanded(child: _field('CVV', _cvv, hint: '123', keyboard: TextInputType.number, obscure: true,
              formatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)])),
        ]),
        const SizedBox(height: 14),
        GestureDetector(
          onTap: () => setState(() => _makeDefault = !_makeDefault),
          child: Row(children: [
            Icon(_makeDefault ? Icons.check_box_rounded : Icons.check_box_outline_blank_rounded, color: AppColors.primary),
            const SizedBox(width: 8),
            const Text('Set as default payment method', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
          ]),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 12.5, fontWeight: FontWeight.w600)),
        ],
        const SizedBox(height: 20),
        PrimaryButton('Save card', icon: Icons.lock_rounded, onPressed: _save),
        const SizedBox(height: 10),
        const Center(child: Text('🔒 Encrypted — we never store your full number', style: TextStyle(color: AppColors.faint, fontSize: 11.5))),
      ]),
    );
  }

  String _masked(String digits) {
    final buf = digits.padRight(16, '•');
    final groups = <String>[];
    for (int i = 0; i < 16; i += 4) {
      groups.add(buf.substring(i, i + 4));
    }
    return groups.join('  ');
  }

  Widget _field(String label, TextEditingController c, {String hint = '', TextInputType? keyboard, bool obscure = false, List<TextInputFormatter>? formatters}) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.inkSoft)),
      const SizedBox(height: 6),
      TextField(
        controller: c,
        keyboardType: keyboard,
        obscureText: obscure,
        inputFormatters: formatters,
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(hintText: hint),
      ),
    ]);
  }
}

/// Bottom sheet to add a mobile-money wallet.
Future<bool?> showAddWalletSheet(BuildContext context) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const _AddWalletSheet(),
  );
}

class _AddWalletSheet extends StatefulWidget {
  const _AddWalletSheet();
  @override
  State<_AddWalletSheet> createState() => _AddWalletSheetState();
}

class _AddWalletSheetState extends State<_AddWalletSheet> {
  final _number = TextEditingController();
  int _provider = 0;
  static const _providers = ['Airtel Money', 'Orange Money', 'M-Pesa'];
  static const _icons = [Icons.smartphone_rounded, Icons.smartphone_rounded, Icons.account_balance_wallet_rounded];

  @override
  void dispose() {
    _number.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Center(child: Container(width: 44, height: 5, decoration: BoxDecoration(color: AppColors.line, borderRadius: BorderRadius.circular(100)))),
          const SizedBox(height: 16),
          const Text('Add mobile money', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, fontFamily: 'PlusJakartaSans')),
          const SizedBox(height: 16),
          ...List.generate(_providers.length, (i) {
            final sel = _provider == i;
            return Padding(padding: const EdgeInsets.only(bottom: 10), child: GestureDetector(
              onTap: () => setState(() => _provider = i),
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: sel ? AppColors.primary : AppColors.line, width: sel ? 1.8 : 1.2)),
                child: Row(children: [
                  Icon(_icons[i], color: sel ? AppColors.primary : AppColors.muted),
                  const SizedBox(width: 12),
                  Expanded(child: Text(_providers[i], style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14))),
                  Icon(sel ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded, color: sel ? AppColors.primary : AppColors.faint),
                ]),
              ),
            ));
          }),
          const SizedBox(height: 6),
          TextField(
            controller: _number,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(hintText: '+243 970 000 000', prefixIcon: Icon(Icons.phone_rounded, size: 20)),
          ),
          const SizedBox(height: 18),
          PrimaryButton('Add wallet', icon: Icons.add_rounded, onPressed: () {
            final n = _number.text.trim();
            if (n.length < 6) {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a valid mobile-money number')));
              return;
            }
            ShopState.instance.addWallet(MobileWallet(provider: _providers[_provider], number: n));
            Navigator.pop(context, true);
          }),
        ]),
      ),
    );
  }
}

/// Final order summary — per-store breakdown before placing the order (CF-10).
class OrderSummaryScreen extends StatelessWidget {
  final Locale locale;
  final String paymentLabel;
  final CustomerAddress address;
  const OrderSummaryScreen({super.key, this.locale = const Locale('en'), required this.paymentLabel, required this.address});

  @override
  Widget build(BuildContext context) {
    final shop = ShopState.instance;
    final lang = locale.languageCode;
    final stores = shop.cartByStore;
    final subtotal = shop.subtotal;
    final delivery = deliveryFeeUsd * stores.length; // one delivery per store
    final discount = shop.promoDiscount(subtotal);
    final total = subtotal + delivery - discount;

    return Scaffold(
      appBar: backAppBar(context, 'Order summary'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(14)),
          child: Row(children: [
            const Icon(Icons.storefront_rounded, color: AppColors.primary, size: 20),
            const SizedBox(width: 10),
            Expanded(child: Text(
              stores.length == 1 ? '1 store · 1 order' : '${stores.length} stores · ${stores.length} separate orders',
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.primary))),
          ]),
        ),
        const SizedBox(height: 14),
        // Delivery address.
        Panel(child: Row(children: [
          Container(height: 42, width: 42, decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.location_on_rounded, color: AppColors.primary)),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${address.label} · ${address.name}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
            const SizedBox(height: 2),
            Text('${address.line}, ${address.city}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
          ])),
        ])),
        const SizedBox(height: 14),
        // Per-store groups.
        ...stores.map((so) => Padding(padding: const EdgeInsets.only(bottom: 12), child: Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.storefront_outlined, size: 18, color: AppColors.primary),
            const SizedBox(width: 8),
            Expanded(child: Text(so.seller.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14))),
            Text('${so.count} item${so.count == 1 ? '' : 's'}', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
          ]),
          const Divider(height: 18),
          ...so.items.map((it) => Padding(padding: const EdgeInsets.only(bottom: 10), child: Row(children: [
            ClipRRect(borderRadius: BorderRadius.circular(10), child: SizedBox(height: 46, width: 46, child: ProductImage(product: it.product, iconSize: 20))),
            const SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(it.product.displayName(lang), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12.5)),
              Text('Qty ${it.qty} · ${it.variant}', style: const TextStyle(color: AppColors.muted, fontSize: 11.5)),
            ])),
            Text(money(it.product.price * it.qty), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
          ]))),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            const Text('Store subtotal', style: TextStyle(color: AppColors.muted, fontSize: 12.5)),
            Text(money(so.subtotal), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          ]),
        ])))),
        const SizedBox(height: 2),
        Panel(child: Column(children: [
          _row('Subtotal', money(subtotal)),
          const SizedBox(height: 8),
          _row('Delivery · ${stores.length} store${stores.length == 1 ? '' : 's'}', delivery == 0 ? 'FREE' : money(delivery)),
          if (discount > 0) ...[
            const SizedBox(height: 8),
            _row('Promo ${shop.appliedPromo!.code}', '- ${money(discount)}'),
          ],
          const SizedBox(height: 8),
          _row('Payment', paymentLabel),
          const Divider(height: 22),
          _row('Total', money(total), bold: true),
        ])),
      ]),
      bottomNavigationBar: Padding(
        padding: EdgeInsets.fromLTRB(16, 8, 16, 12 + MediaQuery.of(context).padding.bottom),
        child: PrimaryButton('Place order · ${money(total)}', icon: Icons.lock_rounded, onPressed: () {
          Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => OrderPlacedScreen(locale: locale, stores: stores, paymentLabel: paymentLabel)));
        }),
      ),
    );
  }

  Widget _row(String l, String v, {bool bold = false}) => Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text(l, style: TextStyle(fontSize: bold ? 16 : 13.5, fontWeight: bold ? FontWeight.w800 : FontWeight.w500, color: bold ? AppColors.ink : AppColors.muted)),
        Text(v, style: TextStyle(fontSize: bold ? 18 : 13.5, fontWeight: FontWeight.w800, color: bold ? AppColors.primary : AppColors.ink)),
      ]);
}

/// Order confirmed — one confirmed order per store (CF-12).
class OrderPlacedScreen extends StatelessWidget {
  final Locale locale;
  final List<StoreOrder> stores;
  final String paymentLabel;
  const OrderPlacedScreen({super.key, this.locale = const Locale('en'), required this.stores, required this.paymentLabel});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(automaticallyImplyLeading: false, title: const Text('Order confirmed')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
        Column(children: [
          Container(
            height: 84, width: 84,
            decoration: BoxDecoration(gradient: LinearGradient(colors: [AppColors.success, AppColors.mint]), shape: BoxShape.circle,
                boxShadow: [BoxShadow(color: AppColors.success.withValues(alpha: 0.3), blurRadius: 24, offset: const Offset(0, 10))]),
            child: const Icon(Icons.check_rounded, color: Colors.white, size: 48),
          ),
          const SizedBox(height: 16),
          Text(stores.length == 1 ? 'Order placed!' : '${stores.length} orders placed!',
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 22, fontFamily: 'PlusJakartaSans')),
          const SizedBox(height: 6),
          Text(stores.length == 1
              ? 'The store has received your order.'
              : 'Items from different stores ship as separate orders — each store confirms its own.',
              textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted, fontSize: 13.5, height: 1.4)),
        ]),
        const SizedBox(height: 20),
        ...List.generate(stores.length, (i) {
          final so = stores[i];
          final id = 'SMB-2026-${4821 + i}';
          return Padding(padding: const EdgeInsets.only(bottom: 12), child: Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(height: 40, width: 40, decoration: BoxDecoration(color: AppColors.success.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.storefront_rounded, color: AppColors.success)),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(id, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                Text('Confirmed by ${so.seller.name}', style: const TextStyle(color: AppColors.success, fontSize: 12, fontWeight: FontWeight.w600)),
              ])),
            ]),
            const Divider(height: 18),
            Row(children: [
              Text('${so.count} item${so.count == 1 ? '' : 's'} · ${money(so.subtotal)}', style: const TextStyle(color: AppColors.inkSoft, fontSize: 12.5, fontWeight: FontWeight.w600)),
              const Spacer(),
              TextButton.icon(
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderTrackingScreen(locale: locale))),
                icon: const Icon(Icons.local_shipping_rounded, size: 16),
                label: const Text('Track'),
              ),
            ]),
          ])));
        }),
        const SizedBox(height: 4),
        PrimaryButton('Continue shopping', icon: Icons.storefront_rounded, onPressed: () {
          ShopState.instance.cart.clear();
          ShopState.instance.appliedPromo = null;
          Navigator.popUntil(context, (r) => r.isFirst);
        }),
      ]),
    );
  }
}
