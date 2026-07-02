# Somba&Teka — Rider App: Full Feature Guide (Screen by Screen, with details)

A granular walkthrough of every screen in the Flutter rider/courier app
(`rider-app/`): its purpose, every section, the exact on-screen texts/labels,
the mock data it shows, and what each control does. The app is a self-contained
prototype (mock data, no backend) whose entities/flows mirror the Somba&Teka
marketplace — the rider handles the **delivery / pickup / return** tasks that the
customer app (`mobile/`) and admin panel create.

---

## Global / cross-cutting

- **Bottom navigation** (floating white capsule with an animated expanding pill,
  royal-blue gradient on the selected tab): **Tasks · Navigate · Profile**
  (`lib/screens/rider_shell.dart`).
- **App flow** (`lib/main.dart`): **Splash** (~1.6 s) → **Sign in** →
  **Rider shell** (the three tabs). Logging out returns to the sign-in screen.
- **Languages:** English + French, toggled from the Profile tab (EN/FR). The
  app ships both `Locale('en')` and `Locale('fr')`; the toggle is a live
  `onLocaleChanged` at the app root.
- **Brand identity** (`lib/theme/app_theme.dart`): a **royal-blue** design
  system matching the Somba&Teka logo tile — primary `#1A3AA8`, dark `#0E1F5C`,
  and a `brandGradient` (`#3258D8 → #1A3AA8 → #0E1F5C`) used across headers,
  the splash, the selected nav pill and hero cards. Accent colours: **amber**
  (`#F59E0B`, cash/COD), **sky** (`#0EA5E9`, navigate/info), **red** (`#EF4444`,
  failed/return), **violet** (`#7C3AED`, pickup).
- **Typography:** **Plus Jakarta Sans** for display headings, **Inter** for body
  text — both bundled (`assets/fonts/`), no runtime font fetching.
- **Mock rider:** *Jean Mukendi*, id **RDR-001**, avatar “JM”, **4.9★ Top
  rider**, based in **Paris 2e**. Lifetime stats: **1,284 deliveries · 98%
  on-time · 14 months** with the fleet.
- **Task catalogue** (`lib/data/mock_tasks.dart`) — 4 seeded tasks, colour-coded
  by type (delivery = royal blue, pickup = violet, return = red):

  | # | ID | Type | Customer | Address | Dist | ETA | Items | Flag |
  |---|------|------|----------|---------|------|-----|-------|------|
  | 1 | TSK-8841 | Delivery | Marie Dubois | 8 Rue de la Paix, Paris 2e | 1.2 km | 8 min | 2 | Open box |
  | 2 | TSK-8842 | Pickup | Somba&Teka Warehouse | Zone Industrielle, Lyon | 3.6 km | 15 min | 6 | — |
  | 3 | TSK-8839 | Delivery | Jean Petit | 45 Champs-Élysées, Paris 8e | 2.4 km | 12 min | 1 | Open box |
  | 4 | TSK-8835 | Return | Sophie Laurent | Neuilly-sur-Seine | 5.1 km | 22 min | 1 | — |

  Each task carries an **id**, **type** (delivery/pickup/return with its own
  icon + colour), **customer**, **address**, **distanceKm**, **etaMin**,
  **items** count and an **openBox** flag.
- **Persistence:** none — this is a stateless prototype; toggles (on-duty,
  settings switches, OTP boxes) reset on restart.

---

## 1 · Onboarding & authentication  (`screens/more/rider_auth.dart`)

### 1.1 Splash — `SplashScreen`
- Full-screen royal-blue `brandGradient`; white rounded tile with the
  **scooter** monogram (`two_wheeler`).
- Title **“Somba&Teka”**, tagline **“Rider partner”**, white spinner.
- Auto-advances after ~1.6 s to the sign-in screen.

### 1.2 Sign in — `RiderLoginScreen`
- Gradient header: scooter tile, **“Welcome back”**, subtitle *“Sign in to start
  your shift”*.
- Fields: **Rider ID** (pre-filled `RDR-001`, badge icon), **Password** (hint
  *“Enter your password”*, obscured, lock icon).
- **Forgot password?** (right-aligned) → Reset flow.
- Primary **Sign in →** button (shows a spinner ~0.7 s, then enters the app).
- Footer note with a shield icon: *“Your account is created by the Somba&Teka
  fleet team.”* — riders don’t self-register (no create-account screen, unlike
  the customer app).

