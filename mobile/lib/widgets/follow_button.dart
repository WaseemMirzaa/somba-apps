import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../services/follow_store.dart';
import '../services/realtime_store.dart';
import '../theme/app_theme.dart';
import 'feedback.dart';
import 'kit.dart';

/// Follow / Following on a store page. Label-only; the filled button is the call to follow, an outlined one says
/// you already do. Every outcome (followed, unfollowed, refused) is a snackbar. Hidden unless a shopper is signed in.
class FollowStoreButton extends StatefulWidget {
  const FollowStoreButton({super.key, required this.sellerId, required this.storeName});
  final String sellerId;
  final String storeName;

  @override
  State<FollowStoreButton> createState() => _FollowStoreButtonState();
}

class _FollowStoreButtonState extends State<FollowStoreButton> {
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    // The follower count and whether I follow (the list may not be loaded yet). A failure leaves the button usable.
    FollowStore.instance.stateOf(widget.sellerId).catchError((_) => const FollowState(sellerId: '', following: false, followers: 0));
  }

  Future<void> _toggle() async {
    if (_busy) return;
    setState(() => _busy = true);
    final s = Strings.of(context);
    try {
      final st = await FollowStore.instance.toggle(widget.sellerId);
      if (!mounted) return;
      showSnack(context, st.following ? s.followNow(widget.storeName) : s.followStopped(widget.storeName));
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = RealtimeStore.instance.user;
    if (user == null || user.role != 'customer') return const SizedBox.shrink();
    final s = Strings.of(context);
    return ListenableBuilder(
      listenable: FollowStore.instance,
      builder: (context, _) {
        final store = FollowStore.instance;
        final following = store.isFollowing(widget.sellerId);
        final followers = store.known(widget.sellerId)?.followers;
        final child = _busy ? const ButtonSpinner() : ButtonLabel(following ? s.following : s.follow);
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (following)
            OutlinedButton(key: const ValueKey('follow-store'), onPressed: _busy ? null : _toggle, child: child)
          else
            FilledButton(key: const ValueKey('follow-store'), onPressed: _busy ? null : _toggle, child: child),
          if (followers != null && followers > 0)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(s.followFollowers(followers),
                  key: const ValueKey('follow-count'), textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted, fontSize: 12)),
            ),
        ]);
      },
    );
  }
}
