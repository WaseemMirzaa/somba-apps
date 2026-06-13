# Somba Rider — Somba&Teka Rider App

Frontend prototype of the Somba&Teka rider app for DR Congo (Kinshasa & Lubumbashi).
Riders handle **pickups** (collect parcels from sellers and bring them to the city
warehouse) and **deliveries** (carry consolidated batches from the warehouse to
customers). Riders are salaried employees: there is no earnings module and no
cash-on-delivery. Dispatch is manual — tasks arrive pre-assigned. Proof of
pickup/delivery = barcode scan (simulated) + OTP.

Everything is mocked in-memory — no backend calls.

## Run

```bash
export PATH=/opt/flutter/bin:$PATH
cd rider-app
flutter pub get
flutter run
```

Stack: Flutter 3.32 / Dart 3.8, GetX (state, routing, i18n), google_maps_flutter, intl.
Default locale is French (formal), English fallback — switchable from the Profile tab.

## Demo credentials

- **Phone:** any phone number
- **Password:** `somba123`
- **OTP (pickup & delivery proof):** `4321`

Flow: Login → set new password (first login) → KYC submission (mock approval) → app shell.

## Google Maps API key

The placeholder `YOUR_GOOGLE_MAPS_API_KEY` must be replaced with a real key:

- **Android:** `android/app/src/main/AndroidManifest.xml` →
  `<meta-data android:name="com.google.android.geo.API_KEY" android:value="..."/>`
- **iOS:** `ios/Runner/AppDelegate.swift` → `GMSServices.provideAPIKey("...")`

Without a key the screens still render; only the map tiles stay blank.

## Screens (RF IDs)

| ID | Screen | Route |
| --- | --- | --- |
| RF-01 | Splash | `/splash` |
| — | Login | `/login` |
| RF-02 | First password set | `/first-password` |
| — | KYC submission (mock review) | `/kyc` |
| RF-03 | Task feed (online/offline switch, pickups + batch) | `/shell` (Tasks tab) |
| RF-04 | Pickup task detail (map, route, navigate) | `/task/:id` |
| RF-05 | Pickup proof (scan parcels + seller OTP) | `/task/:id/proof` |
| RF-06 | Warehouse check-in | `/task/:id/warehouse` |
| RF-07 | Batch overview (full route map, ordered stops) | `/batch/:id` |
| RF-08 | Stop detail | `/stop/:id` |
| RF-09 | Proof of delivery (scan + customer OTP, auto-advance) | `/stop/:id/pod` |
| RF-10 | Failed delivery (reason, note, photo) | `/stop/:id/fail` |
| — | Batch complete summary | `/batch/:id/complete` |
| RF-12 | Map tab (rider, warehouse, tasks, route) | `/shell` (Map tab) |
| RF-13 | History (grouped by day) | `/shell` (History tab) |
| RF-14 | Notifications | `/notifications` |
| — | Profile (rider card, language, support, logout) | `/shell` (Profile tab) |

## Project structure

```
lib/
  main.dart                              GetMaterialApp, services, routes, fr/en i18n
  app/core/theme/app_theme.dart          Material 3 brand theme
  app/core/i18n/app_translations.dart    GetX translations (en + fr)
  app/core/services/                     SessionService, TaskService (mock state)
  app/core/utils/map_utils.dart          camera-fit helpers
  app/core/widgets/common_widgets.dart   chips, tiles, shared UI
  app/data/models/                       Rider, RiderTask, Parcel, Batch, Warehouse, AppNotification
  app/data/mock/mock_data.dart           seeded Kinshasa mock data
  app/modules/<feature>/                 screen + controller (+ binding) per feature
  app/routes/                            route names + GetPage table
```