### 1.3 Forgot password — `ForgotPasswordScreen`
- App bar **“Reset password”**, back arrow.
- Lock-reset icon tile, **“Forgot your password?”**, *“Enter your Rider ID and
  we will send a reset code to your registered phone.”*
- **Rider ID** field (hint `RDR-001`).
- **Send reset code** → OTP screen.

### 1.4 OTP verification — `OtpScreen`
- App bar **“Verify code”**. **“Enter the 4-digit code”**, *“We sent a code to
  your phone ending •• 82.”*
- Four code boxes (all four pre-filled with a `•`, active blue outline).
- **Resend code** (refresh icon) re-fills the boxes.
- **Verify & continue** → returns to the sign-in screen (`popUntil` first route).

---

## 2 · Tasks (tab 1)

### 2.1 Tasks — `TasksScreen`
- **Gradient header**:
  - Rider avatar **“JM”** (white ring), name **“Jean Mukendi”**, **4.9 ·
    RDR-001** with a star.
  - **On-duty toggle** (top-right pill): **“On duty”** (white pill, blue dot) ↔
    **“Off”** (translucent) — animated, local state.
  - Stat strip: **N Active · 12 Done · 12.4 km** (Active = live task count).
- **Section header “Today’s route”** with an **Optimize** action → snackbar
  *“Route optimized — 3 stops reordered”*.
- **Task list** — one `SurfaceCard` per task (tap → Task detail):
  - Coloured type icon tile, **type pill** (Delivery/Pickup/Return), task **id**,
    customer name, and a circled **step number** (1–4) on the right.
  - **Address** row (pin icon, single line).
  - Meta row: **distance km · ETA min · N items**, plus an **“Open box”** pill
    (blue, box icon) when the task allows the customer to inspect.

---

## 3 · Task execution  (`screens/more/rider_more.dart`)

### 3.1 Task detail — `TaskDetailScreen`
- App bar = task **id** (e.g. **TSK-8841**), back arrow.
- **Summary card**: type icon, customer, **“<Type> · N items”**, distance pill.
- **Address card**: pin + address, a **call** button (snackbar *“Calling
  <customer>…”*) and a **chat** button (→ Chat screen with the customer).
- **Handover checklist** card (checkable rows, pre-set states):
  - *Verify customer identity* (done ✓).
  - *Open-box: let customer inspect* / *Confirm package sealed* (state depends on
    the task’s `openBox` flag).
  - *Capture proof of delivery* (pending).
- **Navigate** primary button → snackbar *“Opening turn-by-turn navigation…”*.
- Bottom action row: **Deliver** (→ Proof of delivery) and **Failed** (red
  outline → Report a problem).

### 3.2 Proof of delivery — `PodScreen`
- App bar **“Proof of delivery”**.
- **Photo of delivery** card: a dashed capture tile — camera icon + *“Tap to
  capture”*.
- **Signature** card: a signature pad with a pre-drawn sample stroke
  (custom-painted).
- **Delivery OTP verified** card: pin icon + a **4821** code pill.
- **Complete delivery** → returns to the Tasks tab (`popUntil` first route).

### 3.3 Failed delivery — `FailedDeliveryScreen`
- App bar **“Report a problem”**. **“Why did the delivery fail?”**
- Single-select reason cards: **Customer not available · Wrong / incomplete
  address · Customer refused delivery · Could not reach customer · Damaged
  package**.
- **Submit report** → returns to the Tasks tab.

### 3.4 Chat — `ChatScreen`
- App bar = the other party’s name (customer, or **“Fleet support”**).
- Seeded thread (rider messages in blue, right-aligned):
  *“Hi! I’m on my way with your order.”* → *“Great, thank you! I’m at the main
  gate.”* → *“Perfect, I’ll be there in about 5 minutes.”*
- Working composer (**“Message…”**) + send button; appends your message as a
  right-aligned bubble.

---

## 4 · Navigate (tab 2)

### 4.1 Navigate — `MapScreen`
- **Faux map backdrop**: a custom-painted street grid with building “blocks”,
  and a **route polyline** (solid royal-blue line over a translucent dashed
  underlay) tracing the optimized path.
- **Top bar**: an **“Optimized route”** pill (**3 stops · 12.4 km**) and a
  **recenter** button (my-location) → snackbar *“Centering on your location”*.
- **Route markers**: **“You”** (sky, two-wheeler icon) plus numbered stop pins
  **1** (blue) and **2** (violet).
