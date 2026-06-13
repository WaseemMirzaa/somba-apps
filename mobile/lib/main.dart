import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:get/get.dart';

import 'app/core/i18n/app_translations.dart';
import 'app/core/services/session_service.dart';
import 'app/core/services/shop_service.dart';
import 'app/core/theme/app_theme.dart';
import 'app/modules/auth/auth_controller.dart';
import 'app/routes/app_pages.dart';
import 'app/routes/app_routes.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  Get.put(SessionService(), permanent: true);
  Get.put(ShopService(), permanent: true);
  Get.put(AuthController(), permanent: true);
  runApp(const SombaTekaApp());
}

class SombaTekaApp extends StatelessWidget {
  const SombaTekaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return GetMaterialApp(
      title: 'Somba&Teka',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      translations: AppTranslations(),
      locale: const Locale('fr'),
      fallbackLocale: const Locale('en'),
      supportedLocales: const [Locale('fr'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      initialRoute: AppRoutes.splash,
      getPages: AppPages.pages,
      defaultTransition: Transition.cupertino,
    );
  }
}
