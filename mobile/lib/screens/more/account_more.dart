import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../data/mock_data.dart';
import '../../data/repository.dart';
import '../../data/shop_state.dart';
import '../../theme/app_theme.dart';
import '../../l10n/strings.dart';
import '../../widgets/kit.dart';
import '../../widgets/common.dart';
import '../../widgets/product_card.dart';
import 'address_flow.dart';

class WishlistScreen extends StatelessWidget {
  final Locale locale;
  const WishlistScreen({super.key, this.locale = const Locale('en')});
  @override
  Widget build(BuildContext context) {
    // The customer's real wishlist (hydrated from the API when signed in).
    final wl = ShopState.instance.wishlist;
    final items = products.where((p) => wl.contains(p.id)).toList();
    return Scaffold(
      appBar: backAppBar(context, trl(locale.languageCode, 'Wishlist')),
      body: GridView.builder(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, childAspectRatio: 0.62, crossAxisSpacing: 14, mainAxisSpacing: 14),
        itemCount: items.length,
        itemBuilder: (_, i) => ProductCard(product: items[i], lang: locale.languageCode),
      ),
    );
  }
}

class NotificationsScreen extends StatefulWidget {
  final Locale locale;
  const NotificationsScreen({super.key, this.locale = const Locale('en')});
  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final _read = ShopState.instance.readNotifications;

  // (icon, color, title, body, time, originallyUnread, isBroadcast)
  static const _items = [
    (Icons.local_shipping_rounded, AppColors.primary, 'Out for delivery', 'Your order SMB-2026-4821 is on the way.', '2m', true, false),
    (Icons.campaign_rounded, AppColors.royalBlue, 'Weekend mega sale', 'Somba&Teka: up to 50% off this weekend only!', '40m', true, true),
    (Icons.bolt_rounded, AppColors.accent, 'Flash sale live', 'Up to 30% off electronics — ends tonight.', '1h', true, false),
    (Icons.check_circle_rounded, AppColors.success, 'Order delivered', 'SMB-2026-4712 was delivered. Rate it?', '1d', false, false),
    (Icons.replay_rounded, AppColors.royalBlue, 'Refund processed', '\$18 refunded for SMB-2026-4712.', '2d', false, false),
    (Icons.local_offer_rounded, AppColors.amber, 'Coupon unlocked', 'SAVE10 — 10% off your next order.', '3d', false, false),
  ];

  // Live notifications from the API; falls back to [_items] when empty (offline/guest).
  List<(IconData, Color, String, String, String, bool, bool)>? _live;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final data = await Repo.instance.notifications();
    if (!mounted || data.isEmpty) return;
    setState(() => _live = data.map(_mapNotif).toList());
  }

  (IconData, Color, String, String, String, bool, bool) _mapNotif(Map<String, dynamic> n) {
    final (icon, color) = switch ((n['kind'] ?? '').toString()) {
      'order' => (Icons.shopping_bag_rounded, AppColors.primary),
      'delivery' => (Icons.local_shipping_rounded, AppColors.royalBlue),
      'refund' => (Icons.payments_rounded, AppColors.success),
      _ => (Icons.warning_amber_rounded, AppColors.amber),
    };
    final dt = DateTime.tryParse((n['date'] ?? '').toString());
    final time = dt != null ? DateFormat('MMM d').format(dt) : '';
    return (icon, color, (n['title'] ?? '').toString(), (n['body'] ?? '').toString(), time, true, false);
  }

  // The active source: live notifications when present, otherwise the mock.
  List<(IconData, Color, String, String, String, bool, bool)> get _source =>
      (_live != null && _live!.isNotEmpty) ? _live! : _items;

  bool _isUnread(int i) => _source[i].$6 && !_read.contains(i);

  @override
  Widget build(BuildContext context) {
    final unreadCount = List.generate(_source.length, (i) => i).where(_isUnread).length;
    return Scaffold(
      appBar: backAppBar(context, unreadCount > 0 ? '${tr(context, 'Notifications')} ($unreadCount)' : tr(context, 'Notifications'), actions: [
        TextButton(
          onPressed: unreadCount == 0
              ? null
              : () {
                  setState(() => _read.addAll(List.generate(_source.length, (i) => i)));
                  ShopState.instance.save();
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr(context, 'All notifications marked as read'))));
                },
          child: Text(tr(context, 'Mark all')),
        ),
      ]),
      body: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        itemCount: _source.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, i) {
          final n = _source[i];
          final unread = _isUnread(i);
          return GestureDetector(
            onTap: () {
              setState(() => _read.add(i));
              ShopState.instance.save();
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(n.$7 ? 'Opening promotion…' : 'Opening ${n.$3}…')));
            },
            child: Panel(
              padding: const EdgeInsets.all(14),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(height: 42, width: 42, decoration: BoxDecoration(color: n.$2.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)), child: Icon(n.$1, color: n.$2, size: 21)),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(n.$3, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14))),
                    if (n.$7) Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: Pill('News', color: AppColors.royalBlue.withValues(alpha: 0.12), textColor: AppColors.royalBlue, fontSize: 9.5),
                    ),
                    Text(n.$5, style: const TextStyle(color: AppColors.faint, fontSize: 11.5)),
                  ]),
                  const SizedBox(height: 3),
                  Text(n.$4, style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
                ])),
                if (unread) Container(margin: const EdgeInsets.only(left: 8, top: 4), height: 8, width: 8, decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle)),
              ]),
            ),
          );
        },
      ),
    );
  }
}

