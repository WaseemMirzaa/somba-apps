// Dev-only entry point used to screenshot individual screens deterministically.
// Build: flutter build web -t lib/gallery.dart   →  open ?s=<key>
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'theme/app_theme.dart';
import 'screens/more/auth_screens.dart';
import 'screens/more/search_screen.dart';
import 'screens/more/order_screens.dart';
import 'screens/more/account_more.dart';
import 'screens/more/shop_extra.dart';
import 'screens/more/returns_extra.dart';
import 'screens/more/support_extra.dart';

void main() => runApp(const _GalleryApp());

const _en = Locale('en');

Map<String, WidgetBuilder> get _screens => {
      'login': (_) => const LoginScreen(),
      'register': (_) => const RegisterScreen(),
      'otp': (_) => const OtpScreen(),
      'forgot': (_) => const ForgotScreen(),
      'search': (_) => const SearchScreen(locale: _en),
      'order-detail': (_) => const OrderDetailScreen(locale: _en),
      'order-tracking': (_) => const OrderTrackingScreen(locale: _en),
      'wishlist': (_) => const WishlistScreen(locale: _en),
      'notifications': (_) => const NotificationsScreen(locale: _en),
      'addresses': (_) => const AddressBookScreen(locale: _en),
      'store': (_) => const StoreScreen(locale: _en),
      'reviews': (_) => const ReviewsScreen(locale: _en),
      'payment': (_) => const PaymentScreen(locale: _en),
      'payment-failed': (_) => const PaymentScreen(locale: _en, failed: true),
      'return-request': (_) => const ReturnRequestScreen(locale: _en),
      'return-status': (_) => const ReturnStatusScreen(locale: _en),
      'exchange': (_) => const ExchangeScreen(locale: _en),
      'dispute': (_) => const DisputeScreen(locale: _en),
      'address-form': (_) => const AddressFormScreen(locale: _en),
      'refer': (_) => const ReferScreen(locale: _en),
      'support': (_) => const SupportListScreen(locale: _en),
      'help': (_) => const HelpScreen(locale: _en),
      'account-delete': (_) => const AccountDeleteScreen(),
    };

class _GalleryApp extends StatelessWidget {
  const _GalleryApp();
  @override
  Widget build(BuildContext context) {
    final key = Uri.base.queryParameters['s'] ?? 'login';
    final builder = _screens[key] ?? (_) => Scaffold(body: Center(child: Text('Unknown screen: $key')));
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      locale: _en,
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Builder(builder: builder),
    );
  }
}
