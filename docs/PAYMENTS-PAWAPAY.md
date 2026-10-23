# Mobile money with pawaPay

pawaPay (API v2) handles three money movements in the DRC: **collections** (customers pay orders, top-ups and seller plans from Airtel Money, Orange Money or M-Pesa), **refunds back to the paying phone**, and **seller payouts** to a mobile-money number. The adapter is built and unit-tested against pawaPay's documented API. It switches on when the API token is set; until then the platform keeps using the sandbox (development) or refuses mobile money (production), exactly as before.

Code: `api/src/payments/pawapay.provider.ts` (client and provider), `payments.service.ts` (state machine, refunds, callbacks), `payouts/payouts.service.ts` (payouts), `payments.controller.ts` (callback URL).

## Switching it on

Set these on the API server and restart:

| Variable | Value |
|---|---|
| `MM_PROVIDER` | `pawapay` |
| `PAWAPAY_API_TOKEN` | The API token from the pawaPay dashboard (sandbox token for the sandbox) |
| `PAWAPAY_BASE_URL` | `https://api.sandbox.pawapay.io` (default) or `https://api.pawapay.io` for live money |
| `PAWAPAY_CURRENCY` | `USD` (default) or `CDF` |
| `PAWAPAY_FX_RATE` | CDF per USD, only when charging in CDF (CDF amounts are whole numbers) |
| `PAWAPAY_VERIFY_SIGNATURES` | `true` to verify signed callbacks. On by default in production; turn on **Signed callbacks** in the dashboard first. |

With `MM_PROVIDER=pawapay` but no token, mobile money is off (fail closed) and the API logs a warning.

**Callback URL.** In the pawaPay dashboard set the deposit, refund **and** payout callback URLs to:

```
https://<your-api-host>/api/v1/payments/webhook/pawapay
```

## How each flow works

Networks map to pawaPay providers: `airtel_money` → `AIRTEL_COD`, `orange_money` → `ORANGE_COD`, `vodacom_mpesa` → `VODACOM_MPESA_COD`. Phone numbers are sent as digits with the country code (`+243 81 234 5678` and `0812345678` both become `243812345678`). Amounts are sent the way pawaPay requires: `12.5`, never `12.50`.

**Collections.**

1. Checkout (or a top-up) creates a payment and calls `POST /v2/deposits` with a new `depositId` (stored as the payment's `providerRef`) and our payment reference as `clientReferenceId`. The customer approves on their phone.
   * `REJECTED` → the payment fails with pawaPay's reason, and the customer can try again.
   * `DUPLICATE_IGNORED` (a retry of ours) counts as accepted.
   * No answer (timeout or 5xx) → the payment stays **pending** and is checked later, because the deposit may exist.
2. pawaPay calls the callback URL.
   * The signature is verified when signatures are on.
   * Then the API **always reads the deposit's real status** with `GET /v2/deposits/{id}` before anything changes, so a forged callback can do nothing.
   * `COMPLETED` → paid (an amount mismatch is never accepted: finance is alerted). `FAILED` → failed with the network's reason.
3. Missed callbacks are caught up:
   * every minute, pending payments older than two minutes are checked with pawaPay;
   * when a customer looks at a pending payment (`payments:status`), it is checked on the spot;
   * a payment is only expired (after 15 minutes) if pawaPay still hasn't completed it. A late success after that goes to the wallet, as before.

**Refunds to the phone.** In the admin portal, the refund dialog (Refunds page or an order) offers *Customer's wallet* (instant, the default) or *The phone that paid*.

* The phone option is enabled for mobile-money payments while pawaPay is connected.
* A phone refund calls `POST /v2/refunds` for the outstanding amount. Lines a seller already refunded are never paid twice.
* The payment shows *refunded · to phone · sending* until pawaPay confirms:
  * `COMPLETED` → *completed*, and the customer is told "sent to your mobile-money number".
  * `FAILED` → the amount is credited to the customer's **wallet** instead (once), the customer is told, and finance gets a "Phone refund failed" alert.
  * If pawaPay refuses outright (e.g. the deposit cannot be refunded), nothing changes and the admin sees why, so they can refund to the wallet.

**Seller payouts.**

* Payouts are one step: *requested* → *paid* (or *rejected*); the old *approved* status is gone (the migration moves any such row back to *requested*).
* For a mobile-money payout the admin Payouts page shows **Send with pawaPay**:
  1. The API finds the phone number in the seller's payout details and asks pawaPay for its network (`POST /v2/predict-provider`).
  2. It sends `POST /v2/payouts`. The payout is *Being sent* until pawaPay confirms.
     * `COMPLETED` → *paid*, with the network receipt (`receiptRef`); the seller is told.
     * `FAILED` → back to *requested* with the reason in its note, and finance is alerted.
* *Paid by hand* (enter the transfer reference) still works for any payout.

Finance → the top of the page says which provider is live (pawaPay, manual, sandbox or off).

## Signed callbacks

pawaPay signs callbacks with RFC 9421 HTTP message signatures (`ecdsa-p256-sha256`). The API checks that:

1. `Content-Digest` (SHA-512) matches the raw body;
2. the signature has not expired;
3. the signature verifies over `@method`, `@authority`, `@path`, `signature-date`, `content-digest` and `content-type`, against pawaPay's public key (`GET /v2/public-key/http`, cached for an hour).

Behind a proxy, `@authority` is taken from `X-Forwarded-Host` when present.

## Testing in the sandbox (once the token is set)

1. `MM_PROVIDER=pawapay`, the sandbox token, and the callback URL pointing at a public HTTPS address for your API (for a local API, use a tunnel).
2. Place an order with Airtel / Orange / M-Pesa and one of pawaPay's sandbox test numbers. Their docs list numbers that complete, fail or time out per provider.
3. Watch the payment go *pending* → *succeeded* (or *failed* with the reason) on the order and in Finance.
4. Refund it to the phone from the admin portal; it goes *sending* → *completed*.
5. Have a seller request a mobile-money payout with a sandbox number; *Send with pawaPay* → *Being sent* → *Paid* with a receipt.

## Going live

* Switch `PAWAPAY_BASE_URL` to `https://api.pawapay.io` and use the live token.
* Turn on signed callbacks in the dashboard (and keep `PAWAPAY_VERIFY_SIGNATURES` on).
* Confirm which currency your pawaPay account is enabled for per provider (USD or CDF), and set `PAWAPAY_CURRENCY` / `PAWAPAY_FX_RATE` accordingly.
* Fund the pawaPay wallet used for payouts and refunds.

## Tests

`api/src/payments/pawapay.provider.spec.ts`:

* amount and phone formats;
* deposit request body;
* rejected and unanswered deposits;
* status mapping;
* callback routing;
* signature verification with a generated P-256 key (valid, tampered body, wrong path, expired, missing).

`payments.service.spec.ts`: phone refunds (sent, completed, failed → wallet once, refused → undone).

`payouts/payouts-pawapay.spec.ts`: send → paid with receipt, failed → back in the queue, refused → undone, guards.
