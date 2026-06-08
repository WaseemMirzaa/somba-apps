# Non-Functional Features — Fixed

Track of stub features per portal and their implementation status.

## Shop / Customer
| Feature | Status |
|---------|--------|
| Cart qty / remove / save for later | ✅ ShopContext |
| Cart badge in header | ✅ Live count |
| Promo codes at cart | ✅ SOMBA10, SAVE20 |
| Zone delivery fee in totals | ✅ Market profile |
| Dual USD/CDF display (DRC) | ✅ DualCurrency |
| Add to cart from PDP | ✅ |
| Wishlist toggle | ✅ |
| Follow store | ✅ |
| Share product | ✅ |
| Pincode/zone checker on PDP | ✅ |
| Q&A submit | ✅ |
| Checkout → payment split (CF-10/11) | ✅ |
| COD cap check | ✅ |
| Payment failure retry | ✅ |
| Order confirm per ID (CF-12) | ✅ |
| Live tracking map (CF-24) | ✅ Mock map |
| Reorder | ✅ |
| Return status (CF-26) | ✅ |
| Auth stack CF-13–18 | ✅ |
| Notifications CF-29 | ✅ |
| Disputes CF-30 | ✅ |
| Account deletion CF-31 | ✅ |
| Help / FAQ | ✅ |
| Flash deals CF-36 | ✅ |
| Rich filters + buy again | ✅ |
| Search autocomplete | ✅ |
| Recently viewed | ✅ ShopContext |

## Seller
| Feature | Status |
|---------|--------|
| Registration SF-01 (no KYC Δ1) | ✅ |
| Pending / resubmit SF-02/21 | ✅ |
| Storefront + preview SF-05/06 | ✅ |
| Flag unavailable SF-12 | ✅ |
| Disputes SF-19/20 | ✅ |
| Notifications SF-18 | ✅ |
| Request payout CTAs | ✅ |
| CSV import/export | ✅ |
| Product wizard submit/draft | ✅ |

## Admin
| Feature | Status |
|---------|--------|
| Disputes AF-13/14 | ✅ |
| Refunds AF-15 | ✅ |
| Payout approval AF-16 | ✅ |
| Categories AF-18 | ✅ |
| Editable settings AF-20/21 | ✅ Dual market, FX, COD, zones |
| Moderation approve/reject | ✅ |
| Seller approve/reject | ✅ |
| Flash sale create | ✅ |
| Audit log | ✅ |

## Warehouse
| Feature | Status |
|---------|--------|
| Auto-assign rider suggestion (Δ6) | ✅ |
| Aged parcels WF-11 | ✅ |
| Shift reconciliation WF-12 | ✅ |
| Barcode scanner | ✅ |
| Batch create & assign | ✅ |
| COD remittance | ✅ |

## Rider
| Feature | Status |
|---------|--------|
| Full POD RF-09 | ✅ OTP/photo/COD |
| Failed delivery RF-10 | ✅ |
| COD shift summary RF-11 | ✅ |
| Batch overview RF-07 | ✅ |
| Task history RF-13 | ✅ |
| Availability toggle RF-04 | ✅ |
| First password RF-02 | ✅ |
| Notifications RF-14 | ✅ |
| Mark delivered / Call / Navigate | ✅ |

## Mobile (Flutter CF)
| Feature | Status |
|---------|--------|
| Cart → checkout → success | ✅ |
| Add to cart / buy now | ✅ |
| Cart badge | ✅ |
| Share product (mock) | ✅ |
| Market profiles | ✅ |

## Shared
| Feature | Status |
|---------|--------|
| Dual-market profiles | ✅ france / drc |
| Screen ID registry | ✅ shared/screens/registry.ts |
| Notification context | ✅ All portals |
| Dispute context | ✅ CF/SF/AF |
| Logout redirect | ✅ → /login |
