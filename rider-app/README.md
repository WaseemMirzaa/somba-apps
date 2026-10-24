# Somba&Teka — Rider App (Flutter)

The rider/courier app for the Somba&Teka marketplace: manage delivery, pickup and
return tasks, collect cash on delivery, navigate an optimized route, and track
earnings.

## Realtime backend connection

The whole app runs on live data (no mock tasks): it connects to the NestJS backend (`../api`) over a single
authenticated **Socket.IO** connection (services in `lib/services/`). The rider
accepts tasks from the unassigned pool, advances delivery status, and streams
GPS — each action pushes live to the customer app and the web dashboards.

Configure the endpoint with `--dart-define` (defaults target the Android
emulator loopback `10.0.2.2`). `API_URL` is enough: the socket follows it, and
`SOCKET_URL` is only for a socket hosted elsewhere:

```bash
flutter run --dart-define=API_URL=http://localhost:3001
```

Seeded dev login (`npm run seed` in `api/` only): `rider@somba.app` / `Somba@2026`. Production riders
are created by the fleet team in the admin panel. The sign-in screen never pre-fills credentials and
never lets anyone in offline.

Tabs: **Deliveries** (Active / Available / Done; claim → picked up → in transit → delivered, with a
cash-collected confirmation for COD), **Earnings** (server-computed totals + cash to hand over),
**Profile** (notifications, language, sign out). While a delivery is on the road the app streams the
real GPS position (`geolocator`; permission declared in the Android manifest) as `delivery:location`.

### Tests

```bash
flutter analyze && flutter test                      # widget tests
# live end-to-end against a seeded, running API (sign in, claim, deliver, GPS, earnings):
flutter test test/live_api_test.dart --dart-define=LIVE_TEST=true \
  --dart-define=API_URL=http://localhost:3001 --dart-define=SOCKET_URL=http://localhost:3001
```

## Highlights

- Modern royal-blue identity (logo colour) with a **floating capsule navigation** (animated
  expanding pill), **Plus Jakarta Sans** display headings paired with Inter body text.
- **Tasks**: gradient on-duty header with live stats, colour-coded task cards
  (delivery / pickup / return) with COD and open-box chips, distance · ETA · items,
  and a rich task-action bottom sheet (navigate, complete, report).
- **Navigate**: a custom-painted route map with sequenced stop markers and a
  next-stop action card.
- **Earnings**: gradient balance hero, a weekly bar chart with the best day
  highlighted, and payout history.
- **Profile**: stats header, on-duty switch, vehicle/documents/support, EN/FR toggle.
- Bundled **Inter + Plus Jakarta Sans** fonts — no runtime font fetching; fully self-contained.

## Run locally

```bash
cd rider-app
flutter pub get
flutter run            # device / emulator
flutter run -d chrome  # web
```

Requires Flutter **3.35.7** or newer (verified with 3.47.6).

## CI/CD — Android APK

`.github/workflows/rider-app-apk.yml` builds the release APK on every push that
touches `rider-app/`:

1. JDK 17 + Flutter 3.35.7
2. `flutter pub get` → `flutter analyze` → `flutter test`
3. `flutter build apk --release` (universal) and `--split-per-abi`
4. Uploads the APKs as the `somba-rider-apk` artifact
5. Publishes a GitHub Release with `somba-rider.apk` attached

## Screenshots

Rendered from the web build. See [`docs/screenshots/`](docs/screenshots).

![Gallery](docs/screenshots/gallery.png)


## Languages (French / English)

The first launch follows the phone (`fr` → French, anything else → English); the choice made on the sign-in screen or in *Profile* is remembered (`shared_preferences`). Texts are in `lib/l10n/messages.dart` (`key → (English, French)`, typed accessors in `strings_keys.dart`, `Strings.of(context)`), server messages are mapped in `lib/l10n/server_errors.dart`. `test/l10n_test.dart` checks that every text exists in both languages and that no screen hard-codes visible text.

## Position sharing while a delivery is in transit (background)

The GPS runs **only while a delivery is `in_transit`**; it stops when the delivery is delivered or failed, and on sign-out (`RiderStore._syncLocation`).

* Android: geolocator's foreground service (`ForegroundNotificationConfig`, ongoing notification "Livraison en cours / Delivery in progress" in the rider's language). Manifest: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `WAKE_LOCK`, `POST_NOTIFICATIONS` (the service type `location` is declared by geolocator). Only the *while in use* location permission is needed because the service is started from the foreground; the app label is localised in `res/values{,-fr}/strings.xml`.
* iOS (`ios/` project, generated with `flutter create --platforms=ios`): `UIBackgroundModes` = `location` + `remote-notification`, `AppleSettings(allowBackgroundLocationUpdates: true, showBackgroundLocationIndicator: true, pauseLocationUpdatesAutomatically: false)`, and the usage descriptions in `Info.plist` with French/English `InfoPlist.strings` (`en.lproj`, `fr.lproj`, registered in the Xcode project). The usage text is also explained in-app (localised dialog) before the first ride.
* **Not verified on a device**: it was written against the geolocator API and unit-tested (settings per platform, start/stop rules with a fake reporter), but never run on an Android phone or an iPhone. Check battery behaviour, Android 12+ "foreground service from background" restrictions and the iOS blue indicator on real hardware before release.

## Push notifications

Same `PushService` as the customer app (`app: 'rider'`); see `../docs/MOBILE-PUSH.md`.
