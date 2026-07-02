import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../data/rider_state.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'more/rider_more.dart';
import 'more/rider_more2.dart';
import 'more/rider_more3.dart';

class ProfileScreen extends StatefulWidget {
  final Locale locale;
  final ValueChanged<Locale> onLocaleChanged;
  final VoidCallback? onLogout;

  const ProfileScreen({super.key, required this.locale, required this.onLocaleChanged, this.onLogout});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        Container(
          padding: EdgeInsets.fromLTRB(20, top + 24, 20, 24),
          decoration: const BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.vertical(bottom: Radius.circular(28))),
          child: Column(
            children: [
              Row(children: [
                Container(
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white.withValues(alpha: 0.6), width: 2)),
                  child: const CircleAvatar(radius: 32, backgroundColor: Colors.white, child: Text('JM', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 22))),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Jean Mukendi', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 2),
                    Text('RDR-001 · Paris 2e', style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13)),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(100)),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.star_rounded, color: Colors.amber.shade300, size: 15),
                        const SizedBox(width: 4),
                        Text(tr(context, '4.9 · Top rider'), style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w700)),
                      ]),
                    ),
                  ]),
                ),
                Column(children: [
                  _headerBtn(Icons.settings_rounded, () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RiderSettingsScreen()))),
                  const SizedBox(height: 8),
                  _headerBtn(Icons.edit_rounded, () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RiderEditProfileScreen()))),
                ]),
              ]),
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.symmetric(vertical: 14),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(18)),
                child: Row(children: [
                  _stat('1,284', tr(context, 'Deliveries')),
                  _divider(),
                  _stat('98%', tr(context, 'On-time')),
                  _divider(),
                  _stat('14 mo', tr(context, 'With us')),
                ]),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        // Duty status card
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: SurfaceCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: ValueListenableBuilder<bool>(
              valueListenable: RiderState.instance.onDuty,
              builder: (_, online, __) => SwitchListTile(
                contentPadding: EdgeInsets.zero,
                activeThumbColor: AppColors.primary,
                value: online,
                onChanged: (v) => RiderState.instance.setOnDuty(v),
                secondary: Container(
                  height: 40,
                  width: 40,
                  decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                  child: const Icon(Icons.bolt_rounded, color: AppColors.primary),
                ),
                title: Text(tr(context, 'On duty'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
                subtitle: Text(online ? tr(context, 'Receiving new tasks') : tr(context, 'Paused — no new tasks'), style: const TextStyle(fontSize: 12.5)),
              ),
            ),
          ),
        ),
        const SizedBox(height: 14),
        _menuCard([
          _Item(Icons.layers_rounded, tr(context, 'Current batch'), 'BAT-204 · 4 stops',
              () => Navigator.push(context, MaterialPageRoute(builder: (_) => const BatchOverviewScreen()))),
          _Item(Icons.map_rounded, tr(context, 'Zones & demand'), tr(context, 'Live demand heatmap'),
              () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ZoneScreen()))),
          _Item(Icons.schedule_rounded, tr(context, 'Shift & attendance'), tr(context, 'Hours & clock-in log'),
              () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RiderShiftScreen()))),
          _Item(Icons.history_rounded, tr(context, 'Task history'), tr(context, 'Past deliveries & pickups'),
              () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RiderHistoryScreen()))),
          _Item(Icons.notifications_rounded, tr(context, 'Notifications'), tr(context, 'Tasks & route updates'),
              () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RiderNotificationsScreen()))),
        ]),
        const SizedBox(height: 14),
        _menuCard([
          _Item(Icons.two_wheeler_rounded, tr(context, 'My vehicle'), tr(context, 'Details & maintenance'),
              () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RiderVehicleScreen()))),
          _Item(Icons.folder_shared_rounded, tr(context, 'Documents'), tr(context, 'Licence, ID & insurance'),
              () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RiderDocumentsScreen()))),
          _Item(Icons.settings_rounded, tr(context, 'Settings'), tr(context, 'Alerts & preferences'),
              () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RiderSettingsScreen()))),
          _Item(Icons.headset_mic_rounded, tr(context, 'Support'), tr(context, '24/7 rider help'),
              () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RiderSupportScreen()))),
        ]),
        const SizedBox(height: 14),
        // Language card
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: SurfaceCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(children: [
              Container(
                height: 40, width: 40,
                decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                child: const Icon(Icons.translate_rounded, color: AppColors.primary, size: 21),
              ),
              const SizedBox(width: 12),
              Expanded(child: Text(tr(context, 'Language'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5))),
              _langChip('EN', 'en'),
              const SizedBox(width: 8),
              _langChip('FR', 'fr'),
            ]),
          ),
        ),
        const SizedBox(height: 14),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: SurfaceCard(
            padding: EdgeInsets.zero,
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
              leading: Container(
                height: 40, width: 40,
                decoration: BoxDecoration(color: AppColors.danger.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
                child: const Icon(Icons.logout_rounded, color: AppColors.danger, size: 21),
              ),
              title: Text(tr(context, 'Log out'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5, color: AppColors.danger)),
              onTap: _confirmLogout,
            ),
          ),
        ),
        const SizedBox(height: 90),
      ],
    );
  }

  void _confirmLogout() {
    showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(height: 56, width: 56, decoration: BoxDecoration(color: AppColors.danger.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(16)), child: const Icon(Icons.logout_rounded, color: AppColors.danger, size: 28)),
            const SizedBox(height: 16),
            Text(tr(context, 'Log out?'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 19, fontFamily: 'PlusJakartaSans')),
            const SizedBox(height: 6),
            Text(tr(context, 'You will need to sign in again to receive tasks.'), style: const TextStyle(color: AppColors.muted, fontSize: 13.5)),
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

  Widget _headerBtn(IconData icon, VoidCallback onTap) => Material(
        color: Colors.white.withValues(alpha: 0.2),
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Padding(padding: const EdgeInsets.all(8), child: Icon(icon, color: Colors.white, size: 20)),
        ),
      );

  Widget _langChip(String label, String code) {
    final sel = widget.locale.languageCode == code;
    return GestureDetector(
      onTap: () => widget.onLocaleChanged(Locale(code)),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          gradient: sel ? AppColors.brandGradient : null,
          color: sel ? null : AppColors.background,
          borderRadius: BorderRadius.circular(100),
          border: Border.all(color: sel ? Colors.transparent : AppColors.line),
        ),
        child: Text(label, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: sel ? Colors.white : AppColors.muted)),
      ),
    );
  }

  Widget _menuCard(List<_Item> items) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: SurfaceCard(
          padding: EdgeInsets.zero,
          child: Column(children: [
            for (int i = 0; i < items.length; i++) ...[
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                leading: Container(
                  height: 40, width: 40,
                  decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
                  child: Icon(items[i].icon, color: AppColors.primary, size: 21),
                ),
                title: Text(items[i].title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
                subtitle: Text(items[i].subtitle, style: const TextStyle(fontSize: 12.5)),
                trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
                onTap: items[i].onTap,
              ),
              if (i != items.length - 1) const Divider(height: 1, indent: 68, endIndent: 14),
            ],
          ]),
        ),
      );

  Widget _stat(String v, String l) => Expanded(
        child: Column(children: [
          Text(v, style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: 2),
          Text(l, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 11.5)),
        ]),
      );

  Widget _divider() => Container(width: 1, height: 30, color: Colors.white.withValues(alpha: 0.25));
}

class _Item {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  _Item(this.icon, this.title, this.subtitle, [this.onTap]);
}
