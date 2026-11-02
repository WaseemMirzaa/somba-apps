# Somba&Teka — Rider App (Flutter)

The rider/courier app for the Somba&Teka marketplace: work through the tasks your warehouse
assigns (pickups, transfers, deliveries, returns, replacements), open turn-by-turn navigation in
your maps app, collect cash on delivery, and see what you completed. Riders are salaried: the app
has no payout or withdrawal.

## Realtime backend connection

The whole app runs on live data (no mock tasks): it connects to the NestJS backend (`../api`) over a single
authenticated **Socket.IO** connection (services in `lib/services/`). The rider's warehouse
assigns the tasks (pickup, transfer, delivery, returns, replacements; there is no self-accept); the rider
advances each leg's status and streams GPS — each action pushes live to the customer app and the web dashboards.

Configure the endpoint with `--dart-define` (defaults target the Android
emulator loopback `10.0.2.2`). `API_URL` is enough: the socket follows it, and
`SOCKET_URL` is only for a socket hosted elsewhere:

```bash
flutter run --dart-define=API_URL=http://localhost:3001
```

Seeded dev login (`npm run seed` in `api/` only): `rider@somba.app` / `Somba@2026`. Production riders
are created by the fleet team in the admin panel. The sign-in screen never pre-fills credentials and
never lets anyone in offline.

Tabs: **Deliveries** (Active / Done; picked up → in transit → delivered, with a cash-collected confirmation
for COD and the customer's code on deliveries; legs that end at a warehouse are scanned in by its staff;
Done can be searched by order reference and narrowed to a range of days),
**My work** (server-computed work stats: tasks completed today / this week / all time, success rate, completed by type, plus cash to hand over), **Profile** (edit name and phone,
change password, home warehouse, **Support** tickets with photos, notifications, language, sign out). While a delivery is on the road the app streams the
real GPS position (`geolocator`; permission declared in the Android manifest) as `delivery:location`.

### Tests

```bash
flutter analyze && flutter test                      # widget tests
# live end-to-end against a seeded, running API (sign in, warehouse assigns a pickup, support ticket round trip):
flutter test test/live_api_test.dart --dart-define=LIVE_TEST=true \
  --dart-define=API_URL=http://localhost:3001 --dart-define=SOCKET_URL=http://localhost:3001
```

## How the rider works (and what the app does not have)

- **The warehouse assigns every task.** There is no pool of open jobs, no accept and no refuse: a task shows up
  in *Active* (with a "New task assigned to you" notice) as soon as the warehouse desk assigns it, and the rider
  only moves it along: picked up → on the way → delivered (or failed, with a reason). The server refuses
  `delivery:accept` for riders ("Your warehouse assigns your tasks...") and `delivery:unassigned` is empty for them.
- **No on-duty switch.** The green **Online** pill on the Deliveries header only shows that the phone is connected
  to the server (`ConnStatus`); it does not make the rider available or unavailable. A rider receives work as long
  as the account is active; to stop work, the desk stops assigning or an admin switches the account off (the app then
  signs the rider out).
- **No pay per task.** Riders are salaried. *My work* shows their work (tasks done, failed, success rate), never money
  earned; the only amount on it is the cash collected on delivery, which belongs to the company and is handed over at the
  warehouse. Nothing is paid out or withdrawn through the platform.

## Highlights

- Royal-blue identity with a **floating capsule navigation** (animated expanding pill), **Plus Jakarta Sans** display
  headings paired with Inter body text. Bundled fonts: no runtime font fetching.
- **Deliveries**: Active / Done tabs, task cards for every leg (pickup, transfer, delivery, return, replacement) with
  COD chips, the parcel, from → to, and the next action as a label-only button; transfer runs are one card with the parcels
  inside. *Done* has a search by order reference (or run reference) and a date-range filter.
- **Navigate**: opens turn-by-turn directions in your maps app. Android: Google Maps (the app when installed, else the
  browser). iPhone: **Apple Maps** straight away when Google Maps is not installed (no extra tap); when both are installed a
  small list asks which one to use for this trip. There is no in-app map. No API key is needed.
- **My work**: tasks completed today, this week and all time; completed, in progress, failed and success rate; completed by
  type (counts only); and the cash collected to hand over at the warehouse.
- **Profile**: edit name and phone, change password (the server signs every other phone out and this phone keeps working),
  home warehouse and the areas it covers, support tickets, notifications, EN/FR toggle, sign out. The e-mail, role and
  warehouse are changed by the fleet team or an admin only.
- **Session**: if the server revokes the session (password changed elsewhere, account switched off), the rider is signed out
  cleanly: every screen opened on top is closed and the sign-in screen shows with a message.

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
