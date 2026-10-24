import 'package:flutter/material.dart';
import '../../data/catalog_live.dart';
import '../../l10n/notification_text.dart';
import '../../l10n/strings.dart';
import '../../services/realtime_store.dart';
import '../../data/shop_state.dart';
import '../../theme/app_theme.dart';
import '../../widgets/kit.dart';
import '../../widgets/common.dart';
import '../../widgets/product_actions.dart';
import '../notice_router.dart';
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
        final s = Strings.of(context);
        final ids = RealtimeStore.instance.wishlistIds;
        final items = liveCatalog().where((p) => ids.contains(p.uuid)).toList();
        return Scaffold(
          appBar: backAppBar(context, s.wishlist),
          body: items.isEmpty
              ? Center(child: Text(s.wishlistEmpty, style: const TextStyle(color: AppColors.muted)))
              : GridView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, childAspectRatio: 0.62, crossAxisSpacing: 14, mainAxisSpacing: 14),
                  itemCount: items.length,
                  itemBuilder: (_, i) => productCard(context, items[i], locale),
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
        'order' => (Icons.receipt_long_rounded, AppColors.primary),
        'delivery' => (Icons.local_shipping_rounded, AppColors.primary),
        'payment' => (Icons.payments_rounded, AppColors.success),
        'return' || 'dispute' || 'exchange' || 'replacement' => (Icons.assignment_return_rounded, AppColors.royalBlue),
        'broadcast' || 'promo' => (Icons.campaign_rounded, AppColors.royalBlue),
        'support' => (Icons.headset_mic_rounded, AppColors.royalBlue),
        _ => (Icons.notifications_rounded, AppColors.primary),
      };

  static String _ago(Strings s, DateTime? d) {
    if (d == null) return '';
    final diff = DateTime.now().difference(d);
    if (diff.inMinutes < 1) return s.agoNow;
    if (diff.inMinutes < 60) return s.agoM(diff.inMinutes);
    if (diff.inHours < 24) return s.agoH(diff.inHours);
    return s.agoD(diff.inDays);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: RealtimeStore.instance,
      builder: (context, _) {
        final s = Strings.of(context);
        final store = RealtimeStore.instance;
        final items = store.notifications;
        final unread = store.unreadCount;
        return Scaffold(
          appBar: backAppBar(context, unread > 0 ? s.notificationsN(unread) : s.notifications, actions: [
            TextButton(onPressed: unread == 0 ? null : () => store.markAllRead(), child: Text(s.markAll)),
          ]),
          body: items.isEmpty
              ? Center(child: Text(s.allCaughtUp, style: const TextStyle(color: AppColors.muted)))
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    final n = items[i];
                    final text = displayNotice(s, title: n.title, body: n.body, titleFr: n.titleFr, bodyFr: n.bodyFr);
                    final (icon, color) = _style(n.type);
                    return GestureDetector(
                      // Same destinations as a push tap: the order, its tracking, the wallet, the return or the ticket.
                      onTap: () => openNotice(Navigator.of(context), locale,
                          type: n.type, entityId: n.entityId, notificationId: n.id, fromInbox: true),
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
                              Expanded(child: Text(text.$1, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14))),
                              Text(_ago(s, n.createdAt), style: const TextStyle(color: AppColors.faint, fontSize: 11.5)),
                            ]),
                            const SizedBox(height: 3),
                            Text(text.$2, style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
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
        final s = Strings.of(context);
        final store = RealtimeStore.instance;
        final selectedId = ShopState.instance.selectedAddressId;
        return Scaffold(
          appBar: backAppBar(context, pickMode ? s.deliverTo : s.addresses),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              if (store.addresses.isEmpty) Panel(child: Text(s.addrNone, style: const TextStyle(color: AppColors.muted))),
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
                            if (a.isDefault) Pill(s.defaultLabel, color: AppColors.primary.withValues(alpha: 0.12), textColor: AppColors.primary, fontSize: 10.5),
                          ]),
                          const SizedBox(height: 4),
                          Text(a.oneLine, style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
                          if ((a.line2 ?? '').isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 2),
                              child: Text('↳ ${a.line2}', style: const TextStyle(color: AppColors.muted, fontSize: 12, fontStyle: FontStyle.italic)),
                            ),
                          if (a.hasPin)
                            Padding(
                              padding: const EdgeInsets.only(top: 3),
                              child: Text('📍 ${s.addrMapPinnedBadge}', style: const TextStyle(color: AppColors.success, fontSize: 11.5, fontWeight: FontWeight.w600)),
                            ),
                          if ((a.phone ?? '').isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(a.phone!, style: const TextStyle(color: AppColors.faint, fontSize: 12)),
                          ],
                        ])),
                        PopupMenuButton<String>(
                          key: ValueKey('address-menu-${a.id}'),
                          icon: const Icon(Icons.more_vert_rounded, color: AppColors.faint),
                          onSelected: (v) async {
                            final messenger = ScaffoldMessenger.of(context);
                            try {
                              switch (v) {
                                case 'edit':
                                  await Navigator.push(context, MaterialPageRoute(builder: (_) => AddressFormScreen(locale: locale, existing: a)));
                                case 'default':
                                  await store.updateAddress(a.id, {'isDefault': true});
                                  messenger.showSnackBar(SnackBar(content: Text(s.addrDefaultDone)));
                                case 'delete':
                                  await store.removeAddress(a.id);
                                  if (ShopState.instance.selectedAddressId == a.id) ShopState.instance.selectedAddressId = null;
                                  messenger.showSnackBar(SnackBar(content: Text(s.addrRemoved)));
                              }
                            } catch (e) {
                              messenger.showSnackBar(SnackBar(content: Text(Strings.current.errorText(e))));
                            }
                          },
                          itemBuilder: (_) => [
                            PopupMenuItem(value: 'edit', key: const ValueKey('address-edit'), child: Text(s.addrEdit)),
                            if (!a.isDefault) PopupMenuItem(value: 'default', key: const ValueKey('address-make-default'), child: Text(s.addrMakeDefault)),
                            PopupMenuItem(value: 'delete', key: const ValueKey('address-delete'), child: Text(s.delete, style: const TextStyle(color: AppColors.danger))),
                          ],
                        ),
                      ]),
                    ),
                  ),
                );
              }),
              const SizedBox(height: 4),
              OutlinedButton(
                  key: const ValueKey('add-address'),
                  onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => AddressFormScreen(locale: locale))),
                  child: Text(s.addrAddNew)),
            ],
          ),
        );
      },
    );
  }
}
