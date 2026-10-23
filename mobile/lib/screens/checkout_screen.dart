import 'package:flutter/material.dart';
import '../data/catalog_live.dart';
import '../data/market_profiles.dart';
import '../data/shop_state.dart';
import '../l10n/strings.dart';
import '../services/models.dart';
import '../services/realtime_store.dart';
import '../theme/app_theme.dart';
import '../util/format.dart';
import '../util/zone_match.dart';
import '../util/delivery_estimate.dart';
import '../widgets/mobile_money.dart';
import '../widgets/verify_prompt.dart';
import 'order_success_screen.dart';
import 'payment_pending_screen.dart';
import 'more/account_more.dart';
import 'more/support_extra.dart';

class CheckoutScreen extends StatefulWidget {
  final Locale locale;

  /// "Buy now": check out only these lines. The saved cart is left untouched.
  /// Null → check out the whole cart.
  final List<CartItem>? lines;

  const CheckoutScreen({super.key, required this.locale, this.lines});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final shop = ShopState.instance;
  final _phone = TextEditingController();
  final _promo = TextEditingController();
  final _phoneFocus = FocusNode();
  final _phoneKey = GlobalKey();
  String payment = 'airtel_money';
  String? _phoneError;
  bool _placing = false;


  @override
  void initState() {
    super.initState();
    _phone.text = RealtimeStore.instance.user?.phone ?? '';
    shop.syncWithCatalog();
    // Stock ran out since the cart was opened: say which lines changed.
    final notices = shop.takeStockNotices();
    if (notices.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _toast(notices.join('\n'));
      });
    }
    if (_buyNow) _refreshLines();
    final applied = shop.appliedPromo;
    if (applied != null && (applied.forSubtotal - _subtotal).abs() < 0.005) _promo.text = applied.code;
  }

  bool get _buyNow => widget.lines != null;

  /// The lines being bought: the buy-now item(s) or the whole cart.
  List<CartItem> get _lines => widget.lines ?? shop.cart;
  double get _subtotal => _lines.fold(0.0, (s, i) => s + i.product.price * i.qty);

  /// How many distinct sellers will pack this order (the cart may mix sellers).
  int get _sellerCount => _lines.map((l) => l.product.sellerId ?? l.product.sellerName).whereType<String>().toSet().length;

  Widget _summaryLine(Strings s, String lang, CartItem line) {
    final seller = line.product.sellerName ?? '';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${line.qty} × ${line.product.displayName(lang)}',
                maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
            if (seller.isNotEmpty)
              Text(s.soldBy(seller),
                  key: ValueKey('checkout-sold-by-${line.product.id}'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.muted, fontSize: 12, fontWeight: FontWeight.w600)),
          ]),
        ),
        const SizedBox(width: 8),
        Text(money(line.product.price * line.qty), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
      ]),
    );
  }

  /// Prices/stock of a buy-now line follow the live catalogue like cart lines do.
  void _refreshLines() {
    for (final c in widget.lines!) {
      final fresh = productByUuid(c.product.uuid);
      if (fresh != null) c.product = fresh;
    }
  }

  /// The SERVER validates the code (and applies it again when the order is placed).
  Future<void> _applyPromo() async {
    final code = _promo.text.trim();
    if (code.isEmpty) return;
    final error = await shop.applyPromo(code, subtotalUsd: _subtotal);
    if (!mounted) return;
    setState(() {});
    _toast(error ?? Strings.of(context).promoApplied(shop.appliedPromo!.code));
  }

  @override
  void dispose() {
    _promo.dispose();
    _phone.dispose();
    _phoneFocus.dispose();
    super.dispose();
  }


  /// The address the order will be delivered to (chosen, else default, else first).
  AddressDto? get _address {
    final list = RealtimeStore.instance.addresses;
    if (list.isEmpty) return null;
    return list.firstWhere((a) => a.id == shop.selectedAddressId,
        orElse: () => list.firstWhere((a) => a.isDefault, orElse: () => list.first));
  }

  Future<void> _placeOrder(double deliveryFee) async {
    final store = RealtimeStore.instance;
    final s = Strings.of(context);
    final address = _address;
    if (_lines.isEmpty) return;
    if (!await ensureVerified(context, forTopUp: false)) return;
    if (!mounted) return;
    if (address == null) {
      _toast(s.checkoutAddAddressFirst);
      return;
    }
    // Zones are not shown to the shopper: the address decides. Without a zone there is no fee to charge.
    final zone = _addressZone;
    if (zone == null) {
      _toast(_lacksCommune(address) ? s.checkoutNeedCommune : s.checkoutNotServed);
      return;
    }
    if (isMobileMoney(payment)) {
      final err = validateMobileNumber(_phone.text, s);
      setState(() => _phoneError = err);
      if (err != null) {
        // The field is far above the button: say so here and bring the field to the shopper.
        _toast(_phone.text.trim().isEmpty ? s.checkoutFixPhone : err);
        final field = _phoneKey.currentContext;
        if (field != null && field.mounted) {
          await Scrollable.ensureVisible(field, alignment: 0.3, duration: const Duration(milliseconds: 250));
        }
        if (mounted) _phoneFocus.requestFocus();
        return;
      }
    }
    if (payment == 'wallet' && store.walletBalance + 0.001 < _subtotal + deliveryFee - shop.promoDiscount(_subtotal)) {
      _toast(s.checkoutWalletLow);
      return;
    }
    final zoneId = zone.id;
    var retryAfterVerify = false;
    setState(() => _placing = true);
    try {
      final order = await store.placeOrder(
        // Lines reference real listings; the SERVER prices them.
        items: _lines.map((c) => {'productId': c.product.uuid, 'qty': c.qty, 'variant': c.variant}).toList(),
        paymentMethod: payment,
        paymentPhone: isMobileMoney(payment) ? _phone.text.trim() : null,
        deliveryFeeUsd: deliveryFee,
        zoneId: zoneId,
        promoCode: _buyNow ? (shop.promoDiscount(_subtotal) > 0 ? shop.appliedPromo?.code : null) : shop.appliedPromo?.code,
        address: {
          'label': address.label,
          'line1': address.line1,
          if (address.line2 != null) 'line2': address.line2,
          'city': address.city,
          if (address.commune != null) 'commune': address.commune,
          if (address.phone != null) 'phone': address.phone,
          // The pin travels with the order so the rider can navigate to the exact spot.
          if (address.geo != null) 'geo': {'lat': address.geo!.lat, 'lng': address.geo!.lng, if (address.geo!.placeId != null) 'placeId': address.geo!.placeId},
          'zone': zoneId,
        },
      );
      // The order now owns these lines (and holds the stock). A buy-now order leaves the saved cart alone.
      if (_buyNow) {
        shop.appliedPromo = null;
      } else {
        shop.clearCart();
      }
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
      if (isVerificationError(e) && mounted) {
        retryAfterVerify = await ensureVerified(context, forTopUp: false, force: true);
      } else {
        _toast(Strings.current.errorText(e));
      }
    } finally {
      if (mounted) setState(() => _placing = false);
    }
    // Just verified from the prompt: place the order the shopper asked for.
    if (retryAfterVerify && mounted) await _placeOrder(deliveryFee);
  }

  void _toast(String m) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(m)));

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(listenable: RealtimeStore.instance, builder: (_, __) => _scaffold(context));
  }

  /// The delivery zone of the delivery address (its saved zone, else its commune); null when we don't deliver there.
  /// The shopper never picks a zone: it is internal pricing, decided by the address.
  Zone? get _addressZone {
    final a = _address;
    if (a == null) return null;
    return zoneForAddress(commune: a.commune, city: a.city, zoneId: a.zoneId, zones: activeZones);
  }

  /// An address typed without its commune cannot be priced: the shopper is asked to add it.
  static bool _lacksCommune(AddressDto a) => (a.commune ?? '').trim().isEmpty && a.zoneId == null;

  Future<void> _fixAddress(AddressDto a) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _lacksCommune(a)
            ? AddressFormScreen(locale: widget.locale, existing: a)
            : AddressBookScreen(locale: widget.locale, pickMode: true),
      ),
    );
    if (mounted) setState(() {});
  }

  /// Keep the remembered zone in step with the address, so the cart's delivery estimate matches checkout.
  void _syncZoneFromAddress() {
    final z = _addressZone;
    if (z != null && z.id != shop.selectedZoneId) {
      shop.selectedZoneId = z.id;
      shop.save();
    }
  }

  Widget _scaffold(BuildContext context) {
    final s = Strings.of(context);
    final lang = s.lang;
    final store = RealtimeStore.instance;
    _syncZoneFromAddress();
    final zone = _addressZone;
    // No address yet: the usual estimate. An address we don't serve: nothing to charge (and ordering is blocked).
    final deliveryFee = _address == null ? deliveryFeeUsd : (zone?.deliveryFeeUsd ?? 0);
    final unpriced = _address != null && zone == null; // ordering is blocked until the address is fixed
    if (_buyNow) _refreshLines();
    final subtotal = _subtotal;
    final discount = shop.promoDiscount(subtotal);
    final total = subtotal + deliveryFee - discount;
    final address = _address;
    final savings = _lines.fold(0.0, (sum, i) => sum + ((i.product.strikePrice ?? i.product.price) - i.product.price) * i.qty);

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
                    ? Text(s.checkoutNoAddress,
                        key: const ValueKey('no-address'), style: const TextStyle(color: AppColors.muted, fontSize: 14))
                    : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text([address.label, if ((address.phone ?? '').isNotEmpty) address.phone].join(' · '),
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
                child: Text(address == null ? s.add : s.change),
              ),
            ]),
          ),
          if (unpriced)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Container(
                key: const ValueKey('address-not-served'),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: AppColors.dangerSoft, borderRadius: BorderRadius.circular(12)),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Icon(Icons.info_outline_rounded, size: 18, color: AppColors.dangerStrong),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(_lacksCommune(address!) ? s.checkoutNeedCommune : s.checkoutNotServed,
                          style: const TextStyle(color: AppColors.dangerStrong, fontSize: 12.5, fontWeight: FontWeight.w600, height: 1.35)),
                      TextButton(
                        key: const ValueKey('fix-address'),
                        style: TextButton.styleFrom(padding: EdgeInsets.zero, foregroundColor: AppColors.dangerStrong),
                        onPressed: () => _fixAddress(address),
                        child: Text(_lacksCommune(address) ? s.checkoutEditAddress : s.checkoutChangeAddress),
                      ),
                    ]),
                  ),
                ]),
              ),
            ),
          const SizedBox(height: 22),
          // Each product's delivery time is set by its seller; the shopper only sees the resulting estimate.
          _sectionTitle(s.estimatedDelivery),
          const SizedBox(height: 10),
          _card(
            child: Row(children: [
              const Icon(Icons.event_available_rounded, color: AppColors.primary, size: 22),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(dayLabel(estimateFor(_lines.map((c) => c.product.deliveryDays)), lang) ?? '—',
                      key: const ValueKey('delivery-estimate'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                  const SizedBox(height: 2),
                  Text(s.deliveryEstimateHint, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: 22),
          _sectionTitle(s.payment),
          const SizedBox(height: 10),
          _methodTile('wallet', Icons.account_balance_wallet_rounded,
              '${s.payWallet} · ${money(store.walletBalance)}'),
          for (final m in mobileMoneyMethods) _methodTile(m, Icons.smartphone_rounded, s.paymentLabel(m)),
          if (isMobileMoney(payment)) ...[
            const SizedBox(height: 4),
            KeyedSubtree(
              key: _phoneKey,
              child: TextField(
                key: const ValueKey('mm-phone'),
                controller: _phone,
                focusNode: _phoneFocus,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(
                  labelText: s.mmNumber,
                  hintText: '+243 81 234 5678',
                  errorText: _phoneError,
                  prefixIcon: const Icon(Icons.smartphone_rounded, size: 20),
                  helperText: s.mmHelper,
                ),
              ),
            ),
          ],
          const SizedBox(height: 18),
          _sectionTitle(s.promoHint),
          const SizedBox(height: 10),
          _card(
            child: Row(children: [
              const Icon(Icons.local_offer_rounded, size: 18, color: AppColors.primary),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  key: const ValueKey('checkout-promo'),
                  controller: _promo,
                  textCapitalization: TextCapitalization.characters,
                  onSubmitted: (_) => _applyPromo(),
                  decoration: InputDecoration(
                    isDense: true,
                    hintText: s.promoHint,
                    border: InputBorder.none,
                    hintStyle: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w500),
                  ),
                ),
              ),
              TextButton(key: const ValueKey('checkout-promo-apply'), onPressed: _applyPromo, child: Text(s.apply)),
            ]),
          ),
          const SizedBox(height: 18),
          _sectionTitle(s.orderSummary),
          const SizedBox(height: 10),
          if (_sellerCount > 1)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(s.checkoutOneDelivery(_sellerCount),
                  key: const ValueKey('checkout-sellers-note'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.35)),
            ),
          _card(
            child: Column(children: [
              for (final line in _lines) _summaryLine(s, lang, line),
              if (_lines.isNotEmpty) const Divider(height: 22),
              _row(s.subtotal, money(subtotal)),
              if (savings > 0)
                Align(
                  alignment: Alignment.centerRight,
                  child: Text(s.youSave(money(savings)),
                      key: const ValueKey('checkout-savings'), style: const TextStyle(fontSize: 12, color: AppColors.success, fontWeight: FontWeight.w700)),
                ),
              const SizedBox(height: 8),
              _row(s.delivery, unpriced ? '—' : deliveryFee == 0 ? s.free.toUpperCase() : money(deliveryFee)),
              if (discount > 0) ...[
                const SizedBox(height: 8),
                _row(s.promoRow(shop.appliedPromo!.code), '- ${money(discount)}'),
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
          onPressed: _placing || _lines.isEmpty ? null : () => _placeOrder(deliveryFee),
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
              child: Text(label, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: selected ? AppColors.ink : AppColors.inkSoft)),
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
              style: TextStyle(fontSize: bold ? 16 : 14, fontWeight: bold ? FontWeight.w800 : FontWeight.w500, color: bold ? AppColors.ink : AppColors.muted)),
          Text(value,
              style:
                  TextStyle(fontSize: bold ? 18 : 14, fontWeight: bold ? FontWeight.w800 : FontWeight.w700, color: bold ? AppColors.primary : AppColors.ink)),
        ],
      );
}
