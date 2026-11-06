import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../services/location_reporter.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

/// Shown before the phone's own location prompt, the first time a rider sets off: why the position is shared, when it
/// stops, and which answer to give ("While using the app" is enough, "All the time" is never needed). When location is
/// refused or switched off, the same screen becomes "Location is turned off" with a button that opens the phone settings,
/// and it notices the rider coming back from them.
///
/// Pops `true` when location is allowed, `false` when the rider carries on without it.
class LocationAccessScreen extends StatefulWidget {
  const LocationAccessScreen({super.key, required this.reporter, required this.initial});

  /// Asks for the permission and opens the settings (tests pass a fake).
  final LocationReporter reporter;

  /// Where the permission stands when the screen opens.
  final LocationAccess initial;

  @override
  State<LocationAccessScreen> createState() => _LocationAccessScreenState();
}

class _LocationAccessScreenState extends State<LocationAccessScreen> with WidgetsBindingObserver {
  late LocationAccess _access = widget.initial;
  bool _busy = false;

  /// Blocked = the phone will not show its prompt (refused for good) or GPS is off; only the settings can fix it.
  bool get _blocked => _access == LocationAccess.deniedForever || _access == LocationAccess.serviceOff;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Back from the phone settings: allowed now? Then carry on.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _recheck();
  }

  Future<void> _recheck() async {
    final a = await widget.reporter.checkAccess();
    if (!mounted) return;
    if (a == LocationAccess.granted) {
      Navigator.of(context).pop(true);
    } else {
      setState(() => _access = a);
    }
  }

  Future<void> _allow() async {
    setState(() => _busy = true);
    final a = await widget.reporter.ensureAccess();
    if (!mounted) return;
    if (a == LocationAccess.granted) {
      Navigator.of(context).pop(true);
      return;
    }
    setState(() {
      _busy = false;
      _access = a;
    });
  }

  Future<void> _openSettings() async {
    final opened = await widget.reporter.openSettings(_access);
    if (!opened && mounted) showSnack(context, Strings.of(context).locSettingsFailed);
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final blocked = _blocked;
    final body = _access == LocationAccess.serviceOff ? s.locGpsOffBody : s.locBlockedBody;
    return PopScope(
      canPop: false, // leave with one of the two buttons, so the choice is always recorded
      child: Scaffold(
        backgroundColor: AppColors.background,
        body: SafeArea(
          child: Column(children: [
            Expanded(
              child: SingleChildScrollView(
                key: const ValueKey('location-access-body'),
                padding: const EdgeInsets.fromLTRB(24, 32, 24, 16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  // Art: a designed icon tile (no photo asset needed), tinted by state.
                  Semantics(
                    label: blocked ? s.locBlockedTitle : s.locTitle,
                    child: Container(
                      height: 88,
                      width: 88,
                      decoration: BoxDecoration(
                        color: (blocked ? AppColors.danger : AppColors.primary).withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(28),
                      ),
                      child: Icon(blocked ? Icons.location_off_rounded : Icons.my_location_rounded, size: 44, color: blocked ? AppColors.danger : AppColors.primary),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(blocked ? s.locBlockedTitle : s.locTitle, key: const ValueKey('location-access-title'), style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 12),
                  if (blocked)
                    Text(body, key: const ValueKey('location-access-blocked-body'), style: Theme.of(context).textTheme.bodyLarge)
                  else ...[
                    Text(s.locIntro, style: Theme.of(context).textTheme.bodyLarge),
                    const SizedBox(height: 18),
                    _point(Icons.phonelink_lock_rounded, s.locPointScreen),
                    _point(Icons.stop_circle_outlined, s.locPointStop),
                    _point(Icons.touch_app_rounded, s.locPointChoice),
                  ],
                ]),
              ),
            ),
            // The buttons stay pinned: one filled button, the other answer is plain text.
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 16),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                if (blocked)
                  PrimaryButton(s.openSettings, onPressed: _openSettings)
                else
                  PrimaryButton(s.locAllow, onPressed: _allow, busy: _busy),
                const SizedBox(height: 4),
                SizedBox(
                  width: double.infinity,
                  child: TextButton(
                    key: const ValueKey('location-access-skip'),
                    onPressed: _busy ? null : () => Navigator.of(context).pop(false),
                    style: TextButton.styleFrom(minimumSize: const Size(0, 48), foregroundColor: AppColors.muted),
                    child: ButtonLabel(blocked ? s.locContinueWithout : s.locNotNow),
                  ),
                ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _point(IconData icon, String text) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 22, color: AppColors.primary),
          const SizedBox(width: 12),
          Expanded(child: Text(text, style: Theme.of(context).textTheme.bodyMedium)),
        ]),
      );
}
