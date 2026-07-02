# Somba&Teka — Customer App: Full Feature Guide (Screen by Screen, with details)

A granular walkthrough of every screen in the Flutter customer app (`mobile/`):
its purpose, every section, the exact on-screen texts/labels, the mock data it
shows, and what each control does. The app is a self-contained prototype (mock
data, no backend) whose entities/flows mirror the web storefront and admin
panel (`shared/screens/registry.ts`, `shared/types/index.ts`).

---

## Global / cross-cutting

- **Bottom navigation** (floating capsule, animated selected pill): **Home ·
  Categories · Deals · Account**.
- **Languages:** English + French, toggled from the Account tab (EN/FR). All
  strings live in `lib/l10n/strings.dart`.
- **Markets & currency** (`lib/data/market_profiles.dart`,
  `lib/util/format.dart`):
  - **France (Demo)** — USD (`$`), prefix `+33`. Zones: *Zone A — Centre*
    (Paris, **$0**), *Zone B — Nord* (Paris, **$5**).
  - **DR Congo (Production)** — Congolese Franc (`FC`), FX **≈ 2 850** USD→CDF,
    prefix `+243`. Zones: *Gombe* (Kinshasa, **$3**), *Limete* (Kinshasa,
    **$5**). In this market prices show **FC** with the **≈ $USD** line beneath.
- **Payments:** Credit / Debit Card, Airtel Money, Orange Money, Vodacom M-Pesa.
  *No cash-on-delivery, no wallet.*
- **Promo codes** (`lib/data/promos.dart`): **SOMBA10** (10% off, min $50) ·
  **SAVE20** ($20 off, min $100) · **WELCOME5** ($5 off, min $0).
- **Persistence** (`shared_preferences`): followed stores, read notifications,
  selected delivery zone — restored on next launch.
- **Mock user:** *Marie Dubois*, `marie@email.com`, avatar “MD”, **Gold member**.
- **Catalogue** (`lib/data/mock_data.dart`) — 12 products with bundled photos:

  | # | Name | Price | Was | Off | ★ (reviews) | Category |
  |---|------|------|-----|-----|-------------|----------|
  | 1 | Fjällräven Foldsack No.1 Backpack | $110 | $140 | 21% | 3.9 (120) | Fashion |
  | 2 | Mens Casual Premium Slim Fit T-Shirt | $22 | $30 | 26% | 4.1 (259) | Fashion |
  | 3 | Mens Cotton Jacket | $56 | $70 | 20% | 4.7 (500) | Fashion |
  | 4 | Mens Casual Slim Fit Shirt | $16 | $25 | 36% | 4.0 (430) | Fashion |
  | 5 | John Hardy Gold & Silver Dragon Bracelet | $695 | $780 | 11% | 4.6 (400) | Jewelery |
  | 6 | Solid Gold Petite Micropavé Ring | $168 | $199 | 16% | 3.9 (70) | Jewelery |
  | 7 | White Gold Plated Princess Earrings | $10 | $15 | 33% | 3.5 (400) | Jewelery |
  | 8 | Pierced Owl Rose Gold Earrings | $11 | $18 | 39% | 4.2 (100) | Jewelery |
  | 9 | WD 2TB Elements Portable Hard Drive | $64 | $79 | 19% | 3.3 (203) | Electronics |
  | 10 | SanDisk SSD PLUS 1TB Internal SSD | $109 | $139 | 22% | 4.5 (470) | Electronics |
  | 11 | Silicon Power 256GB SSD 3D NAND | $109 | $129 | 16% | 4.8 (319) | Electronics |
  | 12 | Acer 21.5" Full HD IPS Monitor | $599 | $699 | 14% | 4.3 (250) | Electronics |

  Categories: **Electronics / Électronique**, **Fashion / Mode**,
  **Jewelery / Bijoux**.
- **Sellers** (`lib/data/catalog_meta.dart`):
  - *Kinshasa Tech Hub* — **Somba Assured**, 4.8★, 12,400 followers, **97%**
    health (Electronics products).
  - *Gombe Fashion House* — **Gold seller**, 4.6★, 8,600 followers, 92%
    (Fashion).
  - *Élégance Bijoux* — **Silver seller**, 4.4★, 3,100 followers, 88% (Jewelery).

