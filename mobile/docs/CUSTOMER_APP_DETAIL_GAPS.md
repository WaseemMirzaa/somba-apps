# Customer App — Detail-Level Gaps vs Admin / Web Reference

Follow-up to `CUSTOMER_APP_GAP_ANALYSIS.md` (which covered *screens*). This
covers **details inside screens** and **data/features the admin panel manages**
that the customer app should surface, so the two stay compatible.

Sources: `web/src/app/shop/**`, `web/src/app/admin/**`, `shared/types/index.ts`,
`shared/mock/entities.ts`, `shared/market-profiles.ts`, `web/src/lib/config.ts`.

> **Product overrides that still apply:** COD and wallet were removed on request.
> So COD, wallet balance and "pay with wallet" are **out of scope**; refunds use
> store credit / original payment / bank transfer, and payment methods are limited
> to card + mobile money (Airtel / Orange / M-Pesa).

## Areas & deltas

### 1. Currency, market & zones
- Reference: dual markets `france` (USD) / `drc` (USD+CDF, FX 2850), zone-based
  delivery fees (`Zone.deliveryFeeUsd`), dual-currency display.
- App had: `marketNotifier` + currency-aware `money()`, zones declared but unused;
  delivery fee hardcoded to `5.0`; no market switcher.
- **Delta:** market switcher (France/DRC) wired to `marketNotifier`; zone picker at
  checkout that drives the delivery fee from `currentMarket.zones`; app wrapped so
  prices re-render on market change.

### 2. Product detail
- Reference: seller card (name, rating, health %, follow), **seller badge**
  (gold/silver/bronze/somba_assured), specs + warranty, reviews, related products,
  delivery ETA/return window, open-box.
- App had: category, price, variants, quantity, static delivery cards, description.
- **Delta:** seller card + badge, specs section, related-products carousel, reviews
  entry point, delivery ETA line.

### 3. Seller / stores
- Reference: store hero with rating, followers, product count, **badge**, policies.
- App had: `StoreScreen` without seller tier/rating/followers.
- **Delta:** show badge + rating + followers + policies on the store screen.

### 4. Coupons / promos / flash sales
- Reference: promo codes (`SOMBA10` 10% min $50, `SAVE20` $20 off min $100),
  admin promotions/flash-sales, coupons.
- App had: non-functional cart "Apply"; account "Coupons 3" stat with no list.
- **Delta:** real promo validation + discount line in cart/summary; a **Coupons**
  screen listing available codes with rules.

### 5. Orders
- Reference: all 8 `OrderStatus` values, status filters, status-specific actions
  (reorder / return / review / cancel), transaction id, commune/region address.
- App had: 3 statuses, no filters, only Return + Help actions.
- **Delta:** full 8-status model (label/color/icon) + status filter tabs + actions
  (Reorder, Review when delivered, Cancel when pending/processing).

### 6. Payments
- Reference: card + Airtel + Orange Money + Vodacom M-Pesa (COD/wallet excluded here).
- App had: card + Airtel only.
- **Delta:** add Orange Money + M-Pesa.

### 7. Notifications
- Reference: admin broadcasts, read/unread persistence, tap-through to target.
- App had: local `_allRead` flag only.
- **Delta:** persist read state in `ShopState`; tap navigates.

### 8. Returns / disputes (deferred detail)
- Reference: multi-step return with item selection + refund amount; dispute message
  send. App has single-form return + static dispute thread.
- **Delta (phase 2):** item selection + computed refund; dispute send.

## Implementation phases
- **Phase 1 (this pass):** seller card + badges (product & store), specs +
  related products, full 8 order statuses + actions, zone-based delivery fee +
  market switcher, promo validation + discount, Coupons screen, Orange/M-Pesa.
- **Phase 2 (done):** multi-step returns with item selection & computed refund;
  dispute message send (live thread); notification read-state persistence + tap
  + admin broadcast feed; product Q&A with "ask a question".
- **Phase 3:** dual-currency inline display, related-store follow persistence,
  live tracking map.
