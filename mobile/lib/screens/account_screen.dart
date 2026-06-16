import 'package:flutter/material.dart';
import '../data/shop_state.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../widgets/app_badge.dart';
import '../widgets/app_card.dart';
import '../widgets/brand_mark.dart';
import 'orders_screen.dart';

class AccountScreen extends StatelessWidget {
  final Locale locale;
  final void Function(Locale) onLocaleChanged;

  const AccountScreen({super.key, required this.locale, required this.onLocaleChanged});

  void _toast(BuildContext context, String msg) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

  @override
  Widget build(BuildContext context) {
    final s = Strings(locale.languageCode);
    final shop = ShopState.instance;

    return Scaffold(
      appBar: AppBar(title: Text(s.account)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
        children: [
          // Profile header
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.xl),
            child: Container(
              decoration: const BoxDecoration(gradient: AppGradients.band),
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  Container(
                    width: 60,
                    height: 60,
                    decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                    child: const Icon(Icons.person_rounded, size: 32, color: AppColors.royal),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Marie Dubois',
                          style: TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'marie@email.com',
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13.5),
                        ),
                        const SizedBox(height: 8),
                        SectionLabel(s.member, light: true, icon: Icons.workspace_premium_outlined),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Quick stats
          Row(
            children: [
              _StatCard(
                icon: Icons.receipt_long_outlined,
                value: '2',
                label: s.orders,
                tone: AppColors.royal,
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrdersScreen(locale: locale))),
              ),
              const SizedBox(width: 12),
              _StatCard(
                icon: Icons.favorite_border_rounded,
                value: '${shop.wishlist.length}',
                label: s.wishlist,
                tone: AppColors.primary,
                onTap: () => _toast(context, s.comingSoon),
              ),
              const SizedBox(width: 12),
              _StatCard(
                icon: Icons.account_balance_wallet_outlined,
                value: r'$0',
                label: s.wallet,
                tone: AppColors.success,
                onTap: () => _toast(context, s.comingSoon),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Menu group
          AppCard(
            child: Column(
              children: [
                _MenuTile(
                  icon: Icons.shopping_bag_outlined,
                  label: s.myOrders,
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrdersScreen(locale: locale))),
                ),
                const Divider(),
                _MenuTile(
                  icon: Icons.favorite_border_rounded,
                  label: s.wishlist,
                  onTap: () => _toast(context, s.comingSoon),
                ),
                const Divider(),
                _MenuTile(icon: Icons.location_on_outlined, label: s.addresses, onTap: () => _toast(context, s.comingSoon)),
                const Divider(),
                _MenuTile(icon: Icons.credit_card_outlined, label: s.payments, onTap: () => _toast(context, s.comingSoon)),
                const Divider(),
                _MenuTile(icon: Icons.settings_outlined, label: s.settings, onTap: () => _toast(context, s.comingSoon)),
                const Divider(),
                _MenuTile(icon: Icons.help_outline_rounded, label: s.support, onTap: () => _toast(context, s.comingSoon)),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Language
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                const Icon(Icons.translate_rounded, color: AppColors.slate600, size: 22),
                const SizedBox(width: 14),
                Expanded(child: Text(s.language, style: const TextStyle(fontWeight: FontWeight.w600))),
                SegmentedButton<String>(
                  style: SegmentedButton.styleFrom(
                    selectedBackgroundColor: AppColors.primaryLight,
                    selectedForegroundColor: AppColors.primary,
                    side: const BorderSide(color: AppColors.border),
                    textStyle: const TextStyle(fontWeight: FontWeight.w700),
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
          const SizedBox(height: 16),

          // Prototype notice
          AppCard(
            color: AppColors.warningLight,
            border: Border.all(color: AppColors.amberLight),
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                const Icon(Icons.info_outline_rounded, color: AppColors.warning, size: 20),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(s.prototype, style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.amberText)),
                      const SizedBox(height: 2),
                      Text(s.mockNotice, style: const TextStyle(color: AppColors.amberText, fontSize: 12.5)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Footer
          const Center(child: BrandMark(full: true, size: 28)),
          const SizedBox(height: 6),
          const Center(
            child: Text('v0.1.0 · Prototype', style: TextStyle(color: AppColors.slate400, fontSize: 12)),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final IconData icon;
  final String value;
  final String label;
  final Color tone;
  final VoidCallback onTap;

  const _StatCard({
    required this.icon,
    required this.value,
    required this.label,
    required this.tone,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: AppCard(
        onTap: onTap,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: tone, size: 24),
            const SizedBox(height: 8),
            Text(value, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 2),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: AppColors.slate500, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _MenuTile({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
      leading: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: AppColors.surfaceMuted,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, size: 20, color: AppColors.slate700),
      ),
      title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5)),
      trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.slate400),
      onTap: onTap,
    );
  }
}
