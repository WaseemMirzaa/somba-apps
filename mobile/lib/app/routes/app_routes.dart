/// Route names — IDs map to the shared screen registry
/// (shared/screens/registry.ts, CF-xx entries).
abstract class AppRoutes {
  static const splash = '/splash'; // CF-01
  static const onboarding = '/onboarding';
  static const login = '/login'; // CF-14
  static const register = '/register'; // CF-13
  static const otp = '/otp'; // CF-15
  static const forgot = '/forgot'; // CF-17
  static const reset = '/reset'; // CF-18
  static const shell = '/shell'; // tabs: CF-02/03/09/22/19
  static const products = '/products'; // CF-04
  static const search = '/search'; // CF-05/06
  static const store = '/store'; // CF-07
  static const product = '/product'; // CF-08
  static const reviewCompose = '/review-compose'; // CF-27
  static const checkout = '/checkout'; // CF-10
  static const payment = '/payment'; // CF-11
  static const orderConfirmed = '/order-confirmed'; // CF-12
  static const addresses = '/addresses'; // CF-20
  static const addressForm = '/address-form'; // CF-21
  static const orderDetail = '/order-detail'; // CF-23
  static const orderTracking = '/order-tracking'; // CF-24
  static const returnRequest = '/return-request'; // CF-25
  static const returnStatus = '/return-status'; // CF-26
  static const wishlist = '/wishlist'; // CF-28
  static const notifications = '/notifications'; // CF-29
  static const help = '/help'; // CF-31
  static const wallet = '/wallet'; // CF-32
  static const deals = '/deals'; // CF-36
}
