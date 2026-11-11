import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../services/notification_permission.dart';
import '../theme/app_theme.dart';
import 'ui.dart';

/// "Notifications are off. Open settings": shown only while the OS permission is not granted. It re-reads the
/// permission when the app comes back from the system settings.
class NotificationsOffRow extends StatefulWidget {
  const NotificationsOffRow({super.key, NotificationPermission? permission}) : _permission = permission;
  final NotificationPermission? _permission;

  @override
  State<NotificationsOffRow> createState() => _NotificationsOffRowState();
}

class _NotificationsOffRowState extends State<NotificationsOffRow> with WidgetsBindingObserver {
  NotificationPermission get _p => widget._permission ?? NotificationPermission.instance;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _p.refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _p.refresh();
  }

  Future<void> _open() async {
    final s = Strings.of(context);
    final ok = await _p.openSettings();
    if (!ok && mounted) showSnack(context, s.notifOffFailed);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _p,
      builder: (context, _) {
        if (!_p.showSettingsRow) return const SizedBox.shrink();
        final s = Strings.of(context);
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: SurfaceCard(
            child: InkWell(
              key: const ValueKey('notifications-off-row'),
              onTap: _open,
              child: Row(children: [
                const Icon(Icons.notifications_off_outlined, color: AppColors.primary),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(s.notifOffTitle, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5)),
                    Text(s.notifOffSub, style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
                  ]),
                ),
                const SizedBox(width: 8),
                Text(s.notifOffAction, style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700, fontSize: 13)),
              ]),
            ),
          ),
        );
      },
    );
  }
}
