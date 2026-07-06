# Somba&Teka — Web Platform Screenshots

Full-page screenshots of the Somba&Teka web platform, captured at desktop
resolution (1440×960, 1.5× density) in English. The platform is a single
Next.js app that hosts **five isolated portals** behind one role-based login:

| Portal | Audience | Entry |
| --- | --- | --- |
| **Marketing** | Public visitors | `/` |
| **Shop** | Customers (web storefront) | `/shop` |
| **Seller** | Merchants | `/seller` |
| **Warehouse** | Fulfilment / ops staff | `/warehouse` |
| **Admin** | Platform administrators | `/admin` |
| **Rider** | Delivery riders (web) | `/rider` |

Each role only sees its own portal — signing in as a Warehouse manager cannot
reach `/admin`, a Seller cannot reach `/warehouse`, and so on. All data is
mocked; no backend is required to run the prototype.

Screens live in [`flows/`](./flows). They are numbered so the folder lists in
walk-through order.

---

## 1 · Marketing & sign-in

| Screen | Preview |
| --- | --- |
| Marketing landing | ![Marketing landing](./flows/01-landing.png) |
| Sell online (seller marketing) | ![Sell online](./flows/02-sell-online.png) |
| Get the app | ![Get the app](./flows/03-get-app.png) |
| Portal login (role picker) | ![Portal login](./flows/04-login.png) |

## 2 · Customer shop (web storefront)

| Screen | Preview |
| --- | --- |
| Shop home | ![Shop home](./flows/10-shop-home.png) |
| Categories | ![Categories](./flows/11-shop-categories.png) |
| Product listing | ![Product listing](./flows/12-shop-products.png) |
| Product detail | ![Product detail](./flows/13-shop-product.png) |
| Deals | ![Deals](./flows/14-shop-deals.png) |
| Cart | ![Cart](./flows/15-shop-cart.png) |
| Checkout | ![Checkout](./flows/16-shop-checkout.png) |
| My orders | ![My orders](./flows/17-shop-orders.png) |
| Account | ![Account](./flows/18-shop-account.png) |
| Wishlist | ![Wishlist](./flows/19-shop-wishlist.png) |
| Customer support | ![Customer support](./flows/20-shop-support.png) |
| Shop login | ![Shop login](./flows/21-shop-login.png) |

## 3 · Seller dashboard

| Screen | Preview |
| --- | --- |
| Seller dashboard | ![Seller dashboard](./flows/30-seller-home.png) |
| Products | ![Products](./flows/31-seller-products.png) |
| Create product | ![Create product](./flows/32-seller-product-create.png) |
| Orders | ![Orders](./flows/33-seller-orders.png) |
| Inventory | ![Inventory](./flows/34-seller-inventory.png) |
| Promotions | ![Promotions](./flows/35-seller-promotions.png) |
| Analytics | ![Analytics](./flows/36-seller-analytics.png) |
| Finance | ![Finance](./flows/37-seller-finance.png) |
| Payouts | ![Payouts](./flows/38-seller-payouts.png) |
| Disputes | ![Disputes](./flows/39-seller-disputes.png) |
| Returns | ![Returns](./flows/40-seller-returns.png) |
| Reviews | ![Reviews](./flows/41-seller-reviews.png) |
| Storefront | ![Storefront](./flows/42-seller-storefront.png) |
| Settings | ![Settings](./flows/43-seller-settings.png) |

## 4 · Warehouse / fulfilment portal

| Screen | Preview |
| --- | --- |
| Warehouse dashboard | ![Warehouse dashboard](./flows/50-warehouse-home.png) |
| Inbound | ![Inbound](./flows/51-warehouse-inbound.png) |
| Receiving | ![Receiving](./flows/52-warehouse-receiving.png) |
| Sorting | ![Sorting](./flows/53-warehouse-sorting.png) |
| Inventory | ![Inventory](./flows/54-warehouse-inventory.png) |
| Dispatch | ![Dispatch](./flows/55-warehouse-dispatch.png) |
| Batch builder | ![Batch builder](./flows/56-warehouse-batch-builder.png) |
| Deliveries | ![Deliveries](./flows/57-warehouse-deliveries.png) |
| Riders | ![Riders](./flows/58-warehouse-riders.png) |
| Rider detail — vehicle admin (edit vehicle & compliance) | ![Rider detail](./flows/59-warehouse-rider-detail.png) |
| Returns | ![Returns](./flows/60-warehouse-returns.png) |
| Exceptions | ![Exceptions](./flows/61-warehouse-exceptions.png) |
| Transfers | ![Transfers](./flows/62-warehouse-transfers.png) |
| Analytics | ![Analytics](./flows/63-warehouse-analytics.png) |

## 5 · Admin console

| Screen | Preview |
| --- | --- |
| Admin dashboard | ![Admin dashboard](./flows/70-admin-home.png) |
| Orders | ![Orders](./flows/71-admin-orders.png) |
| Products | ![Products](./flows/72-admin-products.png) |
| Sellers | ![Sellers](./flows/73-admin-sellers.png) |
| Customers | ![Customers](./flows/74-admin-customers.png) |
| Categories | ![Categories](./flows/75-admin-categories.png) |
| Finance | ![Finance](./flows/76-admin-finance.png) |
| Payouts | ![Payouts](./flows/77-admin-payouts.png) |
| Disputes | ![Disputes](./flows/78-admin-disputes.png) |
| Fraud | ![Fraud](./flows/79-admin-fraud.png) |
| Moderation | ![Moderation](./flows/80-admin-moderation.png) |
| Marketing | ![Marketing](./flows/81-admin-marketing.png) |
| Flash sales | ![Flash sales](./flows/82-admin-flash-sales.png) |
| Analytics | ![Analytics](./flows/83-admin-analytics.png) |
| Zones | ![Zones](./flows/84-admin-zones.png) |
| Warehouses | ![Warehouses](./flows/85-admin-warehouses.png) |
| Roles & access | ![Roles & access](./flows/86-admin-roles.png) |
| Settings | ![Settings](./flows/87-admin-settings.png) |

## 6 · Rider portal (web)

| Screen | Preview |
| --- | --- |
| Rider dashboard | ![Rider dashboard](./flows/90-rider-home.png) |
| Tasks | ![Tasks](./flows/91-rider-tasks.png) |
| History | ![History](./flows/92-rider-history.png) |
| Profile | ![Profile](./flows/93-rider-profile.png) |

---

_Both English and French are supported everywhere via the EN/FR toggle in the
top bar; these captures use English. Regenerate with the Playwright harness in
the project scratchpad against a local `next dev` server._
