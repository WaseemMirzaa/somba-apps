import 'package:flutter/material.dart';
import '../../data/catalog_live.dart';
import '../../services/realtime_store.dart';
import '../../data/shop_state.dart';
import '../../theme/app_theme.dart';
import '../../widgets/kit.dart';
import '../../widgets/common.dart';
import '../../widgets/product_card.dart';
import '../order_detail_link.dart';
import 'support_extra.dart';

/// Wishlist — stored on the server, so it follows the customer across devices.
class WishlistScreen extends StatelessWidget {
  final Locale locale;
  const WishlistScreen({super.key, this.locale = const Locale('en')});
  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: RealtimeStore.instance,
      builder: (context, _) {
        final ids = RealtimeStore.instance.wishlistIds;
        final items = liveCatalog().where((p) => ids.contains(p.uuid)).toList();
        return Scaffold(
          appBar: backAppBar(context, 'Wishlist'),
          body: items.isEmpty
              ? const Center(child: Text('Tap the heart on a product to save it here.', style: TextStyle(color: AppColors.muted)))
              : GridView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, childAspectRatio: 0.62, crossAxisSpacing: 14, mainAxisSpacing: 14),
                  itemCount: items.length,
                  itemBuilder: (_, i) => ProductCard(product: items[i], lang: locale.languageCode),
                ),
        );
      },
    );
  }
}

/// Notifications — pushed live by the server (order updates, payments, news).
class NotificationsScreen extends StatelessWidget {
  final Locale locale;
  const NotificationsScreen({super.key, this.locale = const Locale('en')});

  static (IconData, Color) _style(String type) => switch (type) {
        'order' => (Icons.local_shipping_rounded, AppColors.primary),
        'payment' => (Icons.payments_rounded, AppColors.success),
        'broadcast' || 'promo' => (Icons.campaign_rounded, AppColors.royalBlue),
        'support' => (Icons.headset_mic_rounded, AppColors.royalBlue),
        _ => (Icons.notifications_rounded, AppColors.primary),
      };

  static String _ago(DateTime? d) {
    if (d == null) return '';
    final diff = DateTime.now().difference(d);
    if (diff.inMinutes < 1) return 'now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    return '${diff.inDays}d';
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: RealtimeStore.instance,
      builder: (context, _) {
        final store = RealtimeStore.instance;
        final items = store.notifications;
        final unread = store.unreadCount;
        return Scaffold(
          appBar: backAppBar(context, unread > 0 ? 'Notifications ($unread)' : 'Notifications', actions: [
            TextButton(onPressed: unread == 0 ? null : () => store.markAllRead(), child: const Text('Mark all')),
          ]),
          body: items.isEmpty
              ? const Center(child: Text('You are all caught up.', style: TextStyle(color: AppColors.muted)))
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    final n = items[i];
                    final (icon, color) = _style(n.type);
                    return GestureDetector(
                      onTap: () {
                        if (!n.read) store.markRead(n.id);
                        if (n.type == 'order' && n.entityId != null && store.orderById(n.entityId!) != null) {
                          openOrder(context, locale, n.entityId!);
                        }
                      },
                      child: Panel(
                        padding: const EdgeInsets.all(14),
                        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Container(
                              height: 42,
                              width: 42,
                              decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                              child: Icon(icon, color: color, size: 21)),
                          const SizedBox(width: 12),
                          Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Row(children: [
                              Expanded(child: Text(n.title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14))),
                              Text(_ago(n.createdAt), style: const TextStyle(color: AppColors.faint, fontSize: 11.5)),
                            ]),
                            const SizedBox(height: 3),
                            Text(n.body, style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
                          ])),
                          if (!n.read)
                            Container(margin: const EdgeInsets.only(left: 8, top: 4), height: 8, width: 8, decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle)),
                        ]),
                      ),
                    );
                  },
                ),
        );
      },
    );
  }
}

/// Address book — saved on the server. With [pickMode] (from checkout) tapping an
/// address selects it for delivery.
class AddressBookScreen extends StatelessWidget {
  final Locale locale;
  final bool pickMode;
  const AddressBookScreen({super.key, this.locale = const Locale('en'), this.pickMode = false});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: RealtimeStore.instance,
      builder: (context, _) {
        final store = RealtimeStore.instance;
        final selectedId = ShopState.instance.selectedAddressId;
        return Scaffold(
          appBar: backAppBar(context, pickMode ? 'Deliver to' : 'Addresses'),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              if (store.addresses.isEmpty) const Panel(child: Text('No saved addresses yet.', style: TextStyle(color: AppColors.muted))),
              ...store.addresses.map((a) {
                final chosen = pickMode && (a.id == selectedId || (selectedId == null && a.isDefault));
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: GestureDetector(
                    onTap: () {
                      if (pickMode) {
                        ShopState.instance.selectedAddressId = a.id;
                        ShopState.instance.save();
                        Navigator.pop(context);
                      }
                    },
                    child: Panel(
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Container(
                            height: 44,
                            width: 44,
                            decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
                            child: Icon(chosen ? Icons.check_circle_rounded : Icons.location_on_rounded, color: AppColors.primary)),
                        const SizedBox(width: 12),
                        Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Text(a.label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
                            const SizedBox(width: 8),
                            if (a.isDefault) Pill('Default', color: AppColors.primary.withValues(alpha: 0.12), textColor: AppColors.primary, fontSize: 10.5),
                          ]),
                          const SizedBox(height: 4),
                          Text(a.oneLine, style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
                          if ((a.phone ?? '').isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(a.phone!, style: const TextStyle(color: AppColors.faint, fontSize: 12)),
                          ],
                        ])),
                        IconButton(
                          tooltip: 'Delete',
                          icon: const Icon(Icons.delete_outline_rounded, size: 20, color: AppColors.faint),
                          onPressed: () async {
                            final messenger = ScaffoldMessenger.of(context);
                            try {
                              await store.removeAddress(a.id);
                              if (ShopState.instance.selectedAddressId == a.id) ShopState.instance.selectedAddressId = null;
                            } catch (e) {
                              messenger.showSnackBar(SnackBar(content: Text(e.toString())));
                            }
                          },
                        ),
                      ]),
                    ),
                  ),
                );
              }),
              const SizedBox(height: 4),
              OutlinedButton.icon(
                  key: const ValueKey('add-address'),
                  onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => AddressFormScreen(locale: locale))),
                  icon: const Icon(Icons.add_location_alt_rounded, size: 20),
                  label: const Text('Add new address')),
            ],
          ),
        );
      },
    );
  }
}
