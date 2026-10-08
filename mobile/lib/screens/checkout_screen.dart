import 'package:flutter/material.dart';
import '../data/shop_state.dart';
import '../l10n/strings.dart';
import '../services/models.dart';
import '../services/realtime_store.dart';
import '../theme/app_theme.dart';
import '../util/format.dart';
import '../widgets/mobile_money.dart';
import 'order_success_screen.dart';
import 'payment_pending_screen.dart';
import 'more/account_more.dart';

class CheckoutScreen extends StatefulWidget {
  final Locale locale;

  const CheckoutScreen({super.key, required this.locale});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final shop = ShopState.instance;
  final _phone = TextEditingController();
  String payment = 'airtel_money';
  String? _phoneError;
  bool _placing = false;

  @override
  void initState() {
    super.initState();
    _phone.text = RealtimeStore.instance.user?.phone ?? '';
    shop.syncWithCatalog();
  }

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  String get _lang => widget.locale.languageCode;

  /// The address the order will be delivered to (chosen, else default, else first).
  AddressDto? get _address {
    final list = RealtimeStore.instance.addresses;
    if (list.isEmpty) return null;
    return list.firstWhere((a) => a.id == shop.selectedAddressId,
        orElse: () => list.firstWhere((a) => a.isDefault, orElse: () => list.first));
  }

