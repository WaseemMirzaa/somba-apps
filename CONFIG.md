# Somba&Teka — Configuration Record

All questionnaire answers applied to the prototype.

## 1. Brand & Market

| Setting | Value |
|---------|-------|
| Brand | **Somba&Teka** (`web/src/lib/config.ts`) |
| Market | France + Global |
| Languages | EN + FR together (toggle on all portals) |
| Currency | USD (mock) |
| Legal entity | Somba Commerce SAS — Paris (Flipkart-style footer & `/legal/*`) |

## 2. Business Model

| Setting | Value |
|---------|-------|
| Inventory | Seller-owned marketplace |
| Fulfillment | Hybrid (seller + platform warehouse) |
| Cross-city delivery | Allowed at checkout |
| Open Box Delivery | Required — checkout + rider flows |
| Commission | Category-tiered (8–15%) + seller tier discounts |

## 3. Payments

| Method | Status |
|--------|--------|
| Stripe card | Mock at checkout |
| COD | OTP verification, limits, address blocking |
| Airtel Money | Checkout + wallet top-up |
| Somba&Teka Wallet | Store credit, top-up, transaction history |
| Refunds | Original method OR wallet |

## 4. Auth & Roles

| Feature | Route / File |
|---------|--------------|
| Persona login | `/login` — 11 personas (customer, seller, admin sub-roles, warehouse, rider) |
| Guest checkout | Enabled on `/shop/checkout` |
| Sub-admin roles | Operations, Finance, Support, Marketing, Moderation, Warehouse — `/admin/roles` |

## 5. Portals (78 web routes)

### Customer Shop
Home, search, categories, PDP (Q&A + reviews), cart, checkout (4-step), wallet, refer, wishlist, orders, return, exchange, support, guest flow

### Seller (28 routes)
7-step product wizard, health badges, payout request form, promotions, finance, analytics

### Admin (22 routes)
Moderation, fraud/COD risk, flash sales (date picker), CMS blocks, roles, audit log, finance, marketing

### Warehouse (27 routes)
Multi-hub (`/warehouse/hubs`), batch builder, barcode scanner (camera sim), COD shift reconciliation

### Rider Web
`/rider/*` — tasks, earnings, profile

### Rider Flutter (separate app)
`rider-app/` — tasks, mock maps, COD, open box, earnings, dark mode

## 6. Technical

| Item | Choice |
|------|--------|
| Monorepo | `web/`, `api/`, `mobile/`, `rider-app/`, `shared/` |
| Mock API | NestJS on port 3001 |
| Shared types | `shared/types/index.ts` |
| Database (later) | MySQL |
| Auth (later) | JWT + OAuth |

## 7. Design

- Bluish premium theme + **dark mode** toggle
- Mobile-first dashboards
- Mock logo (replace when assets provided)
- Formal French (vous) — product content bilingual EN/FR

## Run

```bash
npm run dev          # web :3000 + api :3001
npm run dev:mobile   # customer Flutter app
npm run dev:rider    # rider Flutter app
```

Login: http://localhost:3000/login
