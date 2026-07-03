# Somba&Teka Rider — Screenshots

Screen-by-screen captures of the **Somba&Teka Rider** app (Flutter, mobile
390×844 @2×), in both **English** and **French**. The app ships fully bilingual:
every label, button, empty-state, snackbar and mocked flow value is localized,
and riders switch language live from **Profile → Language** (EN / FR).

| Language | Contact sheet | Individual screens |
| --- | --- | --- |
| English | [contact-sheet-en.png](./contact-sheet-en.png) | [`flows/`](./flows) |
| Français | [contact-sheet-fr.png](./contact-sheet-fr.png) | [`flows-fr/`](./flows-fr) |

Each screen is captured at the same key in both languages, so `flows/05-tasks.png`
and `flows-fr/05-tasks.png` are the same screen in EN and FR respectively.

---

## 🎬 Complete flow video

A walkthrough that steps through **all 26 rider screens**, one by one, in the
order a rider moves through the app — sign-in, tasks & route, the three task
types (delivery / warehouse pickup / zone transfer), batch scan, proof of
delivery, support, documents, vehicle, shift & attendance and settings.

<video src="https://raw.githubusercontent.com/WaseemMirzaa/somba-apps/claude/customer-app-cicd-ui-xjwzda/rider-app/docs/screenshots/rider-flow.webm" controls muted width="320"></video>

▶ **[Play / download the flow video (rider-flow.webm)](rider-flow.webm)** — if the
inline player doesn't load in your Markdown viewer, open the file link (GitHub
shows a built-in player). After the PR merges, replace the branch name in the URL
with `main`.

---

## Flow catalogue

The table lists every screen with its English and French capture side by side.

| # | Screen | English | Français |
| --- | --- | --- | --- |
| 01 | Splash | ![](./flows/01-splash.png) | ![](./flows-fr/01-splash.png) |
| 02 | Sign in | ![](./flows/02-login.png) | ![](./flows-fr/02-login.png) |
| 03 | Forgot password | ![](./flows/03-forgot-password.png) | ![](./flows-fr/03-forgot-password.png) |
| 04 | OTP verification | ![](./flows/04-otp-verify.png) | ![](./flows-fr/04-otp-verify.png) |
| 05 | Tasks (today's route) | ![](./flows/05-tasks.png) | ![](./flows-fr/05-tasks.png) |
| 06 | Navigate (map) | ![](./flows/06-navigate.png) | ![](./flows-fr/06-navigate.png) |
| 07 | Profile | ![](./flows/07-profile.png) | ![](./flows-fr/07-profile.png) |
| 08 | Task — delivery from warehouse | ![](./flows/08-task-delivery.png) | ![](./flows-fr/08-task-delivery.png) |
| 09 | Task — pickup from warehouse | ![](./flows/09-task-pickup.png) | ![](./flows-fr/09-task-pickup.png) |
| 10 | Task — zone-to-zone transfer | ![](./flows/10-task-zone-transfer.png) | ![](./flows-fr/10-task-zone-transfer.png) |
| 11 | Batch scan | ![](./flows/11-batch-scan.png) | ![](./flows-fr/11-batch-scan.png) |
| 12 | Proof of delivery (photo + signature + OTP) | ![](./flows/12-proof-of-delivery.png) | ![](./flows-fr/12-proof-of-delivery.png) |
| 13 | Failed delivery | ![](./flows/13-failed-delivery.png) | ![](./flows-fr/13-failed-delivery.png) |
| 14 | New support ticket | ![](./flows/14-new-ticket.png) | ![](./flows-fr/14-new-ticket.png) |
| 15 | Support | ![](./flows/15-support.png) | ![](./flows-fr/15-support.png) |
| 16 | Chat (with attachments) | ![](./flows/16-chat.png) | ![](./flows-fr/16-chat.png) |
| 17 | Task history | ![](./flows/17-history.png) | ![](./flows-fr/17-history.png) |
| 18 | Notifications | ![](./flows/18-notifications.png) | ![](./flows-fr/18-notifications.png) |
| 19 | Batch overview | ![](./flows/19-batch-overview.png) | ![](./flows-fr/19-batch-overview.png) |
| 20 | Zones & demand | ![](./flows/20-zones-demand.png) | ![](./flows-fr/20-zones-demand.png) |
| 21 | Documents | ![](./flows/21-documents.png) | ![](./flows-fr/21-documents.png) |
| 22 | My vehicle | ![](./flows/22-vehicle.png) | ![](./flows-fr/22-vehicle.png) |
| 23 | Shift & attendance | ![](./flows/23-shift-attendance.png) | ![](./flows-fr/23-shift-attendance.png) |
| 24 | Settings | ![](./flows/24-settings.png) | ![](./flows-fr/24-settings.png) |
| 25 | Edit profile | ![](./flows/25-edit-profile.png) | ![](./flows-fr/25-edit-profile.png) |
| 26 | About | ![](./flows/26-about.png) | ![](./flows-fr/26-about.png) |

---

## Localization notes

- **Coverage:** all rider screens are wrapped with the `tr(context, …)` helper
  (`lib/l10n/strings.dart`); French strings live in `lib/l10n/fr_map.dart`.
  Missing keys degrade gracefully to English rather than showing blanks.
- **Mocked flow & data** — task nature banners, checklists, statuses, activity
  feed, notifications, documents, shift log and support content are all
  localized, so the French deck reads as a complete French experience.
- **Proper nouns kept as-is:** customer names, rider name, vehicle model, plate,
  IDs, phone numbers and email are intentionally not translated.
- **Auth backgrounds** were refreshed to a more premium look — a deep royal
  gradient with a warm top halo, layered soft blobs, a glow ring behind the
  logo tile and an elevated frosted-glass card.

_Regenerate: build the gallery (`flutter build web -t lib/gallery.dart --release`)
and run the bilingual Playwright capture harness in the project scratchpad
(`?s=<key>` for EN, `?s=<key>&lang=fr` for FR)._
