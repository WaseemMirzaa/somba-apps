import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'screens/rider_shell.dart';
import 'screens/more/rider_auth.dart';
import 'services/rider_store.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
  ));
  runApp(const SombaRiderApp());
}

class SombaRiderApp extends StatefulWidget {
  const SombaRiderApp({super.key});

  @override
  State<SombaRiderApp> createState() => _SombaRiderAppState();
}

class _SombaRiderAppState extends State<SombaRiderApp> {
  Locale _locale = const Locale('fr');
  bool _splashDone = false;
  bool _restored = false;
  bool _authed = false;
  final _messenger = GlobalKey<ScaffoldMessengerState>();

  @override
  void initState() {
    super.initState();
    RiderStore.instance.onSessionEnded = () {
      if (!mounted) return;
      setState(() => _authed = false);
      _messenger.currentState?.showSnackBar(const SnackBar(content: Text('You were signed out. Please sign in again.')));
    };
    // Silently resume the previous shift (stored refresh token).
    RiderStore.instance.tryRestore().timeout(const Duration(seconds: 8), onTimeout: () => false).then((ok) {
      if (!mounted) return;
      setState(() {
        _restored = true;
        _authed = ok;
      });
    });
  }

  Widget _home() {
    if (!_splashDone || !_restored) {
      return SplashScreen(onDone: () => setState(() => _splashDone = true));
    }
    if (!_authed) {
      return RiderLoginScreen(onSignedIn: () => setState(() => _authed = true));
    }
    return RiderShell(
      locale: _locale,
      onLocaleChanged: (l) => setState(() => _locale = l),
      onLogout: () => setState(() => _authed = false),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Somba&Teka Rider',
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
      home: _home(),
    );
  }
}
