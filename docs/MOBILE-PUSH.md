# Push notifications (phones and web portals)

Every notice the platform sends (an order update, a new delivery for a rider, a return on a seller's item…) is saved, shown live in the open app or tab, and pushed through Firebase Cloud Messaging (FCM) to:

* the **customer app** (`mobile/`) and the **rider app** (`rider-app/`);
* the **seller, admin and warehouse portals** in the browser (web push), once someone clicks *Turn on alerts* under the bell.

Everything is wired and tested, and **stays silent until the Firebase keys are supplied**. Without keys nothing breaks: no prompt, no error. `devices:register` answers `pushEnabled: false`, and in-app notices still arrive over the socket. The portals also raise a desktop alert while a tab is open in the background, with no Firebase at all.

## What a push carries

Every push has the same data, so a tap opens the right screen:

| Field | Meaning |
|---|---|
| `type` | `order`, `delivery`, `payment`, `return`, `dispute`, `exchange`, `replacement`, `support`, `payout`, `moderation`, `campaign`, `task` (rider), `marketing`, `system` |
| `entityId` | The order, return, ticket, task… it is about |
| `notificationId` | The saved notice (the app marks it read on tap) |
| `link` | The web page it opens for the recipient's portal, e.g. `/seller/returns/{id}`, `/rider/tasks/{id}` (built by `api/src/notifications/links.ts`) |
| `orderId`, `view` | Rider tasks only: `view` is `available` (a new delivery) or `active` (assigned to you) |

Android pushes use the channel `somba_default` (created by each app's `MainActivity`), and iOS pushes play the default sound.

**Who gets what.**

* A notice to one person goes to all of their devices, unless they turned push off in Settings (`prefs.push = false`); they still see it in the app.
* A notice to a whole role (for example every support agent) goes to that role's **web** devices.
* Phones only get role-wide pushes for marketing broadcasts and rider tasks, so nobody's phone buzzes for every order.
* A new delivery goes to the riders of the warehouse that serves its zone (see `WAREHOUSE-ZONES.md`).

## Where each tap goes

**Customer app** (`mobile/lib/screens/notice_router.dart`, the same for a push tap and the in-app list):

| Type | Opens |
|---|---|
| `order` | Order detail |
| `delivery` | Order tracking |
| `payment` | The order, or the wallet for a top-up |
| `return`, `dispute` | Return status (the returns list if it can't be found) |
| `support` | The ticket |
| `exchange`, `replacement` | Returns and refunds |
| anything else | Notifications |

**Rider app** (`rider-app/lib/services/rider_focus.dart`): `task` opens Deliveries → *Available* (a new one) or *Active* (yours); `delivery`/`order` opens *Active*; anything else opens Profile, where the notifications are.

**Portals:** the bell, the notification pages and desktop alerts follow `link`.

A tap that launched the app, or arrived before sign-in, is held and opened once the user is signed in and the data has loaded. A push that arrives while the app is open shows a banner with **Open**.

## Firebase project status (23 October 2026)

Project **SOMBA ET TEKA** (`somba-et-teka`, number 30958127282) has five apps registered:

| App | Firebase app ID | Config in the repo (git-ignored) |
|---|---|---|
| Customer · Android `com.somba.lipcart` | `1:30958127282:android:03d747580eff07447ae1ab` | `mobile/android/app/google-services.json` |
| Customer · iOS `com.somba.sombaCustomer` | `1:30958127282:ios:99c4b98305ef690e7ae1ab` | `mobile/ios/Runner/GoogleService-Info.plist` |
| Rider · Android `com.somba.somba_rider` | `1:30958127282:android:a46529d15e1d7a407ae1ab` | `rider-app/android/app/google-services.json` |
| Rider · iOS `com.somba.sombaRider` | `1:30958127282:ios:6a83654c548d49777ae1ab` | `rider-app/ios/Runner/GoogleService-Info.plist` |
| Web portals ("Somba portals") | `1:30958127282:web:a9cd90ad8b03dd297ae1ab` | `web/.env.local` (`NEXT_PUBLIC_FIREBASE_*`) |

To download the files again on another machine (after `firebase login`): `firebase apps:sdkconfig ANDROID <app id> --project somba-et-teka -o <path>` (or `IOS`, `WEB`).

Still to do, all in the Firebase / Apple consoles:

1. **Server key.**
   1. Firebase console → Project settings → Service accounts → *Generate new private key*.
   2. Run `cd api && node scripts/set-firebase-key.cjs ~/Downloads/<the-file>.json`. It checks that the key belongs to `somba-et-teka` and writes it to `api/.env`.
   3. Restart the API and delete the downloaded file.
2. ~~Web push key (VAPID)~~ **Done:** generated in Cloud Messaging → Web Push certificates; its public key is `NEXT_PUBLIC_FIREBASE_VAPID_KEY` in `web/.env.local`, and the web app is rebuilt with it.
3. **APNs key** (iPhones), see row 3 below.

## Keys to supply

| # | Where | What | How |
|---|---|---|---|
| 1 | API server | `FIREBASE_SERVICE_ACCOUNT_JSON` (or `GOOGLE_APPLICATION_CREDENTIALS`) | Firebase console → Project settings → Service accounts → *Generate new private key*. Paste the JSON on one line. Optional: `WEB_URL=https://…` so web pushes open the portal on click. |
| 2 | Customer and rider apps | Firebase app settings | **Either** pass them at build time: `--dart-define=FIREBASE_API_KEY=… --dart-define=FIREBASE_PROJECT_ID=… --dart-define=FIREBASE_SENDER_ID=… --dart-define=FIREBASE_ANDROID_APP_ID=… --dart-define=FIREBASE_IOS_APP_ID=…` (and optionally `FIREBASE_IOS_BUNDLE_ID`). **Or** drop `google-services.json` into `android/app/` and `GoogleService-Info.plist` into `ios/Runner/`: the Gradle plugin and an Xcode build step pick them up automatically when the files are there. Both files are git-ignored. |
| 3 | Apple | APNs key | Apple Developer → Keys → new key with *Apple Push Notifications service*, download the `.p8`. Firebase console → Project settings → Cloud Messaging → Apple app configuration → upload it with the Key ID and Team ID. |
| 4 | Web portals | `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | Firebase console → add a **Web app** for the values; Cloud Messaging → *Web Push certificates* → generate the key pair for the VAPID key. Set them in `web/.env.local` (see `web/.env.example`) and rebuild the web app. Web push needs HTTPS (localhost is allowed). |

App ids in Firebase: Android `com.somba.lipcart` (customer), `com.somba.somba_rider` (rider); iOS `com.somba.sombaCustomer`, `com.somba.sombaRider`.

## Already done in the projects

* **Android (both apps):**
  * `POST_NOTIFICATIONS` permission;
  * channel `somba_default`;
  * monochrome status-bar icon `ic_stat_notify` with the brand tint, set as the FCM default along with the channel;
  * Google Services plugin applied only when `google-services.json` exists, so CI builds without it.
* **iOS (both apps):**
  * `Runner.entitlements` with `aps-environment`;
  * `UIBackgroundModes: remote-notification`;
  * build step that copies `GoogleService-Info.plist` when present.
  * The app shows its own banner in the foreground; the system only plays the sound.
  * Push on a real iPhone needs a paid Apple team whose profile includes Push Notifications. To run on a device with a free personal team, temporarily remove `CODE_SIGN_ENTITLEMENTS` from the Runner target.
* **Web:**
  * `firebase` 12.19.0;
  * service worker `web/public/firebase-messaging-sw.js`, which reads its config from its URL and opens `link` on click;
  * `src/lib/web-push.ts` registers the token as a `web` device and unregisters it on sign-out.

## Checking it works (the day the keys land)

1. Set key 1 and restart the API. Its log says push is enabled.
2. Build an app with key 2 (and key 3 for iPhone), sign in, and accept the prompt.
   * `device_tokens` gets a row (`app = customer | rider | web`).
3. Send a test to yourself (the socket event **`devices:test`**): it saves a "Test notification" for your account and pushes it to all your devices.
   * In a portal: bell → **Send a test**.
   * For a phone account: `cd api && API_URL=https://… node test/push-test.cjs you@example.com 'password'`. It prints whether push is on and how many devices the account has.
4. Put the app in the background and trigger a real notice (place an order, open a return, build a batch for a rider). The banner appears; tapping it opens the order, return or delivery.
5. Portals: click the bell → *Turn on alerts*, close the tab, trigger a notice. The browser shows it, and clicking opens the page.
6. Sign out: the device row disappears (`devices:unregister`).

## Known limits

* Push texts come from the API in English. The apps translate the common ones in the in-app list and banner (`notification_text.dart`), but a closed app's system banner shows the English text.
* Notices sent to a whole role are one shared row. Each browser remembers which ones its user has read (local storage), so a reload doesn't bring them back as unread.
