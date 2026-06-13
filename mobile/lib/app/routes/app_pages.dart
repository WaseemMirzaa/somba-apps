import 'package:get/get.dart';

import '../modules/address/address_screens.dart';
import '../modules/auth/auth_screens.dart';
import '../modules/catalog/product_list_screen.dart';
import '../modules/catalog/search_screen.dart';
import '../modules/catalog/store_screen.dart';
import '../modules/checkout/checkout_screens.dart';
import '../modules/misc/misc_screens.dart';
import '../modules/onboarding/onboarding_screen.dart';
import '../modules/orders/orders_screens.dart';
import '../modules/product/product_detail_screen.dart';
import '../modules/product/review_compose_screen.dart';
import '../modules/returns/return_screens.dart';
import '../modules/shell/shell_screen.dart';
import '../modules/splash/splash_screen.dart';
import 'app_routes.dart';

class AppPages {
  AppPages._();

  static final pages = <GetPage>[
    GetPage(name: AppRoutes.splash, page: () => const SplashScreen()),
    GetPage(name: AppRoutes.onboarding, page: () => const OnboardingScreen()),
    GetPage(name: AppRoutes.login, page: () => const LoginScreen()),
    GetPage(name: AppRoutes.register, page: () => const RegisterScreen()),
    GetPage(name: AppRoutes.otp, page: () => const OtpScreen()),
    GetPage(name: AppRoutes.forgot, page: () => const ForgotPasswordScreen()),
    GetPage(name: AppRoutes.reset, page: () => const ResetPasswordScreen()),
    GetPage(name: AppRoutes.shell, page: () => const ShellScreen()),
    GetPage(name: AppRoutes.products, page: () => const ProductListScreen()),
    GetPage(name: AppRoutes.search, page: () => const SearchScreen()),
    GetPage(name: AppRoutes.store, page: () => const StoreScreen()),
    GetPage(name: AppRoutes.product, page: () => const ProductDetailScreen()),
    GetPage(
        name: AppRoutes.reviewCompose,
        page: () => const ReviewComposeScreen()),
    GetPage(name: AppRoutes.checkout, page: () => const CheckoutScreen()),
    GetPage(name: AppRoutes.payment, page: () => const PaymentScreen()),
    GetPage(
        name: AppRoutes.orderConfirmed,
        page: () => const OrderConfirmedScreen()),
    GetPage(name: AppRoutes.addresses, page: () => const AddressBookScreen()),
    GetPage(
        name: AppRoutes.addressForm, page: () => const AddressFormScreen()),
    GetPage(
        name: AppRoutes.orderDetail, page: () => const OrderDetailScreen()),
    GetPage(
        name: AppRoutes.orderTracking,
        page: () => const OrderTrackingScreen()),
    GetPage(
        name: AppRoutes.returnRequest,
        page: () => const ReturnRequestScreen()),
    GetPage(
        name: AppRoutes.returnStatus, page: () => const ReturnStatusScreen()),
    GetPage(name: AppRoutes.wishlist, page: () => const WishlistScreen()),
    GetPage(
        name: AppRoutes.notifications,
        page: () => const NotificationsScreen()),
    GetPage(name: AppRoutes.help, page: () => const HelpScreen()),
    GetPage(name: AppRoutes.wallet, page: () => const WalletScreen()),
    GetPage(name: AppRoutes.deals, page: () => const DealsScreen()),
  ];
}
