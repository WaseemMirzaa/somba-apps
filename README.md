# Somba&Teka — Marketplace Prototype

Flipkart-style mocked marketplace across **Customer (CF)**, **Seller (SF)**, **Admin (AF)**, **Warehouse (WF)**, and **Rider (RF)** portals. Mock data only — no real backend, payments, or push notifications.

## Stack

| Layer | Technology |
|-------|------------|
| Web (all portals) | Next.js 16, Tailwind CSS, TypeScript |
| API (Mock) | NestJS |
| Customer mobile | Flutter (`mobile/`) |
| Rider mobile | Flutter (`rider-app/`) |
| Shared contracts | `shared/` — market profiles, screen registry, mock entities |

## Dual-market profiles

Set `NEXT_PUBLIC_MARKET_PROFILE=france` (Paris demo, USD) or `drc` (Kinshasa/Lubumbashi, USD+CDF). Toggle in the web header.

## Portals

| URL | Portal |
|-----|--------|
| `/` | Landing |
| `/shop` | Customer (CF) |
| `/seller` | Seller (SF) |
| `/admin` | Admin (AF) |
| `/warehouse` | Warehouse (WF) |
| `/rider` | Rider (RF) |

## Quick Start

```bash
# Web (port 3000)
cd web && npm install && npm run dev

# Mock API (port 3001)
cd api && npm install && npm run start:dev

# Customer mobile
cd mobile && flutter pub get && flutter run

# Rider app
cd rider-app && flutter pub get && flutter run
```

## Spec & coverage

- Screen IDs and Δ9/Δ10 additions: [`docs/SOMBA-FEATURE-SCREEN-SPEC.md`](docs/SOMBA-FEATURE-SCREEN-SPEC.md)
- Screen registry: [`shared/screens/registry.ts`](shared/screens/registry.ts)
- Feature checklist: [`NON_FUNCTIONAL.md`](NON_FUNCTIONAL.md)

## Status

All plan phases (0–7) implemented on web with mock state. Flutter customer and rider apps cover core purchase and delivery flows. See `NON_FUNCTIONAL.md` for per-feature status.