  Future<void> _placeOrder(double deliveryFee) async {
    final store = RealtimeStore.instance;
    final fr = _lang == 'fr';
    final address = _address;
    if (shop.cart.isEmpty) return;
    if (address == null) {
      _toast(fr ? 'Ajoutez une adresse de livraison.' : 'Add a delivery address first.');
      return;
    }
    if (isMobileMoney(payment)) {
      final err = validateMobileNumber(_phone.text, fr: fr);
      setState(() => _phoneError = err);
      if (err != null) return;
    }
    if (payment == 'wallet' && store.walletBalance + 0.001 < shop.subtotal + deliveryFee - shop.promoDiscount(shop.subtotal)) {
      _toast(fr ? 'Solde du portefeuille insuffisant.' : 'Your wallet balance is not enough for this order.');
      return;
    }
    setState(() => _placing = true);
    try {
      final order = await store.placeOrder(
        // Lines reference real listings; the SERVER prices them.
        items: shop.cart.map((c) => {'productId': c.product.uuid, 'qty': c.qty, 'variant': c.variant}).toList(),
        paymentMethod: payment,
        paymentPhone: isMobileMoney(payment) ? _phone.text.trim() : null,
        deliveryFeeUsd: deliveryFee,
        zoneId: shop.selectedZoneId,
        promoCode: shop.appliedPromo?.code,
        address: {
          'label': address.label,
          'line1': address.line1,
          if (address.line2 != null) 'line2': address.line2,
          'city': address.city,
          if (address.commune != null) 'commune': address.commune,
          if (address.phone != null) 'phone': address.phone,
          'zone': shop.selectedZoneId,
        },
      );
      // The order now owns these lines (and holds the stock).
      shop.clearCart();
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => order.status == 'pending'
              ? PaymentPendingScreen(locale: widget.locale, orderId: order.id)
              : OrderSuccessScreen(locale: widget.locale, orderId: order.id),
        ),
      );
    } catch (e) {
      _toast(e.toString());
    } finally {
      if (mounted) setState(() => _placing = false);
    }
  }

  void _toast(String m) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(m)));

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(listenable: RealtimeStore.instance, builder: (_, __) => _scaffold(context));
  }

  Widget _scaffold(BuildContext context) {
    final s = Strings(_lang);
    final store = RealtimeStore.instance;
    final deliveryFee = deliveryFeeUsd;
    final discount = shop.promoDiscount(shop.subtotal);
    final total = shop.subtotal + deliveryFee - discount;
    final address = _address;

    return Scaffold(
      appBar: AppBar(
        title: Text(s.checkout),
        leading: IconButton(icon: const Icon(Icons.arrow_back_rounded), onPressed: () => Navigator.pop(context)),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          _sectionTitle(s.deliveryAddress),
          const SizedBox(height: 10),
          _card(
            child: Row(children: [
              Container(
                height: 44,
                width: 44,
                decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(14)),
                child: const Icon(Icons.location_on_rounded, color: AppColors.primary),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: address == null
                    ? Text(_lang == 'fr' ? 'Aucune adresse enregistrée' : 'No saved address yet',
                        key: const ValueKey('no-address'), style: const TextStyle(color: AppColors.muted, fontSize: 14))
                    : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${address.label}${(address.phone ?? '').isEmpty ? '' : ' · ${address.phone}'}',
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                        const SizedBox(height: 2),
                        Text(address.oneLine, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
                      ]),
              ),
              TextButton(
                key: const ValueKey('edit-address'),
                onPressed: () async {
                  await Navigator.push(context, MaterialPageRoute(builder: (_) => AddressBookScreen(locale: widget.locale, pickMode: true)));
                  if (mounted) setState(() {});
                },
                child: Text(address == null ? (_lang == 'fr' ? 'Ajouter' : 'Add') : (_lang == 'fr' ? 'Changer' : 'Change')),
              ),
            ]),
          ),
          const SizedBox(height: 22),
          _sectionTitle(_lang == 'fr' ? 'Zone de livraison' : 'Delivery zone'),
          const SizedBox(height: 10),
          _card(
            child: Column(children: [
              for (final z in activeZones) ...[
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
                    Expanded(
                        child: Text('${_lang == 'fr' ? z.nameFr : z.name} · ${z.city}',
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5))),
                    Text(z.deliveryFeeUsd == 0 ? 'FREE' : money(z.deliveryFeeUsd),
                        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: z.deliveryFeeUsd == 0 ? AppColors.success : AppColors.ink)),
                  ]),
                ),
                if (z != activeZones.last) const Divider(height: 20),
              ],
            ]),
          ),
          const SizedBox(height: 22),
          _sectionTitle(s.payment),
          const SizedBox(height: 10),
          _methodTile('wallet', Icons.account_balance_wallet_rounded,
              '${_lang == 'fr' ? 'Portefeuille' : 'Wallet'} · ${money(store.walletBalance)}'),
          for (final m in mobileMoneyMethods) _methodTile(m, Icons.smartphone_rounded, s.paymentLabel(m)),
          if (isMobileMoney(payment)) ...[
            const SizedBox(height: 4),
            TextField(
              key: const ValueKey('mm-phone'),
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                labelText: _lang == 'fr' ? 'Numéro Mobile Money' : 'Mobile money number',
                hintText: '+243 81 234 5678',
                errorText: _phoneError,
                prefixIcon: const Icon(Icons.smartphone_rounded, size: 20),
                helperText: _lang == 'fr'
                    ? 'Vous recevrez une demande de confirmation sur ce numéro.'
                    : 'You will get an approval request on this number.',
              ),
            ),
          ],
          const SizedBox(height: 18),
          _sectionTitle(s.orderSummary),
          const SizedBox(height: 10),
          _card(
            child: Column(children: [
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
                Align(
                    alignment: Alignment.centerRight,
                    child: Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(secondaryMoney(total)!, style: const TextStyle(color: AppColors.muted, fontSize: 12.5, fontWeight: FontWeight.w600)),
                    )),
            ]),
          ),
        ],
      ),
      bottomNavigationBar: Container(
        padding: EdgeInsets.fromLTRB(16, 14, 16, 12 + MediaQuery.of(context).padding.bottom),
        decoration: BoxDecoration(
          color: AppColors.surface,
          boxShadow: [BoxShadow(color: const Color(0xFF1E293B).withValues(alpha: 0.08), blurRadius: 20, offset: const Offset(0, -4))],
        ),
        child: FilledButton(
          key: const ValueKey('place-order'),
          onPressed: _placing || shop.cart.isEmpty ? null : () => _placeOrder(deliveryFee),
          child: Text(_placing ? '…' : '${s.placeOrder}  ·  ${money(total)}'),
        ),
      ),
    );
  }

  Widget _methodTile(String id, IconData icon, String label) {
    final selected = payment == id;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GestureDetector(
        key: ValueKey('pay-$id'),
        onTap: () => setState(() => payment = id),
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
            Expanded(
              child: Text(label,
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: selected ? AppColors.ink : AppColors.inkSoft)),
            ),
            Icon(selected ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded,
                color: selected ? AppColors.primary : AppColors.faint, size: 22),
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

  Widget _row(String label, String value, {bool bold = false}) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: TextStyle(
                  fontSize: bold ? 16 : 14, fontWeight: bold ? FontWeight.w800 : FontWeight.w500, color: bold ? AppColors.ink : AppColors.muted)),
          Text(value,
              style: TextStyle(
                  fontSize: bold ? 18 : 14, fontWeight: bold ? FontWeight.w800 : FontWeight.w700, color: bold ? AppColors.primary : AppColors.ink)),
        ],
      );
}