- **Next-stop card** (bottom sheet-style):
  - **“Next stop”** pill + **“ETA 8 min”**.
  - Customer **Marie Dubois**, **8 Rue de la Paix, Paris 2e**, distance
    **1.2 km**.
  - **Start navigation** (filled) → snackbar *“Opening turn-by-turn
    navigation…”*; a **call** button → snackbar *“Calling Marie Dubois…”*.

---

## 5 · Profile (tab 3)  (`screens/profile_screen.dart`)

### 5.1 Profile — `ProfileScreen`
- **Gradient header**: avatar **“JM”**, **“Jean Mukendi”**, **RDR-001 · Paris
  2e**, a **“4.9 · Top rider”** pill, plus **settings** and **edit** round
  buttons (top-right). Stat strip: **1,284 Deliveries · 98% On-time · 14 mo With
  us**.
- **Duty status card**: an **On duty** switch — subtitle toggles between
  *“Receiving new tasks”* and *“Paused — no new tasks”*.
- **Menu card 1** (operations):
  - **Current batch** — *BAT-204 · 4 stops* → Batch overview.
  - **Zones & demand** — *Live demand heatmap* → Zones.
  - **Shift & attendance** — *Hours & clock-in log* → Shift.
  - **Task history** — *Past deliveries & pickups* → History.
  - **Notifications** — *Tasks & route updates* → Notifications.
- **Menu card 2** (account/vehicle):
  - **My vehicle** — *Details & maintenance* → Vehicle.
  - **Documents** — *Licence, ID & insurance* → Documents.
  - **Settings** — *Alerts & preferences* → Settings.
  - **Support** — *24/7 rider help* → Support.
- **Language card**: **Language** with an **EN / FR** segmented toggle (selected
  chip uses the brand gradient).
- **Log out** tile (red) → confirmation sheet **“Log out?”** / *“You will need to
  sign in again to receive tasks.”* with **Log out** / **Cancel**.

### 5.2 Edit profile — `RiderEditProfileScreen`
- App bar **“Edit profile”**. Avatar “JM” with a camera badge.
- Fields (hints shown): **Full name** (Jean Mukendi), **Phone**
  (+243 810 000 082), **Email** (jean.m@somba.cd), **Emergency contact**
  (+243 810 000 111).
- **Save changes** → snackbar *“Profile updated”* → back.

### 5.3 Settings — `RiderSettingsScreen`
- **Notifications** group: **Push notifications** (*New tasks & route alerts*,
  on) · **Sound alerts** (*Play a sound on new task*, on).
- **Delivery** group: **Auto-accept tasks** (*Automatically accept nearby tasks*,
  off) · **Voice navigation** (*Spoken turn-by-turn guidance*, on).
- **Account** group: **Change password** (→ Forgot-password flow) · **About
  Somba&Teka** (→ About).

---

## 6 · Operations  (`screens/more/rider_more2.dart`)

### 6.1 Batch overview — `BatchOverviewScreen`
- App bar **“Batch BAT-204”**.
- Gradient stat card: **N Stops · 12.4 km · N Items** (items = sum across the
  batch’s tasks).
- **“Stops in order”** — the four tasks as a numbered sequence; the first is
  marked **done** (check + strike-through), the rest are numbered with an item
  pill.
- **Start batch** → snackbar *“Batch BAT-204 started”* and pops back.

### 6.2 Zones & demand — `ZoneScreen`
- App bar **“Zones & demand”**.
- **Current zone card**: **“Current zone · Gombe”**, *“You are online here”*,
  **Online** pill.
- **“Live demand”** — per-zone cards with a coloured status and a demand bar:
  - **Gombe** — *Very high demand* (95%, red).
  - **Limete** — *High demand* (70%, amber).
  - **Ngaliema** — *Medium demand* (45%, sky).
  - **Kalamu** — *Low demand* (20%, blue).
- **Move to high-demand zone** → snackbar *“Rerouting you toward Gombe…”*.

---

## 7 · History & notifications  (`screens/more/rider_more.dart`)

### 7.1 Task history — `RiderHistoryScreen`
- App bar **“Task history”**. Completed tasks with an amount:

  | Task | Customer | Result | Amount |
  |------|----------|--------|--------|
  | TSK-8830 | Marie Dubois | Delivered | $149 |
  | TSK-8829 | Warehouse pickup | Completed | — |
  | TSK-8825 | Paul Kabeya | Failed · absent | $0 |
  | TSK-8820 | Sophie Laurent | Delivered | $62 |

- Failed rows use a red cancel icon; delivered/completed use the blue check.

