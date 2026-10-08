import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'app.dart';
import 'data/market_profiles.dart';
import 'data/shop_state.dart';
import 'screens/more/auth_screens.dart';
import 'services/realtime_store.dart';
import 'theme/app_theme.dart';
import 'util/format.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
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
  Locale _locale = const Locale('fr');
  bool _splashDone = false;
  bool _restored = false;
  bool _authed = false;
  final _messenger = GlobalKey<ScaffoldMessengerState>();

  @override
  void initState() {
    super.initState();
    // The server can end a session (revoked, suspended, deleted): go back to sign-in.
    RealtimeStore.instance.onSessionEnded = () {
      if (!mounted) return;
      ShopState.instance.clearSession();
      setState(() => _authed = false);
      _messenger.currentState?.showSnackBar(const SnackBar(content: Text('You were signed out. Please sign in again.')));
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

  /// Called once a session exists (restored or freshly signed in).
  void _enter() {
    _authed = true;
    final user = RealtimeStore.instance.user;
    if (user != null) _locale = Locale(user.locale == 'en' ? 'en' : 'fr');
    final market = RealtimeStore.instance.prefs['market'];
    marketNotifier.value = market == 'FR' ? MarketProfileId.france : MarketProfileId.drc;
  }

  void _setLocale(Locale locale) {
    setState(() => _locale = locale);
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
