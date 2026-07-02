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

/// Active locale — driven by the `?lang=fr` query param (defaults to English).
Locale get _loc => Locale(Uri.base.queryParameters['lang'] == 'fr' ? 'fr' : 'en');

Map<String, WidgetBuilder> get _screens {
  final loc = _loc;
  return {
      // Main tab screens rendered inside the real app shell so the floating
      // bottom navigation bar shows, exactly like the running app.
      'home': (_) => AppShell(locale: loc, onLocaleChanged: (_) {}, initialIndex: 0),
      'categories': (_) => AppShell(locale: loc, onLocaleChanged: (_) {}, initialIndex: 1),
      'deals': (_) => AppShell(locale: loc, onLocaleChanged: (_) {}, initialIndex: 2),
      'account': (_) => AppShell(locale: loc, onLocaleChanged: (_) {}, initialIndex: 3),
      'cart': (_) => CartScreen(locale: loc),
      'checkout': (_) => CheckoutScreen(locale: loc),
      'orders': (_) => OrdersScreen(locale: loc),
      'splash': (_) => CustomerSplashScreen(onDone: () {}),
      'login': (_) => const LoginScreen(),
      'register': (_) => const RegisterScreen(),
      'otp': (_) => const OtpScreen(),
      'forgot': (_) => const ForgotScreen(),
      'reset': (_) => const ResetPasswordScreen(),
      'verify-email': (_) => const VerifyEmailScreen(),
      'product-list': (_) => ProductListScreen(locale: loc, category: 'Electronics'),
      'product-detail': (_) => ProductDetailScreen(product: products[8], locale: loc),
      'product-detail-drc': (_) {
        marketNotifier.value = MarketProfileId.drc; // dual-currency (FC + ≈$)
        return ProductDetailScreen(product: products[8], locale: loc);
      },
      'coupons': (_) => CouponsScreen(locale: loc),
      'review-compose': (_) => ReviewComposeScreen(locale: loc),
      'settings': (_) => CustomerSettingsScreen(locale: loc),
      'edit-profile': (_) => CustomerEditProfileScreen(locale: loc),
      'support-detail': (_) => const SupportTicketDetailScreen(id: 'TKT-3391', subject: 'Refund not received', status: 'Open', statusColor: AppColors.amber),
      'search': (_) => SearchScreen(locale: loc, initialText: 'S'),
      'sellers': (_) => SellersDirectoryScreen(locale: loc),
      'address-select': (_) => AddressSelectScreen(locale: loc),
      'order-detail': (_) => OrderDetailScreen(locale: loc),
      'order-tracking': (_) => OrderTrackingScreen(locale: loc),
      'wishlist': (_) => WishlistScreen(locale: loc),
      'notifications': (_) => NotificationsScreen(locale: loc),
      'addresses': (_) => AddressBookScreen(locale: loc),
      'store': (_) => StoreScreen(locale: loc),
      'seller-chat': (_) => const SellerChatScreen(storeName: 'TechSphere Store'),
      'reviews': (_) => ReviewsScreen(locale: loc),
      'payment': (_) => PaymentScreen(locale: loc),
      'payment-failed': (_) => PaymentScreen(locale: loc, failed: true),
      'return-request': (_) => ReturnRequestScreen(locale: loc),
      'return-status': (_) => ReturnStatusScreen(locale: loc),
      'returns-list': (_) => ReturnsListScreen(locale: loc),
      'exchange': (_) => ExchangeScreen(locale: loc),
      'dispute': (_) => DisputeScreen(locale: loc),
      'address-form': (_) => AddressFormScreen(locale: loc),
      'address-picker': (_) => AddressPickerScreen(locale: loc),
      'add-card': (_) => const AddCardScreen(),
      'order-summary': (_) => OrderSummaryScreen(locale: loc, paymentLabel: 'Visa ···· 4242', address: ShopState.instance.addresses.first),
      'refer': (_) => ReferScreen(locale: loc),
      'support': (_) => SupportListScreen(locale: loc),
      'new-ticket': (_) => NewTicketScreen(locale: loc),
      'help': (_) => HelpScreen(locale: loc),
      'account-delete': (_) => const AccountDeleteScreen(),
      // Filter / sort popup (AliExpress-style) over a product list.
      'filter-popup': (_) => _FilterPopupDemo(loc, ProductQuery(category: 'Electronics')),
      'filter-popup-active': (_) => _FilterPopupDemo(loc, ProductQuery(category: 'Fashion', sort: 1, minPrice: 20, maxPrice: 120, minRating: 4.0, dealsOnly: true)),
    };
}

/// Renders the filter bottom sheet open over a product list for screenshots.
class _FilterPopupDemo extends StatefulWidget {
  final Locale locale;
  final ProductQuery query;
  const _FilterPopupDemo(this.locale, this.query);
  @override
  State<_FilterPopupDemo> createState() => _FilterPopupDemoState();
}

class _FilterPopupDemoState extends State<_FilterPopupDemo> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => showFilterSheet(context, widget.query));
  }

  @override
  Widget build(BuildContext context) => ProductListScreen(locale: widget.locale, category: widget.query.category);
}

class _GalleryApp extends StatelessWidget {
  const _GalleryApp();
  @override
  Widget build(BuildContext context) {
    final key = Uri.base.queryParameters['s'] ?? 'login';
    final builder = _screens[key] ?? (_) => Scaffold(body: Center(child: Text('Unknown screen: $key')));
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      locale: _loc,
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