### 7.2 Notifications — `RiderNotificationsScreen`
- App bar **“Notifications”**. Items (unread ones carry a blue dot):
  - **New task assigned** — *TSK-8841 · Gombe · 2 items* · 1m (unread).
  - **Route re-optimized** — *Your next 3 stops were reordered.* · 12m (unread).
  - **Pickup ready** — *Warehouse batch BAT-204 is ready.* · 1h.
  - **New 5★ rating** — *Marie rated your delivery 5 stars.* · 3h.

---

## 8 · Shift, vehicle & documents  (`screens/more/rider_more3.dart`)

### 8.1 Shift & attendance — `RiderShiftScreen`
- App bar **“Shift & attendance”**.
- Gradient stat card: **4 Days · 34h This week · 98% On-time**.
- **Current shift** card: **“Started today at 08:00”**, **Active** pill.
- **“This week”** — per-day clock in/out log: Mon (08:02–17:34), Tue
  (07:58–17:40), Wed (08:10–18:02), Thu (08:00–17:20), Fri (*No shift*).
- **End shift** → snackbar *“Shift ended — have a good rest!”* and pops back.

### 8.2 My vehicle — `RiderVehicleScreen`
- App bar **“My vehicle”**.
- Gradient hero: **“Yamaha NMAX”**, *“Scooter · 125cc”*, plate **KN 4821 A**.
- **Details** card: Plate **KN 4821 A** · Colour **Matte black** · Odometer
  **18,240 km** · Fuel **Petrol**.
- **Maintenance** card: Last service **12 May 2026** · Next service **Due in
  640 km**.
- **Report an issue** → snackbar *“Issue reported to the fleet team”*.

### 8.3 Documents — `RiderDocumentsScreen`
- App bar **“Documents”**. Compliance documents with a status pill:
  - **Driver licence** — *Valid until Mar 2028* — **Valid**.
  - **National ID** — *Verified* — **Valid**.
  - **Vehicle insurance** — *Valid until Sep 2026* — **Valid**.
  - **Roadworthiness** — *Renewal due in 21 days* — **Renew** (amber warning).
- **Upload a document** → snackbar *“Opening document upload…”*.

---

## 9 · Support & about  (`screens/more/rider_more3.dart`)

### 9.1 Support — `RiderSupportScreen`
- App bar **“Support”**. Gradient banner **“24/7 rider help”** / *“Fleet support
  answers in ~2 min”*.
- Two action tiles: **Call fleet** (*Hotline* → snackbar *“Calling fleet
  hotline…”*) and **Live chat** (*Message us* → Chat with **“Fleet support”**).
- **Common questions** (expandable FAQ):
  - *A customer is not answering* → *“Wait 5 minutes, call twice, then report the
    task as failed with the right reason.”*
  - *The app shows a wrong address* → *“Open the task, tap the address to
    re-locate, or call the customer to confirm.”*
  - *I can’t start my shift* → *“Make sure you are On duty in your profile and
    inside your assigned zone.”*
  - *How do I report a damaged item?* → *“Use ‘Failed / report a problem’ on the
    task and select ‘Damaged package’.”*

### 9.2 About — `RiderAboutScreen`
- App bar **“About”**. Gradient scooter tile, **“Somba&Teka Rider”**, **Version
  1.0.0**.
- Links: **Terms of service · Privacy policy · Rate the app**.
- Footer: *“© 2026 Somba&Teka. All rights reserved.”*

---

## Marketplace compatibility (summary)
- **Task types** (`delivery / pickup / return`) map to the fulfilment actions the
  customer app and admin panel generate — a customer order becomes a rider
  **delivery**, a warehouse restock a **pickup**, and a customer return a rider
  **return** task.
- **Proof of delivery** (photo + signature + OTP) and **failed-delivery reasons**
  mirror the states the order/return records expect.
- **Customer names** (Marie Dubois, Jean Petit, Sophie Laurent) and order-style
  ids echo the customer app’s seeded data, so a rider task lines up with the
  matching customer order.
- The app is intentionally **stateless mock data, no backend** — every action is
  a snackbar or an in-memory toggle.

## Related
- `README.md` — build, run, and the Android APK CI/CD workflow
  (`.github/workflows/rider-app-apk.yml`).
- `lib/gallery.dart` — a query-param screen gallery (`?s=<key>`) used to render
  each screen in isolation for screenshots.
- Screenshots: `docs/screenshots/` (per-screen `flows/` + `gallery.png` +
  `flows-contact-sheet.png`).
