# Push notifications in the mobile apps (FCM)

Both Flutter apps (`mobile/` customer, `rider-app/` rider) can receive push notifications through Firebase Cloud Messaging.
The backend side already exists (`devices:register` / `devices:unregister`, `api/src/notifications/push.service.ts`). This page says what the apps do today, and what is still to be done **with the client's Firebase project** before pushes reach a phone.

**Status.** The code is wired and safe: without Firebase configuration in the build, nothing happens (no crash, no prompt, no error shown), so every build, test and the web build are unaffected. It has **not been exercised on a phone** (no Firebase project, no device and no Android SDK were available when it was written). The unit tests cover the registration logic with a fake Firebase; the live tests cover `devices:register` against a real API.

## What is wired

| Piece | Where |
|---|---|
| Packages `firebase_core ^4`, `firebase_messaging ^16` | `mobile/pubspec.yaml`, `rider-app/pubspec.yaml` |
| `PushService` + `PushBackend` (Firebase implementation, replaceable in tests) | `lib/services/push_service.dart` in each app |
| Started when the socket is `ready` after sign-in (`PushService.instance.start`) | `RealtimeStore` (customer), `RiderStore` (rider) |
| Token registration: `devices:register {token, platform, app}` with `app: 'customer'` or `'rider'` | `registerDevice` in each store |
| Token rotation: FCM `onTokenRefresh` re-sends the new token | `PushService` |
| Sign-out: `devices:unregister {token}`, then the listeners stop | `logout()` in each store |
| Push received while the app is open: the notification list is re-read (rider: the delivery queue too) | `refreshNotifications()` in each store |
| Android 13+ run-time permission declared | `AndroidManifest.xml` (`POST_NOTIFICATIONS`) in both apps |
| iOS `UIBackgroundModes` includes `remote-notification` | `rider-app/ios/Runner/Info.plist` |

How it stays silent when Firebase is absent: `PushService.start` first asks the backend to `initialize()`. `Firebase.initializeApp()` runs inside `try/catch`; if the platform configuration file is missing it throws (Android: no `FirebaseOptions`; iOS: `firebase_core` does not call `configure()` without the plist; web: push is not used) and the service returns before asking for any permission. Only after a successful start does it call `requestPermission()` (the system prompt appears right after the first sign-in) and register the token.

A push that arrives while the app is closed or in the background is shown by the system (the API sends a `notification` payload). Tapping it just opens the app; deep-linking to the order from a tapped push is not implemented.

## The 4 manual steps (client's Firebase project)

0. **Server.** Give the API its Firebase credentials (`FIREBASE_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS`, see `docs/DEPLOYMENT.md`). Without them the API deliberately sends nothing, and `devices:register` answers `pushEnabled: false`.

1. **Add the config files** (Firebase console → Project settings → Your apps → add one app per platform and per Flutter app):
   * Android: package `com.somba.lipcart` (customer) and `com.somba.somba_rider` (rider). Download `google-services.json` into `mobile/android/app/` and `rider-app/android/app/`.
   * Apply the Google services Gradle plugin (it is not applied yet, so that builds do not depend on it):
     * `android/settings.gradle.kts`, inside `plugins { … }`: `id("com.google.gms.google-services") version "4.4.3" apply false`
     * `android/app/build.gradle.kts`, inside `plugins { … }`: `id("com.google.gms.google-services")`
   * iOS: download `GoogleService-Info.plist` for each app and add it to the Xcode **Runner** target (Xcode → drag into `Runner`, tick "Copy items" and the Runner target). The rider app already has an `ios/` project (bundle id `com.somba.sombaRider`, change it if the Firebase iOS app uses another one). The customer app has no `ios/` folder yet: run `flutter create --platforms=ios --org com.somba .` inside `mobile/` first.
   * Do not commit these files if the repository is public; they are not secrets, but they identify the project.

2. **Android: notification permission.** Already declared (`android.permission.POST_NOTIFICATIONS`); on Android 13+ the app asks at run time right after sign-in. Nothing to do except testing on an Android 13+ phone, and (optional) adding a default notification icon/colour with `<meta-data android:name="com.google.firebase.messaging.default_notification_icon" …/>`.

3. **iOS: capabilities.** In Xcode, Runner target → *Signing & Capabilities* → add **Push Notifications** and **Background Modes** (tick *Remote notifications*; for the rider app also *Location updates*, already in `Info.plist`). This creates `Runner.entitlements` with `aps-environment`. It needs a paid Apple Developer team and a provisioning profile with push enabled; it cannot work in the simulator for real pushes.

4. **iOS: APNs key.** Apple Developer → Certificates, IDs & Profiles → Keys → create a key with *Apple Push Notifications service (APNs)*, download the `.p8` once. Firebase console → Project settings → Cloud Messaging → *Apple app configuration* → upload the `.p8` with its Key ID and your Team ID. Without it Firebase cannot deliver to iPhones.

## Checking that it works

1. Build with the config files in place, sign in; accept the permission prompt.
2. The API logs nothing special, but `select * from device_tokens` (or the admin tools) shows a row with `app = customer | rider` and the right `platform`.
3. Trigger a notification (place an order, or an admin broadcast): with the app in the background the system shows it; with the app open the notification list updates by itself.
4. Sign out: the row disappears (`devices:unregister`).

## Known limits

* Push texts come from the API in English (notification title/body are stored once, not per language). The apps translate the in-app list for the common ones (`notification_text.dart`), but the system banner of a closed app shows the server's English text until the API localises pushes by the user's `locale`.
* The web builds do not use push.
* Not exercised on a device or with a real Firebase project; the Gradle plugin step and the iOS capabilities above have never been built here.
