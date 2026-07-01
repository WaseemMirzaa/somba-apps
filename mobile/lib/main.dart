import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'app.dart';
import 'data/shop_state.dart';
import 'screens/more/auth_screens.dart';
import 'theme/app_theme.dart';
import 'util/format.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ShopState.instance.load();
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
  Locale _locale = const Locale('en');
  bool _splashDone = false;
  bool _authed = false;

  void _setLocale(Locale locale) {
    setState(() => _locale = locale);
  }

  Widget _home() {
    if (!_splashDone) {
      return CustomerSplashScreen(onDone: () => setState(() => _splashDone = true));
    }
    if (!_authed) {
      return LoginScreen(onAuthed: () => setState(() => _authed = true));
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
