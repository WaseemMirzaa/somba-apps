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
| Order detail (CF-23) | ✅ |
| Live tracking map (CF-24) | ✅ Mock map + per-parcel groups (MF-2) |
| Multi-seller fulfilment groups (MF-2) | ✅ ORD-2024-002 split parcels |
| Reorder | ✅ |
| Returns list (CF-26L) | ✅ ReturnContext |
| Return status (CF-26) | ✅ |
| Return wizard → detail | ✅ |
| Disputes list (CF-30L) | ✅ |
| Dispute detail (CF-30) | ✅ |
| Support tickets (CF-35) | ✅ SupportContext |
| Support ticket detail (CF-35D) | ✅ |
| Wallet transaction detail (CF-32D) | ✅ |
| Address form (CF-21) | ✅ /shop/account/addresses/new |
| Account menu disputes label | ✅ |
| Auth stack CF-13–18 | ✅ |
| Notifications CF-29 | ✅ |
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
| Order detail SF-08 | ✅ Warehouse hub cross-link |
| Shipping → parcel/hub links | ✅ |
| Flag unavailable SF-12 | ✅ |
| Disputes SF-19/20 | ✅ Order cross-links |
| Returns / replacements detail | ✅ |
| Reviews detail (SF-REV) | ✅ |
| Finance transactions (SF-TXN) | ✅ |
| Finance statements detail | ✅ |
| Payout detail + linked txns | ✅ Cancel/reject CTAs |
| Promotions pause/edit | ✅ |
| Support list + detail (SF-13/14) | ✅ SupportContext |
| Notifications SF-18 | ✅ |
| Request payout CTAs | ✅ |
| CSV import/export | ✅ |
| Product wizard submit/draft | ✅ |

## Admin
| Feature | Status |
|---------|--------|
| Order detail (AF-02) | ✅ Warehouse resolve link |
| Customer / seller / product detail | ✅ |
| Warehouse detail (AF-06) | ✅ |
| Disputes AF-13/14 | ✅ |
| Refunds AF-15 + detail | ✅ |
| Payout approval AF-16 + detail | ✅ |
| Returns detail (AF-RET) | ✅ |
| Fraud alert detail (AF-FRD) | ✅ |
| Category detail (AF-CAT) | ✅ |
| Role detail (AF-ROL) | ✅ |
| Support list + detail (AF-SUP) | ✅ SupportContext |
| Marketing / flash-sale / CMS detail | ✅ |
| Finance overview + txn detail (AF-10) | ✅ |
| Audit log + entry detail (AF-07/08) | ✅ Entity deep-links |
| Categories AF-18 | ✅ |
| Editable settings AF-20/21 | ✅ Dual market, FX, COD, zones |
| Moderation approve/reject | ✅ |
| Seller approve/reject | ✅ |
| Flash sale create | ✅ |
| Dashboard payout link | ✅ /admin/payouts |

## Warehouse
| Feature | Status |
|---------|--------|
| Parcel detail (WF-01) | ✅ |
| Dispatch / delivery / exception detail | ✅ |
| Hub detail (WF-13D) + nav | ✅ |
| Batch detail (WF-BATCH) | ✅ BATCH-002 links fixed |
| Shift reconciliation + detail | ✅ |
| Aged parcels → parcel detail | ✅ |
| Rider / inventory / COD / replacement detail | ✅ |
| Auto-assign rider suggestion (Δ6) | ✅ |
| Aged parcels WF-11 | ✅ |
| Shift reconciliation WF-12 | ✅ |
| Barcode scanner | ✅ |
| Batch create & assign | ✅ |
| COD remittance | ✅ |

## Rider
| Feature | Status |
|---------|--------|
| Task detail (RF-03) | ✅ Batch + order links |
| Full POD RF-09 | ✅ OTP/photo/COD |
| Failed delivery RF-10 | ✅ |
| COD shift summary RF-11 | ✅ |
| Batch overview RF-07 | ✅ Data-driven |
| Task history RF-13 | ✅ |
| Availability toggle RF-04 | ✅ |
| First password RF-02 | ✅ |
| Notifications RF-14 | ✅ |
| Mark delivered / Call / Navigate | ✅ |
| Delivery mock live map | ✅ |

## Mobile (Flutter CF)
| Feature | Status |
|---------|--------|
| Cart → checkout → success | ✅ |
| Add to cart / buy now | ✅ |
| Cart badge | ✅ |
| Share product (mock) | ✅ |
| Market profiles | ✅ |
| Detail-screen parity (P0–P3) | ⏳ Out of scope this phase |

## Shared
| Feature | Status |
|---------|--------|
| Dual-market profiles | ✅ france / drc |
| Screen ID registry | ✅ shared/screens/registry.ts (core + detail routes) |
| Return context | ✅ Shop returns |
| Support context | ✅ CF / SF / AF portals |
| Notification context | ✅ All portals |
| Dispute context | ✅ CF/SF/AF |
| Audit entity resolver | ✅ resolveAuditEntityHref |
| Logout redirect | ✅ → /login |
