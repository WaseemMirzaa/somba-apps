# VAT and who pays the delivery fee (contract)

Round 5, workstream W1. Migration `api/src/database/migrations/1793560000001-VatAndFeePayer.ts`. Pure rules:
`api/src/orders/vat.ts` (server), `web/src/lib/vat.ts` (web shop), `mobile/lib/util/cart_totals.dart` (customer app). The three
run the same arithmetic; the order the server places is always authoritative.

## 1. Settings (admin, Settings > "VAT and delivery fee")

All four are **public** (every client reads them from `settings:get` / `settings:updated`; a server that never stored them says the
default). Validation errors have French in `api/src/common/error-fr-*` and the web `api-errors.ts` / `seller-errors.ts`.

| key | values | default | meaning |
| --- | --- | --- | --- |
| `vatEnabled` | `true` / `false` | `false` | `false`: no VAT is charged or shown anywhere. A deploy changes nothing until an admin turns it on. |
| `vatPct` | 0 to 50 | `16` | The VAT % of a category that sets none. |
| `deliveryFeePaidBy` | `customer` / `seller` | `customer` | Who pays the delivery fee (the "Platform commission" line today). |
| `showPlatformFee` | `true` / `false` | `true` | Customer pays the fee: show it as its own line, or fold it into the Total (see 4). |

Categories: `categories.vatPct` (float, NULL = the default `vatPct`, 0 is a real rate, 0 to 50). Written by `categories:create` /
`categories:update` (`vatPct: null | '' ` clears it). Unlike `commissionPct` it is **visible to customers** (served on `categories:list`
for every role). Admin Categories shows a "VAT (%)" field and a badge.

## 2. Order math (`orders:create`, authoritative)

Per line, with `value = price x qty` (flash / campaign prices are already in `price`; coupons come first):
* the line's discount share is its store-coupon share when a store coupon applies, else the order's `discountUsd` spread over the
  lines by value (whole cents, largest remainder, so shares add up);
* `vatPct` = 0 while `vatEnabled` is false, else the category rate (NULL -> default `vatPct`); frozen on the line (`order_items.vatPct`);
* `vatUsd = round2((value - discount share) x vatPct / 100)`, stored on the line; `orders.vatUsd` is their sum;
* `total = subtotal - discount + vatUsd + (deliveryFeePaidBy = 'customer' ? deliveryFeeUsd : 0)`.
* `orders.deliveryFeePaidBy` snapshots the setting; later changes never rewrite an order. When the **seller** pays, the fee is split
  over the lines by value (whole cents) into `order_items.sellerFeeUsd`; `orders.deliveryFeeUsd` still holds the whole fee (platform
  revenue in analytics).
* Client-priced (`ext:`) lines, used in dev only, get the default rate.

Old rows read as `vatPct 0`, `vatUsd 0`, `sellerFeeUsd 0`, `deliveryFeePaidBy 'customer'`: their totals, refunds and payouts are unchanged.

## 3. What each role is sent

**Customer** (`orders:*`, `order:created` / `order:updated`, via `customerViews`): `vatUsd`, `items[].vatPct`, `items[].vatUsd`, and
* `platformFeeUsd` and `deliveryFeeUsd`: the fee the customer pays; **0 when the seller pays** (old app builds then add up too);
* `feePaidBySeller: boolean`; `showFee: boolean` (false when the seller pays, or `showPlatformFee` is off).
`items[].sellerFeeUsd` and `commissionUsd` / `commissionPct` are removed (the seller's business).

**Listings** (`products:*`, `product:*`): `vatPct` (number): the rate the customer will be charged on the product, 0 while VAT is off.
Clients compute the cart estimate from it (`delivery:quote` carries no lines); the order is authoritative.

**`delivery:quote`**: adds `feePaidBySeller` and `showFee`. For customers, guests and sellers `feeUsd` and `platformFeeUsd` are 0 when
the seller pays; staff and admins keep the real fee.

**Seller** (`orders:sellerList` view): `deliveryFeeUsd` = the fee share on their live lines (0 unless the seller pays); `items[].sellerFeeUsd`.
VAT is never sent as the seller's money and never enters seller totals.

## 4. Customer display rules (cart, checkout, payment, order, receipt; web and app)

* One summed row "VAT" / "TVA" between the discount and the fee, only when `vatUsd > 0`.
* `feePaidBySeller`: no fee row at all. Total = goods - discount + VAT.
* customer pays and `showFee`: the "Platform commission" row as before ("Free" for 0).
* customer pays and not `showFee`: no fee row; the label is "Total (incl. delivery)" / "Total (livraison incluse)". The fee is charged all the same.

## 5. Refunds carry the VAT

* Seller-cancelled lines (`orders.cancelLines`) refund `price x qty - promo share + the line's vatUsd`; the line's `refundedUsd` records both.
* Return / dispute refunds (`PartialRefundService.worth`, `DisputesService.returnedValue`) add the VAT of the returned units
  (`vatShareUsd`: the line's `vatUsd` x units' share of the line). The cap on each line is price x qty + `vatUsd` less `refundedUsd`.
* Whole-order refunds and cancellations pay back what is left on the payment, which includes the VAT.
* `linePaidUsd` (`payouts/line-refund.ts`), the base of "the refunded share of a line", is price x qty - promo share + `vatUsd`, in
  TypeScript and in `SQL_PAID`. VAT is not seller revenue, so the share only scales the seller's gross, commission and fee.

## 6. Seller money (the delivery fee)

A seller-paid fee is deducted like the commission, line by line (`order_items.sellerFeeUsd`):
* `net = gross - commission - sellerFeeUsd - refunded share`; a refunded share of a line gives back the same share of its fee
  (`lineRefund().deliveryFeeUsd`), exactly like the commission.
* `finance:earnings` lines add `deliveryFeeUsd`; `payouts:available` adds `deliveryFeeUsd` (deducted from `earned`).
* Statements (`finance:statements`): lines and totals add `deliveryFeeUsd` and `deliveryFeeCreditedUsd`; transactions rows add
  `deliveryFeeUsd`. CSV files add a "Delivery fee USD" column and total **only when a seller-paid order is in the file**, so every
  other file is byte-identical to before.
* Payout statements (`payouts:statement`): `payout_statement_lines.deliveryFeeUsd`; `totals.deliveryFeeUsd`; `netUsd` already
  deducts it.
* The commission invoice PDF adds "Delivery fees charged" / "credited" rows and a "TOTAL DUE" when a fee was charged.
* Lines cancelled by the seller or whole cancelled orders carry no fee (they are outside the seller's earnings). The platform does not
  recover the fee share of a cancelled line from the other sellers.
* Analytics: GMV and delivery-fee revenue keep reading `orders.totalUsd` / `orders.deliveryFeeUsd`, so the fee stays platform revenue
  whoever pays it; GMV now includes VAT (it is what customers paid).

## 7. Not in this workstream

Wallet-switch behaviour (W4), SOM->KOM references (W2). `delivery:quote` is not given the cart lines.
