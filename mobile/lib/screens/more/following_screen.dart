import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import '../../services/follow_store.dart';
import '../../theme/app_theme.dart';
import '../../widgets/feedback.dart';
import '../../widgets/kit.dart';
import 'shop_extra.dart';

/// Account → Following: the stores the shopper follows (new products from them arrive as notifications).
/// Tap a row to open the store; "Unfollow" on a row stops following it (a snackbar confirms).
class FollowingScreen extends StatefulWidget {
  const FollowingScreen({super.key, this.locale = const Locale('en')});
  final Locale locale;

  @override
  State<FollowingScreen> createState() => _FollowingScreenState();
}

class _FollowingScreenState extends State<FollowingScreen> {
  bool _failed = false;
  String? _busyId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _failed = false);
    try {
      await FollowStore.instance.load();
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  Future<void> _unfollow(FollowedStore st) async {
    if (_busyId != null) return;
    setState(() => _busyId = st.id);
    final s = Strings.of(context);
    try {
      await FollowStore.instance.toggle(st.id, following: false);
      if (mounted) showSnack(context, s.followStopped(st.name));
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return ListenableBuilder(
      listenable: FollowStore.instance,
      builder: (context, _) {
        final store = FollowStore.instance;
        final Widget body;
        if (!store.loaded && !_failed) {
          body = const Center(child: CircularProgressIndicator());
        } else if (!store.loaded && _failed) {
          body = Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(s.followingLoadFailed,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: AppColors.muted)),
                const SizedBox(height: 12),
                OutlinedButton(
                    key: const ValueKey('following-retry'),
                    onPressed: _load,
                    child: ButtonLabel(s.followingRetry)),
              ]),
            ),
          );
        } else if (store.stores.isEmpty) {
          body = Center(
            key: const ValueKey('following-empty'),
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(s.followingEmpty,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 15)),
                const SizedBox(height: 8),
                Text(s.followingEmptyHint,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        color: AppColors.muted, fontSize: 13, height: 1.4)),
              ]),
            ),
          );
        } else {
          body = ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            itemCount: store.stores.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (_, i) => _tile(context, s, store.stores[i]),
          );
        }
        return Scaffold(
            appBar: backAppBar(context, s.followingTitle), body: body);
      },
    );
  }

  Widget _tile(BuildContext context, Strings s, FollowedStore st) {
    final initial = st.name.isEmpty ? '?' : st.name[0].toUpperCase();
    // The Material is the card itself so the press highlight shows; the shadow sits on the box around it.
    return Container(
      key: ValueKey('following-${st.id}'),
      decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20), boxShadow: AppShadow.card),
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => Navigator.push(
              context,
              MaterialPageRoute(
                  builder: (_) => StoreScreen(
                      locale: widget.locale,
                      sellerId: st.id,
                      sellerName: st.name))),
          child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(children: [
                CircleAvatar(
                  radius: 24,
                  backgroundColor: AppColors.primary.withValues(alpha: 0.12),
                  backgroundImage:
                      st.logoUrl == null ? null : NetworkImage(st.logoUrl!),
                  onBackgroundImageError:
                      st.logoUrl == null ? null : (_, __) {},
                  child: st.logoUrl == null
                      ? Text(initial,
                          style: const TextStyle(
                              color: AppColors.primary,
                              fontWeight: FontWeight.w800,
                              fontSize: 18))
                      : null,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(st.name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontWeight: FontWeight.w800, fontSize: 14.5)),
                        const SizedBox(height: 2),
                        Text(
                          [
                            if (st.rating > 0)
                              '${s.number(st.rating, decimals: 1)}★',
                            s.followingProducts(st.productCount)
                          ].join(' · '),
                          style: const TextStyle(
                              color: AppColors.muted, fontSize: 12.5),
                        ),
                      ]),
                ),
                const SizedBox(width: 8),
                TextButton(
                  key: ValueKey('unfollow-${st.id}'),
                  onPressed: _busyId == null ? () => _unfollow(st) : null,
                  child: _busyId == st.id
                      ? const ButtonSpinner()
                      : ButtonLabel(s.unfollow),
                ),
              ])),
        ),
      ),
    );
  }
}
