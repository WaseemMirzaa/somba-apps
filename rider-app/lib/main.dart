import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'l10n/notification_text.dart';
import 'l10n/strings.dart';
import 'screens/rider_shell.dart';
import 'screens/more/rider_auth.dart';
import 'services/push_service.dart';
import 'services/rider_store.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // The saved language, else the phone's (French → French, anything else → English).
  await Strings.restore();
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
  Locale _locale = Locale(Strings.current.lang);
  bool _splashDone = false;
  bool _restored = false;
  bool _authed = false;
  final _messenger = GlobalKey<ScaffoldMessengerState>();
  StreamSubscription<PushMessage>? _foregroundSub;

  @override
  void initState() {
    super.initState();
    Strings.langNotifier.addListener(_onLang);
    // A tapped notification opens its delivery once the rider is in and the queue is loaded.
    PushService.instance.pendingTap.addListener(_openPendingTap);
    RiderStore.instance.addListener(_openPendingTap);
    _foregroundSub = PushService.instance.foreground.listen(_showForegroundPush);
    RiderStore.instance.onSessionEnded = () {
      if (!mounted) return;
      setState(() => _authed = false);
      _messenger.currentState?.showSnackBar(SnackBar(content: Text(Strings.current.errSignedOut)));
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

  @override
  void dispose() {
    Strings.langNotifier.removeListener(_onLang);
    PushService.instance.pendingTap.removeListener(_openPendingTap);
    RiderStore.instance.removeListener(_openPendingTap);
    _foregroundSub?.cancel();
    super.dispose();
  }

  void _openPendingTap() {
    if (!_authed || !RiderStore.instance.loaded || PushService.instance.pendingTap.value == null) return;
    _open(PushService.instance.takeTap()!);
  }

  void _open(PushMessage m) => RiderStore.instance.openNotice(type: m.type, entityId: m.entityId, view: m.data['view'], notificationId: m.notificationId);

  /// A push while the app is open: a banner with "Open" (the lists refresh on their own).
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
      action: SnackBarAction(label: s.pushOpen, onPressed: () => _open(m)),
    ));
  }

  void _onLang() {
    if (mounted) setState(() => _locale = Locale(Strings.langNotifier.value));
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
      onLocaleChanged: (l) => Strings.setLang(l.languageCode),
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
