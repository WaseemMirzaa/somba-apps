# Somba & Teka Feature Screen Spec — Δ9 & Δ10 Additions

Reconciles prototype-only flows with the build contract (2026-06-08).

## Δ9 — Codebase flows codified

| ID | Screen | Route |
|----|--------|-------|
| CF-32 | Somba & Teka Wallet | `/shop/wallet` |
| CF-33 | Refer & Earn | `/shop/refer` |
| CF-34 | Exchange Request | `/shop/exchange` |
| CF-35 | Support Ticket | `/shop/support` |
| CF-36 | Flash Deals Hub | `/shop/deals` |
| SF-23–27 | Subscription, Shipping, Replacements, Promotions, Support | `/seller/*` |
| WF-13–15 | Hubs, Exceptions, Exchanges | `/warehouse/*` |
| AF-25–27 | Fraud, Moderation, Flash Sales | `/admin/*` |

**Flows:** Open-box delivery, cross-city delivery, product Q&A.

## Δ10 — Flipkart parity (v1 UI)

- Pincode / zone delivery checker (CF-08)
- Recently viewed + Buy again (CF-02 / CF-04)
- Rich PLP filters (brand, rating, discount %, price)
- Search autocomplete (CF-05)
- Share product (CF-08)
- Payment failure retry (CF-11 / MF-5)
- Per-parcel tracking map (CF-24)

## Dual-market profiles

- `france` — Paris demo, USD only
- `drc` — Kinshasa/Lubumbashi, USD+CDF (Δ3, Δ8)

Set via header switcher or `NEXT_PUBLIC_MARKET_PROFILE=drc`.

## Screen registry

See `shared/screens/registry.ts` for CF/SF/AF/WF/RF ID → route mapping (web + Flutter).
