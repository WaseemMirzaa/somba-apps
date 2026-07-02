# Somba&Teka — Customer App: Full Feature Guide (Screen by Screen)

A complete walkthrough of every screen in the Flutter customer app (`mobile/`),
its purpose, and the features it offers. The app is a self-contained prototype
(mock data, no backend) whose entities/flows mirror the web storefront and the
admin panel (`shared/screens/registry.ts`, `shared/types/index.ts`).

**Cross-cutting facts**
- **Languages:** English + French (FR/EN toggle in the account tab).
- **Markets / currency:** France (USD) and DR Congo (CDF “FC”, FX ≈ 2 850). In the
  DRC market prices show FC with the ≈ USD equivalent underneath.
- **Payments:** card (Stripe), Airtel Money, Orange Money, Vodacom M-Pesa.
  *No cash-on-delivery, no wallet* (removed by product decision).
- **Persistence:** followed stores, read notifications and the chosen delivery
  zone are saved via `shared_preferences` and restored on next launch.
- **Design:** Teka-red brand, Inter + Plus Jakarta Sans fonts, floating capsule
  bottom navigation, bundled product photos so it looks complete offline.

---

## 1 · Onboarding & authentication

### 1.1 Splash — `CustomerSplashScreen`
- Brand gradient with the “S” logo, app name and tagline, loading spinner.
- Auto-advances (~1.6 s) into the auth flow.

### 1.2 Sign in — `LoginScreen`
- Phone/email + password fields, show/loading state on submit.
- **Forgot password?** link → reset flow.
- **Continue with Google** and **Continue as guest** entry points.
- Link to **Create an account**.

### 1.3 Create account — `RegisterScreen`
- Full name, phone, email, password; Terms & Privacy consent row.
- Continues to OTP → email verification → app.

### 1.4 OTP verification — `OtpScreen`
- Six-box code entry with an active/filled style, “Resend in 0:24”.
- Verifies and proceeds.

### 1.5 Email verification — `VerifyEmailScreen`
- “Check your inbox” card, **I’ve verified → continue**, **Resend email**.

### 1.6 Forgot password — `ForgotScreen`
- Email field → sends a reset link → reset-password screen.

### 1.7 Reset password — `ResetPasswordScreen`
- New password + confirm, saves and returns to sign in.

---

## 2 · Home & discovery

### 2.1 Home — `HomeScreen`
- **Deliver-to** location selector (opens the address book), language toggle,
  cart icon with a live item-count badge.
- **Hero carousel** of promos (auto-rotating).
- **Quick-action** trust badges (deals, free delivery, in stock, coupons).
- **Top categories** row + **See all** → search/browse.
- **Flash-sale strip** and a **deals** row of discounted products.
- **Recommended feed** with filter chips (For You / Trending / New / Popular)
  and a product grid. Every product card is tappable and has a wishlist heart.

### 2.2 Categories — `CategoriesScreen`
- Grid of category tiles (Electronics, Fashion, Jewelery) with gradient art and
  a product count. Tapping a category opens its product list.

### 2.3 Product list / category results — `ProductListScreen`
- Product grid filtered by category, item count, and **sort chips**
  (Popular / Price ↑ / Price ↓ / Top rated). Cards add to cart directly.

### 2.4 Search — `SearchScreen`
- Search entry with suggestions/recent, live results grid.

### 2.5 Deals — `DealsScreen`
- Flash-deal hub: countdown timer, “sold %” progress on cards, discounted grid.

---

## 3 · Product & store

### 3.1 Product detail — `ProductDetailScreen`
- Hero image (Hero-animated), wishlist & share actions, in-stock badge.
- Price with **strike-through original**, **Save** pill; **dual currency**
  (FC + ≈ $) in the DRC market.
- **Variant** selector (size / capacity), **quantity** stepper.
- Delivery & returns info cards, description.
- **Seller card**: name, rating, health %, **tier badge**
  (Gold / Silver / Bronze / **Somba Assured**), **Follow store** (persisted) and
  **Visit store**.
- **Specifications** table (warranty, condition, contents…).
- **Reviews** entry (rating + count → reviews list).
- **Questions & Answers** with existing Q&A and an **Ask a question** composer.
- **You may also like** related-products carousel.
- Sticky bottom bar: **add to cart** + **Buy now · price**.

### 3.2 Store front — `StoreScreen`
- Brand hero with rating / products / followers stats, verified + **Somba
  Assured · health** badge, **Follow** and **Chat** actions, share, product grid.

### 3.3 Reviews list — `ReviewsScreen`
- List of customer reviews (avatar, stars, text, date) + **Write a review**.

### 3.4 Review compose — `ReviewComposeScreen`
- Star rating selector, **add photos**, free-text review, submit (→ moderation).

---

## 4 · Cart, checkout & payment

### 4.1 Cart — `CartScreen`
- Line items with image, variant, quantity stepper and remove; empty state.
- **Promo code** field with real validation (SOMBA10 / SAVE20 / WELCOME5,
  min-order checks) and a discount line.
- Summary: subtotal, delivery (FREE when zero), promo discount, total.

