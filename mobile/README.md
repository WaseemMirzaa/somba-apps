# Somba&Teka — Customer Mobile App (Flutter)

Frontend prototype of the Somba&Teka customer shopping app for DR Congo
(Kinshasa & Lubumbashi). All data and flows are mocked — the Node.js backend
arrives in later milestones and will replace the mock layer
(`lib/app/data/mock/` and the service method bodies) without UI changes.

## Stack

- Flutter (Android & iOS), Material 3
- **GetX** — state management, routing, dependency injection and i18n
- **google_maps_flutter** — address map-pin picker and parcel-journey tracking map
- Bilingual **French (default) / English**, switchable from onboarding and Account
- Dual currency **CDF / USD** (mock rate 2 850 FC = 1 $), switchable from Home and Account

## Run

```bash
cd mobile
flutter pub get
flutter run
```

Google Maps needs a real API key to render tiles:

- Android: `android/app/src/main/AndroidManifest.xml` → `com.google.android.geo.API_KEY`
- iOS: `ios/Runner/AppDelegate.swift` → `GMSServices.provideAPIKey(...)`

## Demo credentials & mock rules

| What | Value |
|---|---|
| Login | any phone number + password `somba123` |
| SMS OTP (sign-up / reset) | `123456` |
| Coupons | `SOMBA10` (10 % off, min $50), `SAVE20` ($20 off, min $100) |
| Payment failure demo | mobile-money number ending in `0` fails, retry succeeds |
| Order progression | live orders advance one status every 40 s |

## Screens (CF-xx IDs from `shared/screens/registry.ts`)

Splash CF-01 · Onboarding + language choice · Login/Register/OTP/Forgot/Reset
CF-13…18 · Home CF-02 · Categories CF-03 · Product list + filters CF-04 ·
Search CF-05/06 · Store front CF-07 · Product detail CF-08 · Review compose
CF-27 · Cart CF-09 · Checkout CF-10 · Address book/form (map pin) CF-20/21 ·
Payment CF-11 · Order confirmation CF-12 · Orders CF-22 · Order detail CF-23 ·
Tracking (timeline + map) CF-24 · Return request/status CF-25/26 · Wishlist
CF-28 · Notifications CF-29 · Help & legal CF-31 · Wallet CF-32 · Flash deals
CF-36 · Account & settings CF-19

Full flow plan: `../docs/MOBILE_APP_FLOWS.md`.

## Structure

```
lib/
  main.dart                     # GetMaterialApp, services, locales
  app/
    core/
      theme/app_theme.dart      # brand: #1A3AA8 blue / #E11428 red
      i18n/app_translations.dart# all EN + FR strings
      services/                 # SessionService, ShopService (mock state)
    data/
      models/models.dart        # Product, Order, Address, Wallet, …
      mock/mock_data.dart       # seeded catalog, orders, notifications
    modules/<feature>/          # screen + controller per feature
    routes/                     # route names + GetPage table
    widgets/common.dart         # ProductCard, StatusChip, helpers
```
