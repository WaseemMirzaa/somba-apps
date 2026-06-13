# Somba&Teka — Mobile Apps: Features & Flows Plan

Frontend-only build plan for the two Flutter apps (Customer + Rider), derived from the
Scope & Functional Documentation (updated, incl. client answers of 09 June 2026) and the
existing web panels / shared screen registry (`shared/screens/registry.ts`).

**Stack:** Flutter (Android & iOS) · GetX (state, routing, DI, i18n) · Google Maps
(address pin, pickup/delivery routes, rider navigation) · Mocked data & flows (no backend).

**Languages:** French (default) + English, switchable at runtime from onboarding and settings.
**Currencies:** CDF + USD with a runtime switcher (mock FX rate).
**Cities:** Kinshasa & Lubumbashi (intra-city only at launch; zones = communes).

Decisions carried from client clarifications:

| Clarification | Impact on mobile apps |
|---|---|
| No cash on delivery | Payment methods: card (Stripe), Airtel Money, Orange Money, M-Pesa. No COD screens. |
| Riders are employed, not paid per task | **No earnings module** in the Rider app. |
| Proof = barcode scan + OTP | Pickup & delivery proof screens use scan + OTP (photo as fallback for failed delivery evidence). |
| Customer sees status timeline | Order tracking = timeline first; a per-parcel map (CF-24, Δ10 parity) shows route progress. |
| Wallet / store credit | Customer wallet with refund credits and transactions. |
| Map pin + free text addressing | Address form = Google Map pin + free-text note + commune selector. |
| Returns: 7 days, some categories excluded | Return request flow validates window & category eligibility (mocked). |
| Manual rider dispatch | Rider app receives assigned tasks; no task bidding/acceptance marketplace. |
| Product approval required | No impact on customer app (only approved products are mocked). |

---

## 1. Customer App (`mobile/` — package `somba_teka`)

Five-tab shell: **Home · Categories · Cart · Orders · Account**. Guests can browse;
sign-in is requested at checkout / wishlist / orders.

### 1.1 Screen list

| ID | Screen | GetX route | Notes |
|----|--------|-----------|-------|
| CF-01 | Splash / Bootstrap | `/splash` | Brand splash, loads mock session |
| — | Language & Onboarding | `/onboarding` | FR/EN choice + 3 intro slides |
| CF-14 | Login | `/login` | Phone + password |
| CF-13 | Register | `/register` | Phone-first sign-up |
| CF-15 | OTP Verification | `/otp` | SMS OTP (mock code 123456) |
| CF-17 | Forgot Password | `/forgot` | Phone → OTP → reset |
| CF-18 | Reset Password | `/reset` | New password |
| CF-02 | Home Feed | `/home` (tab) | Banners, category shortcuts, flash deals, new arrivals, recommended, featured stores, recently viewed |
| CF-03 | Category Tree | `/categories` (tab) | 2-level taxonomy |
| CF-04 | Product List (PLP) | `/products` | Filters: price, rating, brand, discount %, availability; sort |
| CF-05/06 | Search & Results | `/search` | Suggestions, recent searches, results grid |
| CF-07 | Store Front | `/store/:id` | Seller banner, logo, rating, product grid |
| CF-08 | Product Detail (PDP) | `/product/:id` | Gallery, variants, price CDF/USD, stock, delivery estimate by commune, seller link, reviews, share |
| CF-27 | Review Compose | `/review-compose` | Rating + text (after delivery) |
| CF-09 | Cart | `/cart` (tab) | Multi-seller cart grouped per seller, coupon entry |
| CF-10 | Checkout | `/checkout` | Address select, per-seller order split review |
| CF-21 | Address Form | `/address-form` | **Google Map pin** + free text + commune |
| CF-20 | Address Book | `/addresses` | Saved addresses |
| CF-11 | Payment | `/payment` | Card / Airtel / Orange / M-Pesa / Wallet, success & failure + retry |
| CF-12 | Order Confirmation | `/order-confirmed` | Per-seller order numbers |
| CF-22 | Order History | `/orders` (tab) | Tabs: ongoing / delivered / cancelled & returns |
| CF-23 | Order Detail | `/order/:id` | Items, totals, status, actions (cancel, reorder, return, review) |
| CF-24 | Order Tracking | `/order/:id/tracking` | 9-stage status timeline + **route map** |
| CF-25 | Return Request | `/return-request` | Reason, photos, eligibility check |
| CF-26 | Return Status | `/return/:id` | Return timeline, refund destination |
| CF-28 | Wishlist | `/wishlist` | Save / move to cart |
| CF-29 | Notification Centre | `/notifications` | Order, promo, system |
| CF-31 | Help & Support | `/help` | FAQ, contact, legal pages, account deletion |
| CF-32 | Somba Wallet | `/wallet` | Balance (CDF/USD), store-credit refunds, transactions |
| CF-36 | Flash Deals Hub | `/deals` | Time-boxed deals rail |
| CF-19 | Profile & Settings | `/account` (tab) | Profile, language, currency, addresses, notifications prefs |

### 1.2 Primary flows