---

## 1 · Onboarding & authentication  (`screens/more/auth_screens.dart`)

### 1.1 Splash — `CustomerSplashScreen`
- Full-screen Teka-red gradient; white rounded tile with the “S” monogram.
- Title **“Somba&Teka”**, tagline **“Shop everything, delivered”**, spinner.
- Auto-advances after ~1.6 s to the sign-in screen.

### 1.2 Sign in — `LoginScreen`
- Gradient header: **“Welcome back”**, subtitle *“Sign in to continue shopping
  on Somba”*.
- Fields: **Phone or email** (hint `+243 970 000 000`), **Password** (hint
  `••••••••`, obscured).
- **Forgot password?** (right-aligned) → Reset flow.
- Primary **Sign in** button (shows a spinner ~0.7 s, then enters the app).
- Divider “or”, **Continue with Google** (outlined) and **Continue as guest**
  (text) — both enter the app.
- Footer: *“New here? Create an account”* → Register.

### 1.3 Create account — `RegisterScreen`
- Header **“Create account”**, *“Join Somba&Teka in under a minute”*, back arrow.
- Fields: **Full name** (Marie Dubois), **Phone number** (`+243 970 000 000`),
  **Email** (marie@email.com), **Password** (Create a password).
- Consent row with a checked box: *“I agree to the Terms & Privacy Policy”*.
- **Create account →** goes OTP → Email verification → app.

### 1.4 OTP verification — `OtpScreen`
- Header **“Verify your number”**, *“Enter the 6-digit code sent to
  +243 970 000 000”*.
- Six code boxes (first 3 pre-filled `1 2 3`, active outline).
- **Verify** button. Footer: *“Didn’t get it? Resend in 0:24”*.

### 1.5 Email verification — `VerifyEmailScreen`
- Header **“Verify your email”**, *“We sent a confirmation link to
  marie@email.com”*.
- Card: mail icon + **“Check your inbox”** + *“Tap the link in the email to
  activate your account…”*.
- **I’ve verified — continue** and **Resend email** (snackbar
  *“Verification email resent”*).

### 1.6 Forgot password — `ForgotScreen`
- Header **“Reset password”**, *“We’ll send a reset link to your email”*.
- **Email** field. **Send reset link** → snackbar *“Reset link sent to your
  email”* → Reset-password screen.

### 1.7 Reset password — `ResetPasswordScreen`
- Header **“Set a new password”**, *“Choose a strong password you have not used
  before”*.
- **New password** + **Confirm password**. **Save new password** → snackbar
  *“Password updated — please sign in”* → returns to sign in.

---

## 2 · Home & discovery

### 2.1 Home — `HomeScreen`
- **Top bar** (gradient): **Deliver to** *“Kinshasa, Gombe” ▾* (opens the
  address book), translate toggle, cart bag with a live count badge (opens Cart).
- **Search bar** *“Search products…”* + tune button → Search screen.
- **Hero carousel** (3 auto-rotating banners), each with a pill label —
  **“Prototype Mode”**, **“Flash Sale · -30%”**, **“Free delivery”** — and the
  headline **“Your marketplace, reimagined”** / *“Thousands of products,
  delivered to your door.”*; animated page dots.
- **Quick actions** row (icon tiles): **Deals, Free delivery, In stock,
  Coupons** (trust badges).
- **Top categories** section header with **See all** (→ Search) and a category
  strip.
- **Flash-sale strip** and a **deals** row of discounted products.
- **Recommended for you** header + **See all**; filter chips
  **For You / Trending / New / Popular**; product grid. Each card: photo,
  discount pill, wishlist heart, name, ★rating, price, add-to-cart.

### 2.2 Categories — `CategoriesScreen`
- Grid of gradient category tiles: **Electronics, Fashion, Jewelery**, each with
  its product count. Tapping opens that category’s product list.

### 2.3 Product list / category results — `ProductListScreen`
- App bar = category name (e.g. **Electronics**).
- **Sort chips**: **Popular · Price ↑ · Price ↓ · Top rated**; “**N items**”.
- 2-column product grid; cards add to cart directly.

