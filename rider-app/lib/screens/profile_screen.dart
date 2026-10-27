import 'package:flutter/material.dart';
import '../l10n/notification_text.dart';
import '../l10n/strings.dart';
import '../services/models.dart';
import '../services/rider_store.dart';
import '../services/support_store.dart';
import 'support_screen.dart';
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
        final s = Strings.of(context);
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
                  Expanded(child: Text(s.language, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5))),
                  SegmentedButton<String>(
                    showSelectedIcon: false,
                    style: SegmentedButton.styleFrom(visualDensity: VisualDensity.compact, selectedBackgroundColor: AppColors.primary, selectedForegroundColor: Colors.white),
                    segments: const [ButtonSegment(value: 'en', label: Text('EN')), ButtonSegment(value: 'fr', label: Text('FR'))],
                    selected: {locale.languageCode},
                    onSelectionChanged: (v) => onLocaleChanged(Locale(v.first)),
                  ),
                ]),
              ),
              const SizedBox(height: 12),
              _WhereIWork(assignment: store.assignment),
              const SizedBox(height: 12),
              const _SupportEntry(),
              const SizedBox(height: 18),
              Text(store.unreadCount > 0 ? s.notificationsNew(store.unreadCount) : s.notifications, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              const SizedBox(height: 10),
              if (store.notifications.isEmpty)
                SurfaceCard(child: Text(s.notificationsNone, style: const TextStyle(color: AppColors.muted)))
              else
                for (final n in store.notifications.take(15))
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: SurfaceCard(
                      // A task notice opens the task, a support notice its ticket; the rest just mark it read.
                      onTap: n.type == 'task' || n.type == 'delivery' || n.type == 'support'
                          ? () => store.openNotice(type: n.type, entityId: n.entityId, notificationId: n.id)
                          : n.read
                              ? null
                              : () => store.markRead(n.id),
                      padding: const EdgeInsets.all(14),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(displayNotice(s, title: n.title, body: n.body, titleFr: n.titleFr, bodyFr: n.bodyFr).$1,
                                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
                            const SizedBox(height: 2),
                            Text(displayNotice(s, title: n.title, body: n.body, titleFr: n.titleFr, bodyFr: n.bodyFr).$2, style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
                          ]),
                        ),
                        if (!n.read) Container(margin: const EdgeInsets.only(left: 8, top: 4), height: 8, width: 8, decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle)),
                      ]),
                    ),
                  ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  key: const ValueKey('sign-out'),
                  onPressed: () async {
                    await store.logout();
                    onLogout?.call();
                  },
                  style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger, side: const BorderSide(color: AppColors.danger)),
                  child: Text(s.signOut),
                ),
              ),
            ]),
          ),
        ]);
      },
    );
  }
}

/// The home warehouse (name, city, address): its staff assign the rider's tasks.
class _WhereIWork extends StatelessWidget {
  final RiderAssignment? assignment;
  const _WhereIWork({required this.assignment});

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final a = assignment;
    return SurfaceCard(
      key: const ValueKey('where-i-work'),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Icon(Icons.warehouse_rounded, color: AppColors.primary),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(s.homeWarehouse, style: const TextStyle(color: AppColors.muted, fontSize: 12)),
            const SizedBox(height: 2),
            Text(
              a == null ? '…' : (a.hasHub ? [a.hubName, a.hubCity].whereType<String>().join(' · ') : s.noWarehouse),
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5),
            ),
            if (a?.hubAddress != null) ...[
              const SizedBox(height: 2),
              Text(a!.hubAddress!, key: const ValueKey('warehouse-address'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
            ],
            if (a != null && a.hasHub) ...[
              const SizedBox(height: 6),
              Text(s.warehouseAssigns, style: const TextStyle(color: AppColors.faint, fontSize: 12)),
            ],
            if (a?.coverage != null) _coverage(s, a!.coverage!),
          ]),
        ),
      ]),
    );
  }
}

/// The areas the warehouse covers (read-only), named in the rider's language; a long list shows the first few.
Widget _coverage(Strings s, List<CoverageArea> areas) {
  const shown = 8;
  return Padding(
    key: const ValueKey('warehouse-coverage'),
    padding: const EdgeInsets.only(top: 12),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(s.coverageTitle, style: const TextStyle(color: AppColors.muted, fontSize: 12)),
      const SizedBox(height: 6),
      if (areas.isEmpty)
        Text(s.coverageNone, key: const ValueKey('coverage-none'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5))
      else
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final a in areas.take(shown)) _AreaChip(a.nameFor(s.lang), key: ValueKey('coverage-${a.id}')),
          if (areas.length > shown) _AreaChip(s.coverageMore(areas.length - shown), key: const ValueKey('coverage-more'), muted: true),
        ]),
    ]),
  );
}

class _AreaChip extends StatelessWidget {
  const _AreaChip(this.text, {super.key, this.muted = false});
  final String text;
  final bool muted;

  @override
  Widget build(BuildContext context) => ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 220),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
          decoration: BoxDecoration(color: (muted ? AppColors.muted : AppColors.primary).withValues(alpha: 0.10), borderRadius: BorderRadius.circular(100)),
          child: Text(text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: muted ? AppColors.muted : AppColors.primary, fontSize: 12, fontWeight: FontWeight.w700)),
        ),
      );
}

/// The way into support, with the unread count.
class _SupportEntry extends StatelessWidget {
  const _SupportEntry();

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return ListenableBuilder(
      listenable: SupportStore.instance,
      builder: (context, _) {
        final unread = SupportStore.instance.unread;
        return SurfaceCard(
          key: const ValueKey('support-entry'),
          onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(settings: const RouteSettings(name: kSupportRoute), builder: (_) => const SupportScreen())),
          child: Row(children: [
            const Icon(Icons.support_agent_rounded, color: AppColors.primary),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.support, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
                const SizedBox(height: 2),
                Text(s.supportSub, style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
              ]),
            ),
            if (unread > 0) ...[
              const SizedBox(width: 8),
              Pill(unread == 1 ? s.supportUnreadOne : s.supportUnreadMany(unread), key: const ValueKey('support-unread'), color: AppColors.primary, textColor: Colors.white),
            ],
          ]),
        );
      },
    );
  }
}
