# Somba&Teka API

NestJS + TypeORM (MySQL) backend powering the **Admin console** and the
**Seller** flow. JWT auth with role-based access, file uploads, and a seeded
demo dataset.

## Stack

- **NestJS 11** (Express)
- **TypeORM** + **MySQL 8** (`mysql2`)
- **JWT** auth (`@nestjs/jwt` + Passport) with a `RolesGuard`
- **Swagger** docs at `/api/docs`
- **Multer** disk uploads — one base dir, a different sub-path per context

## Quick start

```bash
cd api
cp .env.example .env            # adjust DB creds if needed

# 1. MySQL (Docker) — or point .env at your own MySQL
docker compose up -d mysql

# 2. Install + seed + run
npm install
npm run seed                    # creates schema (synchronize) + demo data
npm run start:dev               # http://localhost:3001  ·  docs: /api/docs
```

Seeded logins (password from `SEED_PASSWORD`, default `password123`):

| Role | Email |
| --- | --- |
| Super admin | `admin@somba.com` |
| Finance admin | `finance@somba.com` |
| Moderator | `mod@somba.com` |
| Seller (Gold) | `gombe@somba.com` |
| Seller (pending) | `pending@somba.com` |

```bash
# Log in and call an admin endpoint
TOKEN=$(curl -s localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@somba.com","password":"password123"}' | jq -r .accessToken)

curl -s localhost:3001/api/admin/dashboard -H "Authorization: Bearer $TOKEN" | jq
```

## Auth

- `POST /api/auth/login` → `{ accessToken, user }`
- `POST /api/auth/register/customer` → self-register as a shopper
- `POST /api/auth/register/seller` → self-register (status **pending**, admin approves)
- `GET /api/auth/me`
- Send `Authorization: Bearer <token>`. Routes are guarded by role
  (`@Roles`); admin routes accept any admin sub-role.

Seeded customer login: `marie@mail.com` (password from `SEED_PASSWORD`).

## Catalog (public — powers the customer mobile app)

`GET /api/catalog/categories` (with product counts), `products` (browse +
`category`/`q`/`seller`/`sort`/`page`/`limit`), `deals`, `featured`,
`products/:id`, `products/:id/related`, `products/:id/reviews`, `stores`,
`stores/:slug`. All products carry EN + FR fields (`name`/`nameFr`,
`description`/`descriptionFr`, bilingual `specs`).

## Customer endpoints (`/api/customer/...`, role `customer`)

`me` (get/update), `addresses` (CRUD), `favorites` (list/add/remove wishlist),
`orders` (checkout `POST`, list, detail), `products/:id/reviews` (write a
review), `coupons` (list active + `coupons/validate`). Checkout computes
per-item commission/net and applies a coupon; placing an order bumps each
product's sold count.

## Seller endpoints (`/api/seller/...`, role `seller`)

`profile`, `dashboard`, `products` (CRUD + submit for review + images),
`orders` (+ per-item fulfilment status), `promotions` (CRUD),
`finance` (balance, payouts request/list, transactions).

## Admin endpoints (`/api/admin/...`, admin roles)

`dashboard`, `sellers` (approve/suspend/reject/edit), `products`
(approve/reject moderation), `orders` (+ status), `categories` (CRUD),
`finance` (payouts approve/mark-paid/reject), `promotions` (platform flash
sales), `disputes` (resolve/reject), `audit` (log).

## File uploads — one env, different paths

All uploads live under a **single** base directory (`UPLOAD_DIR`); each context
just picks a different **sub-path**:

```
UPLOAD_DIR=./uploads
  products     -> ./uploads/products
  seller-kyc   -> ./uploads/seller-kyc
  seller-logo  -> ./uploads/seller-logo
  promotions   -> ./uploads/promotions
  disputes     -> ./uploads/disputes
```

`POST /api/uploads/:context` (multipart `file`) → `{ id, url }`. Files are served
statically from `UPLOAD_PUBLIC_PREFIX` (default `/uploads`).

## Config (`.env`)

See [`.env.example`](.env.example) — DB connection, `JWT_SECRET`, `UPLOAD_DIR`,
`SEED_PASSWORD`. `DB_SYNCHRONIZE=true` auto-creates tables in dev; use
migrations in production.
