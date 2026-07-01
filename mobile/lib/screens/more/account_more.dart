import 'package:flutter/material.dart';
import '../../data/mock_data.dart';
import '../../data/shop_state.dart';
import '../../theme/app_theme.dart';
import '../../widgets/kit.dart';
import '../../widgets/common.dart';
import '../../widgets/product_card.dart';
import 'support_extra.dart';

class WishlistScreen extends StatelessWidget {
  final Locale locale;
  const WishlistScreen({super.key, this.locale = const Locale('en')});
  @override
  Widget build(BuildContext context) {
    final items = products.where((p) => p.id % 2 == 1).toList();
    return Scaffold(
      appBar: backAppBar(context, 'Wishlist'),
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

  bool _isUnread(int i) => _items[i].$6 && !_read.contains(i);

  @override
  Widget build(BuildContext context) {
    final unreadCount = List.generate(_items.length, (i) => i).where(_isUnread).length;
    return Scaffold(
      appBar: backAppBar(context, unreadCount > 0 ? 'Notifications ($unreadCount)' : 'Notifications', actions: [
        TextButton(
          onPressed: unreadCount == 0
              ? null
              : () {
                  setState(() => _read.addAll(List.generate(_items.length, (i) => i)));
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('All notifications marked as read')));
                },
          child: const Text('Mark all'),
        ),
      ]),
      body: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        itemCount: _items.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, i) {
          final n = _items[i];
          final unread = _isUnread(i);
          return GestureDetector(
            onTap: () {
              setState(() => _read.add(i));
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

class AddressBookScreen extends StatelessWidget {
  final Locale locale;
  const AddressBookScreen({super.key, this.locale = const Locale('en')});
  @override
  Widget build(BuildContext context) {
    const addrs = [
      ('Home', '12 Commerce Ave, Gombe, Kinshasa', '+243 970 000 000', true, Icons.home_rounded),
      ('Work', 'Tower B, Limete Industrial, Kinshasa', '+243 971 111 222', false, Icons.work_rounded),
    ];
    return Scaffold(
      appBar: backAppBar(context, 'Addresses'),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          ...addrs.map((a) {
            void openEdit() => Navigator.push(context, MaterialPageRoute(builder: (_) => AddressFormScreen(
                  locale: locale,
                  label: a.$1,
                  name: 'Marie Dubois',
                  phone: a.$3,
                  address: a.$2,
                )));
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: GestureDetector(
                onTap: openEdit,
                child: Panel(
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Container(height: 44, width: 44, decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)), child: Icon(a.$5, color: AppColors.primary)),
                    const SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Text(a.$1, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
                        const SizedBox(width: 8),
                        if (a.$4) Pill('Default', color: AppColors.primary.withValues(alpha: 0.12), textColor: AppColors.primary, fontSize: 10.5),
                      ]),
                      const SizedBox(height: 4),
                      Text(a.$2, style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
                      const SizedBox(height: 2),
                      Text(a.$3, style: const TextStyle(color: AppColors.faint, fontSize: 12)),
                    ])),
                    IconButton(icon: const Icon(Icons.edit_rounded, size: 18, color: AppColors.faint), onPressed: openEdit),
                  ]),
                ),
              ),
            );
          }),
          const SizedBox(height: 4),
          OutlinedButton.icon(
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => AddressFormScreen(locale: locale))),
              icon: const Icon(Icons.add_location_alt_rounded, size: 20), label: const Text('Add new address')),
        ],
      ),
    );
  }
}
