import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'more/rider_more.dart';

class ProfileScreen extends StatefulWidget {
  final Locale locale;
  final ValueChanged<Locale> onLocaleChanged;

  const ProfileScreen({super.key, required this.locale, required this.onLocaleChanged});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _online = true;

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
                        const Text('4.9 · Top rider', style: TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w700)),
                      ]),
                    ),
                  ]),
                ),
              ]),
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.symmetric(vertical: 14),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(18)),
                child: Row(children: [
                  _stat('1,284', 'Deliveries'),
                  _divider(),
                  _stat('98%', 'On-time'),
                  _divider(),
                  _stat('14 mo', 'With us'),
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
            child: SwitchListTile(
              contentPadding: EdgeInsets.zero,
              activeThumbColor: AppColors.primary,
              value: _online,
              onChanged: (v) => setState(() => _online = v),
              secondary: Container(
                height: 40,
                width: 40,
                decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                child: const Icon(Icons.bolt_rounded, color: AppColors.primary),
              ),
              title: const Text('On duty', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
              subtitle: Text(_online ? 'Receiving new tasks' : 'Paused — no new tasks', style: const TextStyle(fontSize: 12.5)),
            ),
          ),
        ),
        const SizedBox(height: 14),
        _menuCard([
          _Item(Icons.history_rounded, 'Task history', 'Past deliveries & pickups',
              () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RiderHistoryScreen()))),
          _Item(Icons.notifications_rounded, 'Notifications', 'Tasks, routes & payouts',
              () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RiderNotificationsScreen()))),
          _Item(Icons.two_wheeler_rounded, 'Vehicle', 'Honda CB150 · Motorcycle'),
          _Item(Icons.description_rounded, 'Documents', 'License · Insurance verified'),
          _Item(Icons.headset_mic_rounded, 'Support', '24/7 rider help'),
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
              const Expanded(child: Text('Language', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5))),
              _langChip('EN', 'en'),
              const SizedBox(width: 8),
              _langChip('FR', 'fr'),
            ]),
          ),
        ),
        const SizedBox(height: 90),
      ],
    );
  }

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
