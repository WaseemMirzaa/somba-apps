import 'aftersale_store.dart';
import 'chat_store.dart';
import 'engage_store.dart';
import 'geo_directory.dart';
import 'hub_directory.dart';
import 'realtime_store.dart';
import 'support_store.dart';

/// How a feature module plugs into the shared socket session without editing [RealtimeStore]:
/// the live pushes it listens to, what it loads after sign-in (and after each reconnect), and what it
/// forgets on sign-out. Add your hook to [buildFeatureHooks]; keep the state in your own singleton.
class FeatureHook {
  const FeatureHook({required this.name, this.pushes = const {}, this.hydrate, this.reset});

  final String name;

  /// Socket event -> handler. Bound on every (re)connect, so a handler must be idempotent.
  final Map<String, void Function(dynamic data)> pushes;

  /// Called once the session is ready (after the core hydrate); errors are swallowed and logged in debug.
  final Future<void> Function(RealtimeStore store)? hydrate;

  /// Called on sign-out: drop everything that belongs to the account.
  final void Function()? reset;
}

/// The hooks of every feature module. A builder adds ONE entry here for its own module.
List<FeatureHook> buildFeatureHooks() => [
      ChatStore.instance.hook,
      SupportStore.instance.hook,
      AfterSaleStore.instance.hook,
      EngageStore.instance.hook,
      HubDirectory.instance.hook,
      GeoDirectory.instance.hook,
    ];