### 2.4 Search — `SearchScreen`
- Search field pre-filled *“Galaxy S24”* with a clear (×) button.
- **Filter chips**: **All (tune icon) · Price ↑ · Top rated · Big deals ·
  Under $100**; “**N results**”.
- 2-column results grid.

### 2.5 Deals — `DealsScreen`
- Red **“Flash Sale”** app bar with a flame motif, an **“Ends in”** pill and a
  live **countdown**.
- Grid of products with **discount ≥ 15%** (sorted high→low), each card showing
  a **“sold %”** progress bar; tap → detail, add → snackbar *“Added to cart”*.

---

## 3 · Product & store

### 3.1 Product detail — `ProductDetailScreen`
- Collapsing image header (Hero-animated), back button; actions **wishlist
  heart** (toggles) and **share** (snackbar *“Link copied”*).
- Category pill + **“In stock”** (green check).
- Title, ★rating · “N reviews”.
- **Price** (large) + strike-through original + **Save $X** pill. In DRC market
  a secondary **≈ $USD** line appears under the FC price.
- **Select option** — variants: Fashion → **S / M / L / XL**; Electronics →
  **128GB / 256GB / 512GB**.
- **Quantity** stepper (− / n / +).
- Info cards: **Free delivery** *“Arrives in 2 days”*; **Free returns**
  *“Within 30 days”*.
- **Description** (generated blurb).
- **Seller card**: avatar, name, ★rating · **health %**, **tier badge**
  (Gold / Silver / Bronze / **Somba Assured**), **Follow store / Following**
  (persisted) and **Visit store** (→ Store front).
- **Specifications** table, by category:
  - Electronics: Warranty **12 months** · Condition **Brand new · sealed** · In
    the box **Device, cable, manual** · Ships from **Kinshasa warehouse**.
  - Fashion: Material **Premium cotton blend** · Care **Machine wash cold** ·
    Fit **True to size** · Origin **Ethically sourced**.
  - Jewelery: Material **18k gold / sterling silver** · Certificate
    **Authenticity included** · Warranty **24 months** · Packaging **Gift box
    included**.
- **Reviews** row (★rating · N reviews · *“Read what buyers say”*) → Reviews list.
- **Questions & answers** with **Ask** button and seeded Q&A:
  *“Is this the latest model?” → “Yes — it is the current 2026 edition.”* and
  *“Does it ship to Kinshasa?” → “Yes, delivered within 2 days in Gombe.”* The
  composer adds your question in an *“Awaiting seller response…”* state.
- **You may also like** — related-products carousel (same category).
- Sticky bottom bar: cart icon (**Add to cart**) + **Buy Now · $price**.

### 3.2 Store front — `StoreScreen`
- Gradient hero: **“TechSphere Store”** (verified), *“Official electronics
  partner”*, **“Somba Assured · 97% health”** badge, share button.
- Stats: **4.8★ Rating · 128 Products · 12.4k Followers**.
- **Follow** (snackbar *“Following TechSphere Store”*) and **Chat** (snackbar
  *“Opening chat with the store…”*).
- 2-column product grid.

### 3.3 Reviews list — `ReviewsScreen`
- List of customer reviews (avatar initial, name, ★ row, text, date).
- Bottom **Write a review** → Review compose.

### 3.4 Review compose — `ReviewComposeScreen`
- Optional product summary card.
- **“How would you rate it?”** — 5 tappable stars (default 5).
- **Add photos** — two photo tiles.
- **Your review** — multiline field (hint *“Share what you liked…”*).
- **Submit review** → snackbar *“Review submitted — pending moderation”*.

---

## 4 · Cart, checkout & payment

### 4.1 Cart — `CartScreen`
- App bar **“Cart (N)”**. Seeded items: *Fjällräven Foldsack* (256GB Black) and
  *Mens Cotton Jacket* (White ×2).
- Each row: image, name, variant, price, − / qty / + stepper, remove.
- Empty state: *“Your cart is empty” / “Add items to get started”* +
  **Start shopping**.
