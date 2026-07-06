import 'package:flutter/material.dart';
import '../data/shop_state.dart';
import '../data/repository.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import 'orders_screen.dart';
import 'more/account_more.dart';
import 'more/returns_extra.dart';
import 'more/support_extra.dart';
import 'more/settings_extra.dart';
import 'more/catalog_extra.dart';

class AccountScreen extends StatefulWidget {
  final Locale locale;
  final void Function(Locale) onLocaleChanged;
  final VoidCallback? onLogout;

  const AccountScreen({super.key, required this.locale, required this.onLocaleChanged, this.onLogout});

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  Map<String, dynamic>? _me;
  int? _orderCount;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final me = await Repo.instance.me();
    if (me == null) return;
    final orders = await Repo.instance.myOrders();
    if (!mounted) return;
    setState(() {
      _me = me;
      _orderCount = orders.length;
    });
  }

  /// Avatar initials from the first letters of the first two words of [name].
  String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts[0].substring(0, 1) + parts[1].substring(0, 1)).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final locale = widget.locale;
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
            _MenuItem(Icons.assignment_return_outlined, trl(lang, 'Returns & exchanges'), AppColors.royalBlue,
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReturnsListScreen(locale: locale)))),
            _MenuItem(Icons.favorite_border_rounded, s.wishlist, AppColors.accent,
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => WishlistScreen(locale: locale)))),
            _MenuItem(Icons.location_on_outlined, s.addresses, AppColors.mint,
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => AddressBookScreen(locale: locale)))),
            _MenuItem(Icons.local_offer_outlined, trl(lang, 'Coupons'), AppColors.amber,
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => CouponsScreen(locale: locale)))),
          ]),
          const SizedBox(height: 14),
          _languageCard(s),
          const SizedBox(height: 14),
          _menuCard(context, [
            _MenuItem(Icons.person_outline_rounded, trl(lang, 'Edit profile'), AppColors.primary,
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => CustomerEditProfileScreen(locale: locale)))),
            _MenuItem(Icons.notifications_none_rounded, trl(lang, 'Notifications'), AppColors.primary,
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => NotificationsScreen(locale: locale)))),
            _MenuItem(Icons.card_giftcard_rounded, trl(lang, 'Refer & Earn'), AppColors.accent,
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReferScreen(locale: locale)))),
            _MenuItem(Icons.confirmation_number_outlined, trl(lang, 'Support'), AppColors.royalBlue,
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => SupportListScreen(locale: locale)))),
            _MenuItem(Icons.settings_outlined, trl(lang, 'Settings'), AppColors.inkSoft,
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => CustomerSettingsScreen(locale: locale)))),
            _MenuItem(Icons.help_outline_rounded, s.help, AppColors.inkSoft,
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => HelpScreen(locale: locale)))),
          ]),
          const SizedBox(height: 14),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(20),
                boxShadow: AppShadow.card,
              ),
              child: ListTile(
                onTap: () => _confirmLogout(context),
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
                leading: Container(
                  height: 40,
                  width: 40,
                  decoration: BoxDecoration(color: AppColors.danger.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
                  child: const Icon(Icons.logout_rounded, color: AppColors.danger, size: 21),
                ),
                title: Text(trl(lang, 'Log out'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5, color: AppColors.danger)),
              ),
            ),
          ),
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
                      _bannerText(lang),
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

  String _bannerText(String lang) {
    if (Repo.instance.isAuthed && Repo.instance.live) {
      return lang == 'fr' ? 'Connecté au backend en direct.' : 'Connected to live backend.';
    }
    return lang == 'fr' ? 'Mode démo — connectez-vous pour vos données.' : 'Demo mode — sign in for your data.';
  }

  Widget _profileHeader(BuildContext context, Strings s) {
    final top = MediaQuery.of(context).padding.top;
    final me = _me;
    final name = (me?['name'] as String?)?.trim();
    final displayName = (name != null && name.isNotEmpty) ? name : 'Marie Dubois';
    final email = (me?['email'] as String?)?.trim();
    final displayEmail = (email != null && email.isNotEmpty) ? email : 'marie@email.com';
    final initials = _initials(displayName);
    final orders = me != null ? (_orderCount ?? 0) : 12;
    final coupons = me != null ? Repo.instance.couponCount : 3;
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
                child: CircleAvatar(
                  radius: 32,
                  backgroundColor: Colors.white,
                  child: Text(initials,
                      style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 22)),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(displayName,
                        style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 2),
                    Text(displayEmail,
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13)),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(100),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.workspace_premium_rounded, color: Colors.white, size: 14),
                          const SizedBox(width: 4),
                          Text(trl(s.lang, 'Gold member'),
                              style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w700)),
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
                _stat('$orders', s.orders),
                _divider(),
                _stat('${ShopState.instance.wishlist.length}', s.wishlist),
                _divider(),
                _stat('$coupons', trl(s.lang, 'Coupons')),
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
              selected: {widget.locale.languageCode},
              onSelectionChanged: (v) => widget.onLocaleChanged(Locale(v.first)),
            ),
          ],
        ),
      ),
    );
  }

  void _confirmLogout(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(
              height: 56, width: 56,
              decoration: BoxDecoration(color: AppColors.danger.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(16)),
              child: const Icon(Icons.logout_rounded, color: AppColors.danger, size: 28),
            ),
            const SizedBox(height: 16),
            Text(tr(context, 'Log out?'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 19, fontFamily: 'PlusJakartaSans')),
            const SizedBox(height: 6),
            Text(tr(context, 'You can sign back in anytime to see your orders and wishlist.'), style: const TextStyle(color: AppColors.muted, fontSize: 13.5)),
            const SizedBox(height: 20),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
              onPressed: () {
                Navigator.pop(context);
                widget.onLogout?.call();
              },
              child: Text(tr(context, 'Log out')),
            ),
            const SizedBox(height: 10),
            OutlinedButton(onPressed: () => Navigator.pop(context), child: Text(tr(context, 'Cancel'))),
          ]),
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
