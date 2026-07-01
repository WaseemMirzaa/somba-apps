import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'screens/rider_shell.dart';
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
  Locale _locale = const Locale('en');

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
      home: RiderShell(
        locale: _locale,
        onLocaleChanged: (l) => setState(() => _locale = l),
      ),
    );
  }
}
