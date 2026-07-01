# Customer App — Gap Analysis vs Web/Admin Reference

Compares the Flutter **customer app** (`mobile/`) against the canonical screen
registry (`shared/screens/registry.ts`, IDs `CF-01…CF-36`), the shared data
model (`shared/types/index.ts`), and the web storefront (`web/src/app/shop/*`)
which the admin panel (`web/src/app/admin/*`) drives.

Goal: bring the customer app to parity with the reference and keep its
entities/statuses/labels **compatible with the admin panel frontend** (same
order statuses, dispute/return/support/review models, address shape, zones).

## Legend
- ✅ present & wired  · 🟡 partial · ❌ missing · 🚫 intentionally dropped

## Screen coverage (CF-01 … CF-36)

| ID | Screen | Status | Notes |
|----|--------|--------|-------|
| CF-01 | Splash / Bootstrap | ✅ | `CustomerSplashScreen` |
| CF-02 | Home Feed | ✅ | `HomeScreen` |
| CF-03 | Category Tree | ✅ | `CategoriesScreen` |
| CF-04 | Product List (category results) | ❌ | Tapping a category wrongly opens a single product detail; needs a real product-grid results screen |
| CF-05 | Search Entry | ✅ | `SearchScreen` |
| CF-06 | Search Results | ✅ | within `SearchScreen` |
| CF-07 | Store Front | ✅ | `StoreScreen` |
| CF-08 | Product Detail | ✅ | `ProductDetailScreen` |
| CF-09 | Cart | ✅ | `CartScreen` |
| CF-10 | Checkout | ✅ | `CheckoutScreen` |
| CF-11 | Payment | ✅ | `PaymentScreen` |
| CF-12 | Order Confirmation | ✅ | `OrderSuccessScreen` |
| CF-13 | Register | ✅ | `RegisterScreen` |
| CF-14 | Login | ✅ | `LoginScreen` |
| CF-15 | OTP Verification | ✅ | `OtpScreen` |
| CF-16 | Email Verification | ❌ | No email-verification screen |
| CF-17 | Forgot Password | ✅ | `ForgotScreen` |
| CF-18 | Reset Password | ❌ | Forgot sends a link but there is no reset-password screen |
| CF-19 | Profile & Settings | 🟡 | `AccountScreen` exists but there is no Settings screen or Edit-profile form (rider app has both) |
| CF-20 | Address Book | ✅ | `AddressBookScreen` (edit now wired) |
| CF-21 | Address Form | ✅ | `AddressFormScreen` (add + edit) |
| CF-22 | Order History | ✅ | `OrdersScreen` |
| CF-23 | Order Detail | ✅ | `OrderDetailScreen` |
| CF-24 | Order Tracking | ✅ | `OrderTrackingScreen` |
| CF-25 | Return Request | ✅ | `ReturnRequestScreen` |
| CF-26 | Return Status | ✅ | `ReturnStatusScreen` |
| CF-27 | Review Compose | ❌ | `ReviewsScreen` lists reviews; "Write a review" only shows a snackbar — no compose screen |
| CF-28 | Wishlist | ✅ | `WishlistScreen` |
| CF-29 | Notification Centre | ✅ | `NotificationsScreen` |
| CF-30 | Dispute Detail | ✅ | `DisputeScreen` |
| CF-31 | Help / Account Deletion | ✅ | `HelpScreen` + `AccountDeleteScreen` |
| CF-32 | Somba&Teka Wallet | 🚫 | Removed on request (no wallet/COD) |
| CF-33 | Refer & Earn | ✅ | `ReferScreen` |
| CF-34 | Exchange Request | ✅ | `ExchangeScreen` |
| CF-35 | Support Ticket | 🟡 | `SupportListScreen` exists; no ticket **detail** thread (`/shop/support/:id`) |
| CF-36 | Flash Deals Hub | ✅ | `DealsScreen` |

## Gaps to implement (this pass)

1. **CF-04 Product List / Category Results** — grid of products for a category or
   filter, with sort/price affordances. Fix `CategoriesScreen` so a category opens
   this list (not a single product).
2. **CF-16 Email Verification** — confirm-email screen with resend.
3. **CF-18 Reset Password** — set-new-password screen reached from Forgot.
4. **CF-19 Settings + Edit Profile** — account Settings screen (notifications,
   language, privacy, about, delete) and an Edit-profile form (name/phone/email),
   matching the rider app's structure.
5. **CF-27 Review Compose** — star rating + photo + comment composer; wire
   "Write a review" (reviews list + product detail).
6. **CF-35 Support Ticket Detail** — ticket conversation thread; wire ticket rows
   in `SupportListScreen`.

Lower priority / not in this pass:
- Store **directory** list (`/shop/stores`) — only the store detail exists today.

## Admin-panel compatibility notes
- **Order statuses** must use the shared `OrderStatus` union: `pending · confirmed
  · processing · shipped · out_for_delivery · delivered · cancelled · returned`.
- **Return / Dispute / Support / Review** records must mirror the admin queues
  (`/admin/returns`, `/admin/disputes`, `/admin/support`, `/admin/reviews`) so a
  customer action shows up as the matching admin record.
- **Address** fields follow the shared `Address` interface (label, line1, commune,
  city, region, country, phone, isDefault).
- **Payment methods** limited to `stripe_card` and `airtel_money` (COD & wallet
  intentionally excluded).