class AddressBookScreen extends StatefulWidget {
  final Locale locale;
  final bool selectMode;
  const AddressBookScreen({super.key, this.locale = const Locale('en'), this.selectMode = false});
  @override
  State<AddressBookScreen> createState() => _AddressBookScreenState();
}

class _AddressBookScreenState extends State<AddressBookScreen> {
  final shop = ShopState.instance;

  @override
  Widget build(BuildContext context) {
    final selectedId = shop.selectedAddress?.id;
    final lang = widget.locale.languageCode;
    return Scaffold(
      appBar: backAppBar(context, widget.selectMode ? trl(lang, 'Choose address') : trl(lang, 'Addresses')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          if (shop.addresses.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 40),
              child: Column(children: [
                const Icon(Icons.location_off_rounded, size: 48, color: AppColors.faint),
                const SizedBox(height: 12),
                Text(trl(lang, 'No saved addresses yet'), style: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w600)),
              ]),
            ),
          ...shop.addresses.map((a) {
            final icon = a.label.toLowerCase().contains('work') ? Icons.work_rounded : Icons.home_rounded;
            final selected = widget.selectMode && a.id == selectedId;
            void openEdit() async {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => AddressFormScreen(
                    locale: widget.locale, editingId: a.id, label: a.label, name: a.name, phone: a.phone, address: a.line, city: a.city, zone: a.zone)));
              if (mounted) setState(() {});
            }
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: GestureDetector(
                onTap: () {
                  if (widget.selectMode) {
                    setState(() => shop.selectedDeliveryAddressId = a.id);
                    Navigator.pop(context, a.id);
                  } else {
                    openEdit();
                  }
                },
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: selected ? AppColors.primary : Colors.transparent, width: 1.8),
                    boxShadow: AppShadow.card,
                  ),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Container(height: 44, width: 44, decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)), child: Icon(icon, color: AppColors.primary)),
                    const SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Text(a.label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
                        const SizedBox(width: 8),
                        if (a.isDefault) Pill(trl(lang, 'Default'), color: AppColors.primary.withValues(alpha: 0.12), textColor: AppColors.primary, fontSize: 10.5),
                      ]),
                      const SizedBox(height: 4),
                      Text('${a.line}, ${a.city}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
                      const SizedBox(height: 2),
                      Text('${a.phone} · Zone ${a.zone}', style: const TextStyle(color: AppColors.faint, fontSize: 12)),
                    ])),
                    widget.selectMode
                        ? Icon(selected ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded, color: selected ? AppColors.primary : AppColors.faint)
                        : IconButton(icon: const Icon(Icons.edit_rounded, size: 18, color: AppColors.faint), onPressed: openEdit),
                  ]),
                ),
              ),
            );
          }),
          const SizedBox(height: 4),
          OutlinedButton.icon(
              onPressed: () async {
                await Navigator.push(context, MaterialPageRoute(builder: (_) => AddressPickerScreen(locale: widget.locale)));
                if (mounted) setState(() {});
              },
              icon: const Icon(Icons.add_location_alt_rounded, size: 20), label: Text(trl(lang, 'Add new address'))),
        ],
      ),
    );
  }
}
