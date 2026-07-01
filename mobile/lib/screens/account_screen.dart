import 'package:flutter/material.dart';
import '../data/shop_state.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import 'orders_screen.dart';
import 'more/account_more.dart';
import 'more/support_extra.dart';

class AccountScreen extends StatelessWidget {
  final Locale locale;
  final void Function(Locale) onLocaleChanged;

  const AccountScreen({super.key, required this.locale, required this.onLocaleChanged});

  @override
  Widget build(BuildContext context) {
    final s = Strings(locale.languageCode);
    final lang = locale.languageCode;

    return Scaffold(
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          _profileHeader(context, s),
          const SizedBox(height: 18),
          _menuCard(context, [
            _MenuItem(Icons.shopping_bag_outlined, s.myOrders, AppColors.primary,
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrdersScreen(locale: locale)))),
            _MenuItem(Icons.favorite_border_rounded, s.wishlist, AppColors.accent,
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => WishlistScreen(locale: locale)))),
            _MenuItem(Icons.account_balance_wallet_outlined, s.wallet, AppColors.royalBlue,
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => WalletScreen(locale: locale)))),
            _MenuItem(Icons.location_on_outlined, s.addresses, AppColors.mint,
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => AddressBookScreen(locale: locale)))),
          ]),
          const SizedBox(height: 14),
          _languageCard(s),
          const SizedBox(height: 14),
          _menuCard(context, [
            _MenuItem(Icons.notifications_none_rounded, 'Notifications', AppColors.primary,
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => NotificationsScreen(locale: locale)))),
            _MenuItem(Icons.card_giftcard_rounded, 'Refer & Earn', AppColors.accent,
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReferScreen(locale: locale)))),
            _MenuItem(Icons.confirmation_number_outlined, 'Support', AppColors.royalBlue,
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => SupportListScreen(locale: locale)))),
            _MenuItem(Icons.help_outline_rounded, s.help, AppColors.inkSoft,
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => HelpScreen(locale: locale)))),
          ]),
          const SizedBox(height: 20),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.amber.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline_rounded, color: AppColors.amber, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      lang == 'fr' ? 'Mode prototype — données simulées.' : 'Prototype mode — mock data, no backend.',
                      style: const TextStyle(color: Color(0xFF92610A), fontSize: 12.5, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 120),
        ],
      ),
    );
  }

  Widget _profileHeader(BuildContext context, Strings s) {
    final top = MediaQuery.of(context).padding.top;
    return Container(
      padding: EdgeInsets.fromLTRB(20, top + 24, 20, 24),
      decoration: const BoxDecoration(
        gradient: AppColors.brandGradient,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white.withValues(alpha: 0.6), width: 2),
                ),
                child: const CircleAvatar(
                  radius: 32,
                  backgroundColor: Colors.white,
                  child: Text('MD',
                      style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 22)),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Marie Dubois',
                        style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 2),
                    Text('marie@email.com',
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13)),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(100),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.workspace_premium_rounded, color: Colors.white, size: 14),
                          SizedBox(width: 4),
                          Text('Gold member',
                              style: TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.symmetric(vertical: 14),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                _stat('12', s.orders),
                _divider(),
                _stat('${ShopState.instance.wishlist.length}', s.wishlist),
                _divider(),
                _stat('\$240', s.wallet),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _stat(String value, String label) => Expanded(
        child: Column(
          children: [
            Text(value, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12)),
          ],
        ),
      );

  Widget _divider() =>
      Container(width: 1, height: 30, color: Colors.white.withValues(alpha: 0.25));

  Widget _menuCard(BuildContext context, List<_MenuItem> items) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(20),
          boxShadow: AppShadow.card,
        ),
        child: Column(
          children: [
            for (int i = 0; i < items.length; i++) ...[
              ListTile(
                onTap: items[i].onTap,
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
                leading: Container(
                  height: 40,
                  width: 40,
                  decoration: BoxDecoration(
                    color: items[i].color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(items[i].icon, color: items[i].color, size: 21),
                ),
                title: Text(items[i].label,
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5)),
                trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
              ),
              if (i != items.length - 1)
                const Divider(height: 1, indent: 68, endIndent: 14),
            ],
          ],
        ),
      ),
    );
  }

  Widget _languageCard(Strings s) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(20),
          boxShadow: AppShadow.card,
        ),
        child: Row(
          children: [
            Container(
              height: 40,
              width: 40,
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.translate_rounded, color: AppColors.primary, size: 21),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(s.language,
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5)),
            ),
            SegmentedButton<String>(
              style: SegmentedButton.styleFrom(
                selectedBackgroundColor: AppColors.primary,
                selectedForegroundColor: Colors.white,
                side: const BorderSide(color: AppColors.line),
                visualDensity: VisualDensity.compact,
              ),
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(value: 'en', label: Text('EN')),
                ButtonSegment(value: 'fr', label: Text('FR')),
              ],
              selected: {locale.languageCode},
              onSelectionChanged: (v) => onLocaleChanged(Locale(v.first)),
            ),
          ],
        ),
      ),
    );
  }

}

class _MenuItem {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  _MenuItem(this.icon, this.label, this.color, this.onTap);
}
