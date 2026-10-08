import 'package:flutter/material.dart';
import '../services/rider_store.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

class ProfileScreen extends StatelessWidget {
  final Locale locale;
  final ValueChanged<Locale> onLocaleChanged;
  final VoidCallback? onLogout;
  const ProfileScreen({super.key, required this.locale, required this.onLocaleChanged, this.onLogout});

  static String _initials(String name) {
    final p = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    if (p.isEmpty) return '?';
    return (p.length == 1 ? p[0].substring(0, p[0].length >= 2 ? 2 : 1) : '${p[0][0]}${p[1][0]}').toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final store = RiderStore.instance;
    final top = MediaQuery.of(context).padding.top;
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final u = store.user;
        return ListView(padding: EdgeInsets.zero, children: [
          Container(
            padding: EdgeInsets.fromLTRB(20, top + 24, 20, 26),
            decoration: const BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.vertical(bottom: Radius.circular(28))),
            child: Row(children: [
              CircleAvatar(radius: 32, backgroundColor: Colors.white, child: Text(_initials(u?.name ?? ''), style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 22))),
              const SizedBox(width: 16),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(u?.name ?? '', style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 2),
                  Text(u?.email ?? '', style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13)),
                  if ((u?.phone ?? '').isNotEmpty) Text(u!.phone!, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13)),
                ]),
              ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 110),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SurfaceCard(
                child: Row(children: [
                  const Icon(Icons.translate_rounded, color: AppColors.primary),
                  const SizedBox(width: 12),
                  const Expanded(child: Text('Language', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5))),
                  SegmentedButton<String>(
                    showSelectedIcon: false,
                    style: SegmentedButton.styleFrom(visualDensity: VisualDensity.compact, selectedBackgroundColor: AppColors.primary, selectedForegroundColor: Colors.white),
                    segments: const [ButtonSegment(value: 'en', label: Text('EN')), ButtonSegment(value: 'fr', label: Text('FR'))],
                    selected: {locale.languageCode},
                    onSelectionChanged: (v) => onLocaleChanged(Locale(v.first)),
                  ),
                ]),
              ),
              const SizedBox(height: 18),
              Text(store.unreadCount > 0 ? 'Notifications (${store.unreadCount} new)' : 'Notifications', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              const SizedBox(height: 10),
              if (store.notifications.isEmpty)
                const SurfaceCard(child: Text('Nothing yet. New deliveries and updates show up here.', style: TextStyle(color: AppColors.muted)))
              else
                for (final n in store.notifications.take(15))
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: SurfaceCard(
                      onTap: n.read ? null : () => store.markRead(n.id),
                      padding: const EdgeInsets.all(14),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(n.title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
                            const SizedBox(height: 2),
                            Text(n.body, style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
                          ]),
                        ),
                        if (!n.read) Container(margin: const EdgeInsets.only(left: 8, top: 4), height: 8, width: 8, decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle)),
                      ]),
                    ),
                  ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  key: const ValueKey('sign-out'),
                  onPressed: () async {
                    await store.logout();
                    onLogout?.call();
                  },
                  style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger, side: const BorderSide(color: AppColors.danger)),
                  icon: const Icon(Icons.logout_rounded, size: 20),
                  label: const Text('Sign out'),
                ),
              ),
            ]),
          ),
        ]);
      },
    );
  }
}
