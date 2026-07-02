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
import 'screens/more/address_flow.dart';
import 'screens/more/checkout_flow.dart';
import 'screens/more/catalog_extra.dart';
import 'screens/more/settings_extra.dart';
import 'app.dart';
import 'screens/product_detail_screen.dart';
import 'screens/cart_screen.dart';
import 'screens/checkout_screen.dart';
import 'screens/orders_screen.dart';
import 'screens/more/browse.dart';
import 'data/mock_data.dart';
import 'data/shop_state.dart';
import 'data/market_profiles.dart';
import 'util/format.dart';

void main() => runApp(const _GalleryApp());

const _en = Locale('en');

Map<String, WidgetBuilder> get _screens => {
      // Main tab screens rendered inside the real app shell so the floating
      // bottom navigation bar shows, exactly like the running app.
      'home': (_) => AppShell(locale: _en, onLocaleChanged: (_) {}, initialIndex: 0),
      'categories': (_) => AppShell(locale: _en, onLocaleChanged: (_) {}, initialIndex: 1),
      'deals': (_) => AppShell(locale: _en, onLocaleChanged: (_) {}, initialIndex: 2),
      'account': (_) => AppShell(locale: _en, onLocaleChanged: (_) {}, initialIndex: 3),
      'cart': (_) => const CartScreen(locale: _en),
      'checkout': (_) => const CheckoutScreen(locale: _en),
      'orders': (_) => const OrdersScreen(locale: _en),
      'splash': (_) => CustomerSplashScreen(onDone: () {}),
      'login': (_) => const LoginScreen(),
      'register': (_) => const RegisterScreen(),
      'otp': (_) => const OtpScreen(),
      'forgot': (_) => const ForgotScreen(),
      'reset': (_) => const ResetPasswordScreen(),
      'verify-email': (_) => const VerifyEmailScreen(),
      'product-list': (_) => const ProductListScreen(locale: _en, category: 'Electronics'),
      'product-detail': (_) => ProductDetailScreen(product: products[8], locale: _en),
      'product-detail-drc': (_) {
        marketNotifier.value = MarketProfileId.drc; // dual-currency (FC + ≈$)
        return ProductDetailScreen(product: products[8], locale: _en);
      },
      'coupons': (_) => const CouponsScreen(locale: _en),
      'review-compose': (_) => const ReviewComposeScreen(locale: _en),
      'settings': (_) => const CustomerSettingsScreen(locale: _en),
      'edit-profile': (_) => const CustomerEditProfileScreen(locale: _en),
      'support-detail': (_) => const SupportTicketDetailScreen(id: 'TKT-3391', subject: 'Refund not received', status: 'Open', statusColor: AppColors.amber),
      'search': (_) => const SearchScreen(locale: _en, initialText: 'S'),
      'sellers': (_) => const SellersDirectoryScreen(locale: _en),
      'address-select': (_) => const AddressSelectScreen(locale: _en),
      'order-detail': (_) => const OrderDetailScreen(locale: _en),
      'order-tracking': (_) => const OrderTrackingScreen(locale: _en),
      'wishlist': (_) => const WishlistScreen(locale: _en),
      'notifications': (_) => const NotificationsScreen(locale: _en),
      'addresses': (_) => const AddressBookScreen(locale: _en),
      'store': (_) => const StoreScreen(locale: _en),
      'seller-chat': (_) => const SellerChatScreen(storeName: 'TechSphere Store'),
      'reviews': (_) => const ReviewsScreen(locale: _en),
      'payment': (_) => const PaymentScreen(locale: _en),
      'payment-failed': (_) => const PaymentScreen(locale: _en, failed: true),
      'return-request': (_) => const ReturnRequestScreen(locale: _en),
      'return-status': (_) => const ReturnStatusScreen(locale: _en),
      'returns-list': (_) => const ReturnsListScreen(locale: _en),
      'exchange': (_) => const ExchangeScreen(locale: _en),
      'dispute': (_) => const DisputeScreen(locale: _en),
      'address-form': (_) => const AddressFormScreen(locale: _en),
      'address-picker': (_) => const AddressPickerScreen(locale: _en),
      'add-card': (_) => const AddCardScreen(),
      'order-summary': (_) => OrderSummaryScreen(locale: _en, paymentLabel: 'Visa ···· 4242', address: ShopState.instance.addresses.first),
      'refer': (_) => const ReferScreen(locale: _en),
      'support': (_) => const SupportListScreen(locale: _en),
      'new-ticket': (_) => const NewTicketScreen(locale: _en),
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