- **Promo row**: input (hint *“Promo code”*) + **Apply**. Validates against
  SOMBA10 / SAVE20 / WELCOME5 with min-order checks → snackbars *“CODE applied”*,
  *“Invalid promo code”*, or *“Spend $X to use CODE”*.
- Summary: **Subtotal**, **Delivery** (or **FREE**), **Promo CODE − $X** (when
  applied), **Total**; **Checkout · $total →**.

### 4.2 Checkout — `CheckoutScreen`
- **Delivery address** card: *“Marie Dubois · +243 970 000 000”*, address line,
  **edit** icon → Address book.
- **Delivery zone** picker (radios) listing the active market’s zones with fees
  (**FREE**/`$`); selection drives the delivery fee (persisted).
- **Payment** method list: **Credit / Debit Card, Airtel Money, Orange Money,
  Vodacom M-Pesa** (single-select).
- **Order summary**: Subtotal, **Delivery · <zone>**, **Promo CODE − $X**,
  **Total** (+ **≈ $USD** line in DRC).
- Bottom **Place order · $total** → Order confirmation (id `SMB-2026-4821`).

### 4.3 Payment — `PaymentScreen`
- App bar **“Payment”**. Optional red **“Payment failed. No money was taken —
  please try another method.”** banner (failed state).
- Amount card: **Order total $1,104 · Delivery $5 · To pay $1,109**.
- **Payment method**: Credit / Debit Card (selected), Airtel Money, M-Pesa.
- Bottom **Pay $1,109** (or **Retry payment · $1,109**) → snackbar + back.

### 4.4 Order confirmation — `OrderSuccessScreen`
- Animated success check, **“Order Confirmed!”**, *“Thank you! Your order is
  being prepared.”*, order-id chip.
- **Track order** (→ tracking) and **Continue shopping** (→ home).

---

## 5 · Orders & post-purchase

### 5.1 Orders — `OrdersScreen`
- Filter tabs: **All · Active · Delivered · Cancelled**.
- Seeded orders:

  | Order | Status | Amount | Items |
  |-------|--------|--------|-------|
  | SMB-2026-4821 | Processing | $1,498 | 2 |
  | SMB-2026-4805 | Confirmed | $74 | 1 |
  | SMB-2026-4790 | Out for delivery | $349 | 1 |
  | SMB-2026-4762 | Shipped | $129 | 2 |
  | SMB-2026-4712 | Delivered | $218 | 3 |
  | SMB-2026-4655 | Cancelled | $56 | 1 |
  | SMB-2026-4610 | Returned | $168 | 1 |

- Each card: icon, id, items · amount, colored **status pill**, a status hint
  (e.g. *“Rider is on the way”*, *“Delivered on Jun 24”*, *“Return refunded”*)
  and a status-specific action — **Track** (active), **Review** (delivered),
  **Reorder** (cancelled/returned, snackbar *“Re-ordering these items…”*).

### 5.2 Order detail — `OrderDetailScreen`
- App bar **“Order SMB-2026-4821”**.
- Status card **“Processing”** / *“Placed today · arrives in 2 days”* + **Track**.
- **Items** (2 products, qty, price).
- Totals: Subtotal, Delivery **$5**, **Total**; **“Paid online · Airtel Money”**.
- Actions: **Return** (→ return flow) and **Help** (→ Help).

### 5.3 Order tracking — `OrderTrackingScreen`
- **Live map**: grid, Bézier route (grey full path, **red travelled** portion),
  grey start pin, red destination pin, animated **rider marker** with a halo; a
  white pill **“Arriving in ~N min”** ticking down (14→1).
- Rider card: **“Jean Mukendi” / “Your rider · ⭐ 4.9”** + call button.
- **Status timeline**: Order placed (09:14) · Packed at warehouse (10:02) ·
  Shipped (11:20) · Out for delivery (Rider on the way) · Delivered
  (Estimated 14:30).

### 5.4 Return request — `ReturnRequestScreen`
- 3-step stepper: **Select items → Reason → Review**.
- **Step 1** — checkbox list of the order’s items (first three products) with
  photo/price; the refund is the sum of the selected items.
