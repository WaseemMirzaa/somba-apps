import 'package:flutter/material.dart';
import '../../data/mock_data.dart';
import '../../theme/app_theme.dart';
import '../../widgets/kit.dart';
import '../../widgets/common.dart';
import '../../widgets/product_card.dart';

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

class NotificationsScreen extends StatelessWidget {
  final Locale locale;
  const NotificationsScreen({super.key, this.locale = const Locale('en')});
  @override
  Widget build(BuildContext context) {
    const items = [
      (Icons.local_shipping_rounded, AppColors.primary, 'Out for delivery', 'Your order SMB-2026-4821 is on the way.', '2m', true),
      (Icons.bolt_rounded, AppColors.accent, 'Flash sale live', 'Up to 30% off electronics — ends tonight.', '1h', true),
      (Icons.check_circle_rounded, AppColors.success, 'Order delivered', 'SMB-2026-4712 was delivered. Rate it?', '1d', false),
      (Icons.account_balance_wallet_rounded, AppColors.royalBlue, 'Wallet top-up', '\$50 added to your Somba wallet.', '2d', false),
      (Icons.local_offer_rounded, AppColors.amber, 'Coupon unlocked', 'SAVE10 — 10% off your next order.', '3d', false),
    ];
    return Scaffold(
      appBar: backAppBar(context, 'Notifications', actions: [
        TextButton(onPressed: () {}, child: const Text('Mark all')),
      ]),
      body: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, i) {
          final n = items[i];
          return Panel(
            padding: const EdgeInsets.all(14),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(height: 42, width: 42, decoration: BoxDecoration(color: n.$2.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)), child: Icon(n.$1, color: n.$2, size: 21)),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text(n.$3, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14))),
                  Text(n.$5, style: const TextStyle(color: AppColors.faint, fontSize: 11.5)),
                ]),
                const SizedBox(height: 3),
                Text(n.$4, style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
              ])),
              if (n.$6) Container(margin: const EdgeInsets.only(left: 8, top: 4), height: 8, width: 8, decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle)),
            ]),
          );
        },
      ),
    );
  }
}

class WalletScreen extends StatelessWidget {
  final Locale locale;
  const WalletScreen({super.key, this.locale = const Locale('en')});
  @override
  Widget build(BuildContext context) {
    const tx = [
      (Icons.add_rounded, 'Top-up · Airtel Money', '+\$50.00', true),
      (Icons.shopping_bag_rounded, 'Order SMB-2026-4821', '-\$29.00', false),
      (Icons.card_giftcard_rounded, 'Referral reward', '+\$5.00', true),
      (Icons.replay_rounded, 'Refund · SMB-2026-4712', '+\$18.00', true),
    ];
    return Scaffold(
      appBar: backAppBar(context, 'Somba Wallet'),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.circular(24), boxShadow: AppShadow.soft),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Available balance', style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 13.5)),
              const SizedBox(height: 6),
              const Text('\$240.00', style: TextStyle(color: Colors.white, fontSize: 40, fontWeight: FontWeight.w800, fontFamily: 'PlusJakartaSans', letterSpacing: -1)),
              const SizedBox(height: 18),
              Row(children: [
                Expanded(child: _walletBtn(Icons.add_rounded, 'Top up')),
                const SizedBox(width: 12),
                Expanded(child: _walletBtn(Icons.north_east_rounded, 'Send')),
              ]),
            ]),
          ),
          const SectionHeader('Recent activity', padding: EdgeInsets.fromLTRB(4, 22, 4, 10)),
          ...tx.map((t) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Panel(
                  padding: const EdgeInsets.all(14),
                  child: Row(children: [
                    Container(height: 42, width: 42, decoration: BoxDecoration(color: (t.$4 ? AppColors.success : AppColors.ink).withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)), child: Icon(t.$1, color: t.$4 ? AppColors.success : AppColors.ink, size: 20)),
                    const SizedBox(width: 12),
                    Expanded(child: Text(t.$2, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5))),
                    Text(t.$3, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: t.$4 ? AppColors.success : AppColors.ink)),
                  ]),
                ),
              )),
        ],
      ),
    );
  }

  Widget _walletBtn(IconData icon, String label) => Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(14)),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(icon, color: Colors.white, size: 18),
          const SizedBox(width: 6),
          Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13.5)),
        ]),
      );
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
          ...addrs.map((a) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
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
                    const Icon(Icons.edit_rounded, size: 18, color: AppColors.faint),
                  ]),
                ),
              )),
          const SizedBox(height: 4),
          OutlinedButton.icon(onPressed: () {}, icon: const Icon(Icons.add_location_alt_rounded, size: 20), label: const Text('Add new address')),
        ],
      ),
    );
  }
}
