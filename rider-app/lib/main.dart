import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'screens/rider_shell.dart';
import 'screens/more/rider_auth.dart';
import 'services/rider_store.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Best-effort: restore a backend session so the Live tab reconnects.
  unawaited(RiderStore.instance.tryRestore());
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
  Locale _locale = const Locale('en');
  bool _splashDone = false;
  bool _authed = false;

  Widget _home() {
    if (!_splashDone) {
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