1. **Browse & purchase (guest → buyer)**
   `Splash → Onboarding (language) → Home → Search / Category / Store → Product Detail
   → Add to Cart → Cart (per-seller groups, coupon) → [Login + OTP if guest] → Checkout
   (address with map pin) → Payment (card / mobile money / wallet) → Success →
   Order Confirmation → Track Order`.
   Payment failure path: `Payment → Failure sheet → Retry / change method`.
2. **Order tracking** — `Orders → Order Detail → Tracking`: timeline through
   Confirmed → Preparing → Ready for Pickup → Picked Up → At Warehouse → Awaiting
   Dispatch → Out for Delivery → Delivered → Completed, plus map of parcel journey.
3. **Cancel / reorder** — cancel while Confirmed/Preparing; reorder after Delivered.
4. **Return & refund** — `Order Detail (Delivered, ≤7 days, returnable category) →
   Return Request (reason + photos) → Return Status → Refund to wallet or original method`.
5. **Wishlist** — heart on PDP/cards → `Wishlist → Move to cart`.
6. **Wallet** — `Account → Wallet`: balance, credit from refunds, use at payment step.
7. **Account & localization** — profile edit, address book (map pin), language FR/EN,
   currency CDF/USD, notification preferences, help & legal.

### 1.3 Order status model (shared with rider app)

`confirmed → preparing → readyForPickup → pickedUp → atWarehouse → awaitingDispatch →
outForDelivery → delivered → completed`
Exceptions: `cancelled, deliveryFailed, returnRequested, returned, refunded`.

---

## 2. Rider App (`rider-app/` — package `somba_rider`)

One app for **pickups** (seller → warehouse) and **deliveries** (warehouse → customer).
Accounts are created by admins; manual dispatch — tasks appear pre-assigned.
No earnings module (riders are salaried).

### 2.1 Screen list

| ID | Screen | GetX route | Notes |
|----|--------|-----------|-------|
| RF-01 | Splash | `/splash` | |
| — | Login | `/login` | Admin-provisioned account |
| RF-02 | First Password Set | `/first-password` | Forced on first login |
| — | KYC Submission | `/kyc` | Documents, photo, vehicle (status: pending/approved) |
| RF-03 | Task Feed (Home) | `/tasks` (tab) | Online/offline toggle; unified pickup + delivery list with type, address, distance |
| RF-04 | Task Detail — Pickup | `/task/:id` | Seller info, parcels, **map route to seller** |
| RF-05 | Pickup Proof | `/task/:id/pickup-proof` | Barcode scan + seller OTP |
| RF-06 | Warehouse Check-in | `/task/:id/warehouse` | Map route to warehouse, parcel handover confirm |
| RF-07 | Batch Overview | `/batch/:id` | Delivery batch with ordered stop list + **full-route map** |
| RF-08 | Stop Detail — Delivery | `/stop/:id` | Customer, address, parcel; navigate |
| RF-09 | Proof of Delivery | `/stop/:id/pod` | Scan + customer OTP |
| RF-10 | Failed Delivery | `/stop/:id/fail` | Reason + photo evidence |
| RF-12 | Map / Navigation | `/map` (tab) | Active task route, current position (mock GPS), stops |
| RF-13 | Task History | `/history` (tab) | Completed pickups/deliveries by day |
| RF-14 | Notification Centre | `/notifications` | New task, batch, announcements |
| — | Profile & Support | `/profile` (tab) | Rider details, rating, language FR/EN, support contact |

### 2.2 Primary flows

1. **Availability** — `Login → [First password] → [KYC pending screen] → Task Feed →
   Go Online` (offline riders see no new tasks).
2. **Pickup flow** — `Task Feed → Pickup Task → Map route to seller → Arrive →
   Scan parcel barcode + enter seller OTP → Picked up → Route to warehouse →
   Warehouse check-in → Task closed`.
3. **Delivery flow** — `Task Feed → Batch → Ordered stop list + route map →
   Navigate to stop → Proof of delivery (scan + customer OTP) → next stop →
   … → Batch complete`.
   Failure path: `Stop → Failed Delivery (reason + photo) → parcel returns to warehouse`.
4. **History & profile** — daily/weekly completed tasks; profile, rating, support.

---

## 3. Cross-cutting frontend architecture

- **State:** GetX controllers per module; reactive `Rx` stores for cart, session,
  wishlist, wallet, tasks; `Get.put`/bindings per route.
- **Routing:** `GetPage` tables mirroring the registry routes above.
- **i18n:** GetX `Translations` with full `en` + `fr` keys; `Get.updateLocale` switcher.
- **Currency:** `CurrencyService` (Rx) formatting CDF/USD with mock rate (1 USD = 2,800 CDF).
- **Theme:** brand identity from web panels — primary blue `#1A3AA8`, red `#E11428`,
  white surfaces; Material 3.
- **Maps:** `google_maps_flutter`; mock coordinates around Kinshasa (communes) and
  Lubumbashi; polylines drawn from mocked route points (no Directions API needed yet).
- **Mock layer:** `data/mock/` repositories returning seeded models with simulated
  latency; all flows (auth OTP, payment, order progression, rider task progression)
  fully navigable without a backend.
- **Backend later:** repositories are interfaces — REST implementations will replace
  mocks in Milestones 2–4 without touching the UI.
