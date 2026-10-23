# Customer app — gap analysis vs. leading marketplace apps

Scope: the Flutter customer app (`mobile/`), compared feature-by-feature with **Jumia** (closest peer: Africa,
mobile money, pickup stations), **Amazon** and **Flipkart**, focused on **cart**, **checkout & orders** and
**location & addresses**. Based on the code as of 2026-10-22 (paths relative to `mobile/lib`).

> **Status (2026-10-22, end of day).** Done and recorded (`recordings/new-features/`): B1–B5; address edit,
> set-default, landmark, phone check, zone matched from the address; size/colour variants (web + app, carried
> to cart, order, seller, admin, receipt); cart saved to the account (synced web ↔ app); save for later,
> remove + undo, low-stock and price-change notices; delivery time set by the seller per product, with the
> estimated delivery date shown to the shopper (no date choice) and to seller, admin and rider;
> server-side search with typo tolerance; phone-code login; call the rider (shared only while shipped / out for
> delivery); buy again, receipt, replace/exchange, review prompt; seller logo/banner/description in the app;
> rider navigation to the pin (or the address without the landmark). Left out by decision: **cash on
> delivery** and **pickup stations**. Still open: live rider map needs a Google Maps key; the P2 rows below.
> The tables keep the original "before" assessment.

Priority: **P0** blocks or breaks a core flow today · **P1** expected by shoppers of any major marketplace ·
**P2** differentiator / nice to have.

---

## 0. Bugs found while comparing (fix first)

| # | Problem | Where | Effect |
|---|---------|-------|--------|
| B1 | "Place order" returns silently when the mobile-money number is empty/invalid; the error is shown far up the list, nothing near the button | `screens/checkout_screen.dart:97-100` | Shopper taps Place order and "nothing happens" (the bug seen on the simulator) |
| B2 | The zone shown is the first zone by default, but the order sends `shop.selectedZoneId`, which is `null` until the shopper taps a zone | `checkout_screen.dart:114`, `util/format.dart:42-46` | Server refuses: "Choose a valid delivery zone." |
| B3 | After verifying phone/email from the checkout prompt, the order is not placed; the shopper must tap Place order again. "Later" dismisses with no message | `widgets/verify_prompt.dart:14-41` | Looks broken in production (verification is required there) |
| B4 | Default API URL is the Android emulator (`10.0.2.2`); iOS builds without `--dart-define` time out | `services/env.dart` | Every call fails on iOS/devices unless configured |
| B5 | Merging the same product into the cart is not capped at stock; a line whose stock drops to 0 stays in the cart | `data/shop_state.dart:156-170, 110-126` | Order fails at the server with a stock error |

---

## 1. Cart