### 4.2 Checkout — `CheckoutScreen`
- Delivery address card with **edit** (→ address book).
- **Delivery zone** picker that drives the fee from the active market’s zones.
- **Payment method** selector (card / Airtel / Orange / M-Pesa).
- Order summary with zone fee, promo discount and dual-currency total.
- **Place order** → confirmation.

### 4.3 Payment — `PaymentScreen`
- Dedicated pay screen with method list and a **failure/retry** state
  (`payment-failed`), amount to pay.

### 4.4 Order confirmation — `OrderSuccessScreen`
- Success animation, order id chip, **Track order** and **Continue shopping**.

---

## 5 · Orders & post-purchase

### 5.1 Orders — `OrdersScreen`
- All **8 order statuses** (pending, confirmed, processing, shipped,
  out-for-delivery, delivered, cancelled, returned) with labels/colors/icons.
- **Filter tabs**: All / Active / Delivered / Cancelled.
- Per-order status hint and a status-specific action: **Track**, **Review**
  (delivered) or **Reorder** (cancelled/returned).

### 5.2 Order detail — `OrderDetailScreen`
- Status banner + **Track**, item list, subtotal/delivery/total, payment line,
  **Return** and **Help** actions.

### 5.3 Order tracking — `OrderTrackingScreen`
- **Live map**: animated rider marker travelling a route, travelled path in red,
  destination pin, and a ticking **“Arriving in ~N min”** countdown.
- Rider card (name, rating, call) and a status timeline.

### 5.4 Return request — `ReturnRequestScreen`
- **Multi-step**: select items → reason + refund method → review, with the
  **refund computed** from the selected items. Refund to store credit /
  original payment / bank.

### 5.5 Return status — `ReturnStatusScreen`
- Refund banner with the computed amount + store-credit ETA, status timeline.

### 5.6 Exchange — `ExchangeScreen`
- Size selector for a fashion item, free-exchange policy note, request exchange.

### 5.7 Dispute — `DisputeScreen`
- Under-review banner and a **live conversation** (buyer/support thread) with a
  working message input, send, and auto-scroll.

---

## 6 · Account & profile

### 6.1 Account — `AccountScreen`
- Profile header (avatar, name, email, member badge) + stats
  (orders, wishlist, coupons).
- Menu: **My orders, Wishlist, Addresses, Coupons**; language card (EN/FR);
  **Edit profile, Notifications, Refer & Earn, Support, Settings, Help**;
  **Log out** (with a confirmation sheet).

### 6.2 Edit profile — `CustomerEditProfileScreen`
- Avatar with camera badge, name/phone/email fields, **Save changes**.

### 6.3 Settings — `CustomerSettingsScreen`
- **Notifications**: push / email / SMS toggles.
- **Market & currency**: France (USD) / DR Congo (FC) — re-renders prices.
- **Privacy**: personalized-recommendations toggle.
- **Account**: change password, about, delete account.

### 6.4 Notifications — `NotificationsScreen`
- Order, promo and **admin broadcast** (“News”) items; **unread count** in the
  title; tap marks read (persisted); **Mark all**.

### 6.5 Addresses — `AddressBookScreen`
- Address cards (label, address, phone, default badge). Row or **edit** icon
  opens the form pre-filled; **Add new address**.

### 6.6 Address form — `AddressFormScreen`
- Add **or edit** (pre-filled) an address: label, name, phone, address,
  city/zone, set-as-default; **Save/Update**.

### 6.7 Coupons — `CouponsScreen`
- Available promo codes with description + min order, **Copy** to clipboard.

### 6.8 Wishlist — `WishlistScreen`
- Saved products grid with wishlist toggling.

### 6.9 Refer & Earn — `ReferScreen`
- Reward banner (store credit), referral code with **Copy** + **Share invite
  link**, rewards stats (friends joined / earned / pending).

---

## 7 · Support & help

### 7.1 Support tickets — `SupportListScreen`
- Ticket list (id, subject, status pill); tap opens the thread; **New ticket**.

### 7.2 Support ticket detail — `SupportTicketDetailScreen`
- Subject + status header and a **conversation thread** with reply input & send.

### 7.3 Help — `HelpScreen`
- FAQ / help topics.

### 7.4 Delete account — `AccountDeleteScreen`
- Permanent-action warning, “before you go” bullets, delete / keep buttons.

---

## Admin-panel compatibility (summary)
- **Order statuses** use the shared 8-value `OrderStatus` union.
- **Returns / disputes / support / reviews** mirror the admin queues so a
  customer action maps to the matching admin record.
- **Address** fields follow the shared `Address` shape; **zones** carry a
  `deliveryFeeUsd`; **seller badges** use the `SellerBadge` tiers.
- Payments limited to card + mobile money (no COD/wallet).

## Related docs
- `CUSTOMER_APP_GAP_ANALYSIS.md` — screen-level parity vs the registry.
- `CUSTOMER_APP_DETAIL_GAPS.md` — detail-level parity (phases 1–3).
- Screenshots: `docs/screenshots/` (per-screen `flows/` + contact sheets).