- **Step 2** — **Reason**: Damaged / defective · Wrong item received · Not as
  described · No longer needed · Other. **Refund to**: Store credit (instant) ·
  Original payment method · Bank transfer.
- **Step 3** — review of selected items, reason, refund method and **Estimated
  refund $X**. **Continue / Back**; final **Submit return** → return status.

### 5.5 Return status — `ReturnStatusScreen`
- App bar **“Return RET-2026-118”**.
- Banner **“Refund on the way”** / *“$X to store credit · 1–2 days”* (X = the
  computed refund).
- Timeline: Return requested (Jun 28) · Pickup scheduled (Rider assigned) ·
  Item collected (Jun 29) · Quality check (At warehouse) · Refund issued
  (Estimated Jul 2).

### 5.6 Exchange — `ExchangeScreen`
- App bar **“Exchange item”**; product card.
- **Exchange for a different size** — size chips **S / M / L / XL**.
- Info: *“Free size exchange within 30 days. A rider will swap it at your door.”*
- **Request exchange** → snackbar *“Exchange requested — size M”*.

### 5.7 Dispute — `DisputeScreen`
- App bar **“Dispute DSP-4410”**; amber banner *“Under review — our team responds
  within 24h.”*.
- Seeded thread: You *“Item arrived damaged. Requesting a replacement.”* →
  Support *“Thanks Marie — we’ve opened a dispute and asked the seller to
  respond.”* → Support *“Please share a photo of the damage to speed things
  up.”* → You *“Photo attached. 📷”*.
- Working reply field (**“Type a message…”**) + send; auto-scrolls to newest.

---

## 6 · Account & profile

### 6.1 Account — `AccountScreen`
- Gradient header: avatar **“MD”**, **“Marie Dubois”**, *marie@email.com*,
  **Gold member** pill; stat row **12 Orders · N Wishlist · 3 Coupons**.
- **Menu card 1**: **My Orders · Wishlist · Addresses · Coupons**.
- **Language card**: **Language** with an **EN / FR** segmented toggle.
- **Menu card 2**: **Edit profile · Notifications · Refer & Earn · Support ·
  Settings · Help & support**.
- **Log out** tile (red) → confirmation sheet **“Log out?”** / *“You can sign
  back in anytime…”* with **Log out** / **Cancel**.
- Amber footer note: *“Prototype mode — mock data, no backend.”*

### 6.2 Edit profile — `CustomerEditProfileScreen`
- Avatar “MD” with a camera badge.
- Pre-filled fields: **Full name** (Marie Dubois), **Phone**
  (+243 970 000 000), **Email** (marie@email.com).
- **Save changes** → snackbar *“Profile updated”* → back.

### 6.3 Settings — `CustomerSettingsScreen`
- **Notifications**: **Push notifications** (*Order updates & offers*) ·
  **Email** (*Receipts & newsletters*) · **SMS** (*Delivery alerts by text*).
- **Market & currency**: **France (Demo)** (*Prices in USD*) ·
  **DR Congo** (*Prices in Congolese Franc (FC)*) — switching re-renders prices
  app-wide (snackbar *“Market set to …”*).
- **Privacy**: **Personalized recommendations** (*Use my activity to improve
  results*).
- **Account**: **Change password** · **About Somba&Teka** (about dialog) ·
  **Delete account** (→ delete screen).

### 6.4 Notifications — `NotificationsScreen`
- Title shows the **unread count** (e.g. “Notifications (3)”); **Mark all**.
- Items (unread ones carry a dot; broadcasts a **“News”** tag):
  - **Out for delivery** — *“Your order SMB-2026-4821 is on the way.”* · 2m
  - **Weekend mega sale** (News) — *“Somba&Teka: up to 50% off this weekend
    only!”* · 40m
  - **Flash sale live** — *“Up to 30% off electronics — ends tonight.”* · 1h
  - **Order delivered** — *“SMB-2026-4712 was delivered. Rate it?”* · 1d
  - **Refund processed** — *“$18 refunded for SMB-2026-4712.”* · 2d
  - **Coupon unlocked** — *“SAVE10 — 10% off your next order.”* · 3d