| Feature | Jumia | Amazon | Flipkart | **Somba** | Priority |
|---|---|---|---|---|---|
| Cart saved to the account (same cart on web, app, other phone) | ✓ | ✓ | ✓ | ✗ device only, cleared on sign-out | **P1** |
| Product variants (size / colour) chosen before adding | ✓ | ✓ | ✓ | ✗ always "Default", no picker | **P0** for fashion |
| Save for later / move to wishlist from cart | ✓ | ✓ | ✓ | ✗ (web has it, app doesn't) | P1 |
| Remove with a visible button + undo | ✓ | ✓ | ✓ | swipe only, no undo | P1 |
| Per-line "only N left" / out-of-stock warning in cart | ✓ | ✓ | ✓ | ✗ | P1 |
| "Price changed since you added it" notice | ✓ | ✓ | ✓ | ✗ (price updates silently) | P1 |
| Items grouped by seller, per-seller delivery estimate | ✓ | ✓ | ✓ | ✗ | P2 |
| Delivery date estimate in cart | ✓ | ✓ | ✓ | ✗ flat zone fee only | P1 |
| Free-delivery threshold progress ("Add $5 for free delivery") | ✓ | ✓ | ✓ | ✗ | P2 |
| Coupon in cart, list of available coupons | ✓ | ✓ | ✓ | ✓ | — |
| Recommendations / "frequently bought together" in cart | ✓ | ✓ | ✓ | ✗ | P2 |
| Abandoned-cart reminder (push) | ✓ | ✓ | ✓ | ✗ (needs server cart) | P2 |

## 2. Checkout & payment

| Feature | Jumia | Amazon | Flipkart | **Somba** | Priority |
|---|---|---|---|---|---|
| One-page checkout with clear step errors next to the button | ✓ | ✓ | ✓ | ✗ see B1/B2 | **P0** |
| Delivery zone/fee chosen **automatically** from the address | ✓ | ✓ | ✓ | ✗ manual zone radio list | **P0** |
| Serviceability check ("we don't deliver here yet") | ✓ | ✓ | ✓ | ✗ | P1 |
| Pickup station / collection point as an alternative to home delivery | ✓ (core in Africa) | ✓ lockers | ✓ | ✗ | P1 |
| Delivery date / time slot | ✓ | ✓ | ✓ | ✗ | P1 |
| Mobile money (Airtel / Orange / M-Pesa) | ✓ | — | — | ✓ | — |
| Wallet | ✓ JumiaPay | ✓ | ✓ | ✓ | — |
| Cash on delivery | ✓ | ✓ | ✓ | ✗ in app (server supports it, off by setting) | P1 for DRC |
| Cards | ✓ | ✓ | ✓ | ✗ (server mock only) | P2 |
| Split payment (wallet + mobile money) | ✓ | ✓ | ✓ | ✗ | P2 |
| Gift / order note for the rider | — | ✓ | — | ✓ web, ✗ app | P2 |
| Price breakdown, savings, second currency | ✓ | ✓ | ✓ | ✓ | — |

## 3. Orders after purchase

| Feature | Jumia | Amazon | Flipkart | **Somba** | Priority |
|---|---|---|---|---|---|
| Order list with filters, order detail, status timeline | ✓ | ✓ | ✓ | ✓ | — |
| **Live rider tracking on a map** with ETA | partial | ✓ | ✓ | ✗ lat/lng text + "Open in Maps" | **P1** |
| Delivery code / OTP at handover | ✓ | ✓ | ✓ | ✓ | — |
| Call / chat with the rider | ✓ | masked call | ✓ | ✗ | P1 |
| Push notification at each status (shipped, out for delivery, delivered) | ✓ | ✓ | ✓ | partial (server notifies on create; FCM optional) | P1 |
| Cancel order (with reason) | ✓ | ✓ | ✓ | ✓ cancel, no reason | P2 |
| Return / refund request | ✓ | ✓ | ✓ | ✓ | — |
| **Exchange / replacement** | ✓ | ✓ | ✓ | ✗ (server has `exchanges:create`, `replacements:create`; app never calls them) | P1 |
| Refund status tracking with timeline | ✓ | ✓ | ✓ | partial | P2 |
| **Buy again / reorder** | ✓ | ✓ | ✓ | ✗ | P1 |
| Invoice / receipt download | ✓ | ✓ | ✓ | ✗ | P1 (business buyers) |
| Rate & review prompt after delivery | ✓ | ✓ | ✓ | ✗ only from product page | P1 |
| Change delivery address after ordering (before dispatch) | ✓ | ✓ | ✓ | ✗ | P2 |
| Report a problem on a specific item | ✓ | ✓ | ✓ | via generic help ticket | P2 |

## 4. Location & addresses

| Feature | Jumia | Amazon | Flipkart | **Somba** | Priority |
|---|---|---|---|---|---|
| Map pin / place search / "use my location" | ✓ | ✓ | ✓ | ✓ (needs Maps key) | — |
| **Edit an address** | ✓ | ✓ | ✓ | ✗ add/delete only | **P0** |
| Set an existing address as default | ✓ | ✓ | ✓ | ✗ (only at creation) | P1 |
| Landmark / delivery instructions ("blue gate, near the church") | ✓ | ✓ | ✓ | ✗ (`line2` exists in the model, no field) | **P1** — essential in Kinshasa |
| Separate contact name/phone per address (deliver to someone else) | ✓ | ✓ | ✓ | phone only | P2 |
| Address type (home / work) with icons | ✓ | ✓ | ✓ | free-text label | P2 |
| Zone detected from the pin, fee shown before checkout | ✓ | ✓ | ✓ | ✗ | **P0** (with checkout row above) |
| Location prompt on first launch to set "Deliver to" | ✓ | ✓ | ✓ | ✗ | P2 |
| Phone number format validation per country | ✓ | ✓ | ✓ | ✗ (only street/city required) | P1 |
| Pickup-station finder on a map | ✓ | ✓ | — | ✗ | P1 (with pickup stations) |

## 5. Other areas (brief)

| Area | Missing vs. peers | Priority |
|---|---|---|
| Search | Server-side search (currently filters the downloaded catalogue on the phone — will not scale), autocomplete, search history, typo tolerance | P1 |
| Product page | Image gallery (only one image), zoom, variants, delivery ETA for the shopper's address, seller rating near price | P1 |
| Auth | Login by phone OTP (most DRC users), Google/Apple sign-in | P1 |
| Offline | Cached catalogue / last orders when the network drops | P2 |
| Notifications | Push enabled by default in production (needs Firebase config), deep links to the order | P1 |
| Seller storefront in the app | Logo/banner/description now exist on web (added today); the app doesn't show them yet | P2 |

---

## Suggested order of work

1. **Fix B1–B5** (small, high impact; B1+B2 are the "Place order does nothing" bug).
2. **Address edit, set-default, landmark field** + **zone auto-detected from the pin** (removes the manual zone step).
3. **Variants** (picker on product page, carried in cart and order lines).
4. **Server-side cart** (sync across devices; enables abandoned-cart reminders).
5. **Live rider map + call rider** on the order tracking screen.
6. **Reorder, exchange/replacement, invoice, review prompt after delivery.**
7. **Pickup stations** and **COD** (business decisions first).
