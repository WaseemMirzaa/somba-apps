# Position sharing in the background (rider app)

Decision (round 2, workstream E): **the rider app does not request `ACCESS_BACKGROUND_LOCATION` on Android, nor "Always"
on iOS.** "While using the app" is enough.

## Why

The position is shared only while a task is `in_transit`, and that always starts from a rider's tap on the card
("On the way to the customer / the warehouse", or "On the road" for a transfer run), so the app is in front when it starts.

* **Android.** `geolocator` starts a foreground service of type `location` with an ongoing notification
  (`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `WAKE_LOCK` are in the manifest; the plugin declares the service with
  `foregroundServiceType="location"`). A foreground service that was started while the app was visible keeps its location
  access when the screen turns off or the rider switches app, with only `ACCESS_FINE_LOCATION`. This is the
  "while-in-use" rule of Android 11 to 14: the restriction only bites a service started from the background, and this one
  never is. `ACCESS_BACKGROUND_LOCATION` would add a second permission screen, a Play Console declaration and a review for
  nothing.
* **iOS.** `UIBackgroundModes: location` plus `allowBackgroundLocationUpdates` keeps a stream that started in the foreground
  alive with the blue "location in use" indicator, under "While Using the App". "Always" is only needed to start tracking
  from the background (for example a geofence wake-up), which the app never does.

When this would have to change: the app would have to start sharing while it is in the background (for example from a push
or a geofence). Then Android needs `ACCESS_BACKGROUND_LOCATION` (a second, separate request, and the Play declaration) and
iOS needs "Always".

## What the rider sees

1. First set-off of the install: a full screen explains why the position is shared, that it keeps working with the screen
   off, when it stops, and which answer to give on the phone's prompt ("While using the app"; "All the time" is not needed).
   Skipped when location is already allowed. `lib/screens/location_access_screen.dart`.
2. **Allow location** raises the phone's own prompt. **Not now** carries on without it and the phone does not ask again on
   that ride.
3. When location is refused for good, or the phone's GPS is off, the same screen becomes "Location is turned off" with an
   **Open settings** button (`Geolocator.openAppSettings` / `openLocationSettings`). Coming back from the settings is
   noticed (app resumed) and sharing starts without another tap.
4. On the task card, while on the road: "Sharing your live location ..." or the reason it is not, with **Open settings**.
5. Android 13+: `POST_NOTIFICATIONS` is declared. If the rider refuses notifications the service still runs; only its
   notification is hidden from the shade.

## Known limits

* Android "Only this time" gives a permission that the phone takes back after the app has been away for a while; the
  foreground service is what keeps it alive on a ride. A rider who chose it will be asked again at the next set-off.
* Battery savers of some Android makers (Xiaomi, Huawei, Samsung "sleeping apps") can still kill the service. The rider
  has to exclude the app from battery optimisation; this cannot be done from the app.
* Verified on an emulator and a simulator with scripted positions only. A real Android phone and a real iPhone are still to
  be tried before launch.