- Tapping marks that item read (persisted) with a snackbar
  (*“Opening promotion…”* for broadcasts, else *“Opening <title>…”*).

### 6.5 Addresses — `AddressBookScreen`
- Cards: **Home** — *12 Commerce Ave, Gombe, Kinshasa* · +243 970 000 000
  (**Default**); **Work** — *Tower B, Limete Industrial, Kinshasa* ·
  +243 971 111 222.
- Row (or the **edit** icon) opens the form pre-filled; **Add new address**.

### 6.6 Address form — `AddressFormScreen`
- Title **“Add address”** or **“Edit address”** (pre-filled).
- Fields: **Label** (Home, Work…), **Full name**, **Phone**, **Address**, and a
  **City / Zone** row; **“Set as default address”** row.
- **Save address / Update address** → snackbar *“Address saved / updated”*.

### 6.7 Coupons — `CouponsScreen`
- Cards for each promo: code (**SOMBA10 / SAVE20 / WELCOME5**), description, min
  order, **Copy** (→ clipboard, snackbar *“CODE copied”*).
- Note: *“Apply a coupon code in your cart before checkout.”*

### 6.8 Wishlist — `WishlistScreen`
- 2-column grid of saved products (odd-id products seeded) with wishlist toggle.

### 6.9 Refer & Earn — `ReferScreen`
- Gradient banner: *“Invite friends — you both earn $5 in store credit on their
  first order.”*
- **Your referral code**: **MARIE-5X9K** + **Copy** (snackbar *“Referral code
  copied”*).
- **Share invite link** (snackbar *“Sharing your invite link…”*).
- **Your rewards**: **7 Friends joined · $35 Earned · 3 Pending**.

---

## 7 · Support & help

### 7.1 Support tickets — `SupportListScreen`
- App bar **“Support”**. Tickets:
  - **TKT-3391** — *Refund not received* — **Open**
  - **TKT-3382** — *Wrong item delivered* — **In progress**
  - **TKT-3360** — *Change delivery address* — **Resolved**
- Tap → ticket thread; **New ticket** (snackbar *“Opening a new support
  ticket…”*).

### 7.2 Support ticket detail — `SupportTicketDetailScreen`
- Header = ticket id, subject + status pill.
- Seeded thread: *“Hi, I need help with this order.”* → *“Thanks for reaching
  out! Could you share the order number…”* → *“It is order SMB-2026-4821.”* →
  *“Got it — our team is reviewing it now…”*.
- Reply field (**“Reply…”**) + send.

### 7.3 Help — `HelpScreen`
- App bar **“Help & support”**. Contact tiles: **Live chat · Call us · Email**.
- **FAQs**: *How do I track my order? · What are the delivery fees? · How do
  returns and refunds work? · Which payment methods are accepted? · How do I
  contact a seller?*
- **Delete my account** link → delete screen.

### 7.4 Delete account — `AccountDeleteScreen`
- Red warning card **“This action is permanent”** / *“Deleting your account
  removes your orders, coupons, wishlist and addresses. This cannot be undone.”*
- **Before you go**: *Any unused coupons will be forfeited · Active orders must
  be completed or cancelled · You can create a new account anytime.*
- **Permanently delete account** (snackbar *“Account deletion requested”*) and
  **Keep my account**.

---

## Admin-panel compatibility (summary)
- **Order statuses** use the shared 8-value `OrderStatus` union (pending →
  returned).
- **Returns / disputes / support / reviews** mirror the admin queues so a
  customer action maps to the matching admin record.
- **Address** fields follow the shared `Address` shape; **zones** carry a
  `deliveryFeeUsd`; **seller badges** use the `SellerBadge` tiers.
- Payments limited to card + mobile money (no COD/wallet).

## Related docs
- `CUSTOMER_APP_GAP_ANALYSIS.md` — screen-level parity vs the registry.
- `CUSTOMER_APP_DETAIL_GAPS.md` — detail-level parity (phases 1–3).
- Screenshots: `docs/screenshots/` (per-screen `flows/` + contact sheets).
