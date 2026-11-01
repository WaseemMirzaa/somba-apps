import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'app.dart';
import 'data/market_profiles.dart';
import 'data/shop_state.dart';
import 'l10n/language_sync.dart';
import 'l10n/notification_text.dart';
import 'l10n/strings.dart';
import 'screens/more/auth_screens.dart';
import 'screens/notice_router.dart';
import 'services/push_service.dart';
import 'services/realtime_store.dart';
import 'theme/app_theme.dart';
import 'util/format.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting();
  await Strings.restore();
  await ShopState.instance.load();
  // Keep the cart's prices/stock in step with the live catalogue.
  RealtimeStore.instance.addListener(ShopState.instance.syncWithCatalog);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.dark,
  ));
  runApp(const SombaApp());
}

class SombaApp extends StatefulWidget {
  const SombaApp({super.key});

  @override
  State<SombaApp> createState() => _SombaAppState();
}

class _SombaAppState extends State<SombaApp> {
  Locale _locale = Locale(Strings.current.lang);
  bool _splashDone = false;
  bool _restored = false;
  bool _authed = false;
  final _messenger = GlobalKey<ScaffoldMessengerState>();
  final _navigator = GlobalKey<NavigatorState>();
  StreamSubscription<PushMessage>? _foregroundSub;

  @override
  void initState() {
    super.initState();
    Strings.langNotifier.addListener(_onLang);
    // A tapped notification opens its screen once the user is in and the data is loaded.
    PushService.instance.pendingTap.addListener(_openPendingTap);
    RealtimeStore.instance.addListener(_openPendingTap);
    _foregroundSub = PushService.instance.foreground.listen(_showForegroundPush);
    // The server can end a session (revoked, suspended, deleted): go back to sign-in.
    // Once the account is loaded its language is authoritative: apply the language rule again (and tell the account).
    RealtimeStore.instance.onHydrated = () {
      if (mounted && _authed) unawaited(reconcileLanguage(RealtimeStore.instance));
    };
    RealtimeStore.instance.onSessionEnded = (messageKey) {
      if (!mounted) return;
      ShopState.instance.clearSession();
      // Close every pushed screen (settings, delete-account…) so sign-in is what the user sees.
      _navigator.currentState?.popUntil((r) => r.isFirst);
      setState(() => _authed = false);
      final s = Strings.current;
      _messenger.currentState?.showSnackBar(SnackBar(content: Text(s.has(messageKey ?? '') ? s.t(messageKey!) : s.errSignedOut)));
    };
    // Silently restore the previous session (stored refresh token) during the splash.
    RealtimeStore.instance.tryRestore().timeout(const Duration(seconds: 8), onTimeout: () => false).then((ok) {
      if (!mounted) return;
      setState(() {
        _restored = true;
        if (ok) _enter();
      });
    });
  }

  @override
  void dispose() {
    Strings.langNotifier.removeListener(_onLang);
    PushService.instance.pendingTap.removeListener(_openPendingTap);
    RealtimeStore.instance.removeListener(_openPendingTap);
    RealtimeStore.instance.onHydrated = null;
    _foregroundSub?.cancel();
    super.dispose();
  }

  void _openPendingTap() {
    final store = RealtimeStore.instance;
    final nav = _navigator.currentState;
    if (!_authed || !store.hydrated || nav == null || PushService.instance.pendingTap.value == null) return;
    final m = PushService.instance.takeTap()!;
    unawaited(openNotice(nav, _locale, type: m.type, entityId: m.entityId, notificationId: m.notificationId));
  }

  /// A push that arrives while the app is open: a banner with "Open" (the list refreshes on its own).
  void _showForegroundPush(PushMessage m) {
    if (!_authed || (m.title ?? '').isEmpty) return;
    final s = Strings.current;
    final text = displayNotice(s, title: m.title ?? '', body: m.body ?? '', titleFr: m.titleFr, bodyFr: m.bodyFr);
    _messenger.currentState?.showSnackBar(SnackBar(
      behavior: SnackBarBehavior.floating,
      persist: false, // a SnackBar with an action stays until dismissed unless told otherwise
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(text.$1, style: const TextStyle(fontWeight: FontWeight.w800)),
        if (text.$2.isNotEmpty) Text(text.$2, maxLines: 2, overflow: TextOverflow.ellipsis),
      ]),
      action: SnackBarAction(
        label: s.pushOpen,
        onPressed: () {
          final nav = _navigator.currentState;
          if (nav != null) unawaited(openNotice(nav, _locale, type: m.type, entityId: m.entityId, notificationId: m.notificationId));
        },
      ),
    ));
  }

  void _onLang() {
    if (mounted) setState(() => _locale = Locale(Strings.langNotifier.value));
  }

  /// Called once a session exists (restored or freshly signed in).
  void _enter() {
    _authed = true;
    // No choice made on this device: follow the account's language. A choice made here wins (it is saved to the
    // account once the session is up: see onHydrated).
    unawaited(reconcileLanguage(RealtimeStore.instance));
    final market = RealtimeStore.instance.prefs['market'];
    marketNotifier.value = market == 'FR' ? MarketProfileId.france : MarketProfileId.drc;
    // A notification tapped before sign-in opens now (after this frame, once the shell exists).
    WidgetsBinding.instance.addPostFrameCallback((_) => _openPendingTap());
  }

  void _setLocale(Locale locale) {
    Strings.setLang(locale.languageCode);
    if (RealtimeStore.instance.isSignedIn) {
      unawaited(RealtimeStore.instance.updateProfile(locale: locale.languageCode).catchError((_) {}));
    }
  }

  Widget _home() {
    if (!_splashDone || !_restored) {
      return CustomerSplashScreen(onDone: () => setState(() => _splashDone = true));
    }
    if (!_authed) {
      return LoginScreen(onAuthed: () => setState(_enter));
    }
    return AppShell(
      onLocaleChanged: _setLocale,
      locale: _locale,
      onLogout: () => setState(() => _authed = false),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Somba&Teka',
      scaffoldMessengerKey: _messenger,
      navigatorKey: _navigator,
      debugShowCheckedModeBanner: false,
      locale: _locale,
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: AppTheme.light(),
      // Rebuild on market/currency change so prices re-render app-wide.
      home: ValueListenableBuilder(
        valueListenable: marketNotifier,
        builder: (_, __, ___) => _home(),
      ),
    );
  }
}
