# Somba&Teka — Rider App (Flutter)

The rider/courier app for the Somba&Teka marketplace: manage delivery, pickup and
return tasks, collect cash on delivery, navigate an optimized route, and track
earnings.

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

Requires Flutter **3.35.7**.

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
