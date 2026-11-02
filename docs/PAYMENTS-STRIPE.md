# Bank cards with Stripe

Customers can pay an order with a bank card. The phone opens **Stripe's PaymentSheet**, so the card number goes from the phone straight to Stripe over TLS and never reaches our server or our apps (PCI scope SAQ A). The API only handles PaymentIntent ids. Refunds can go back to the same card.

Mobile money (Airtel, Orange, M-Pesa) is separate and runs through pawaPay: see `docs/PAYMENTS-PAWAPAY.md`.

Code: `api/src/payments/stripe.config.ts` (the configuration rule), `stripe.provider.ts` (client and factory), `payments.service.ts` (card flow, webhook, expiry, refunds), `payments.controller.ts` (webhook URL), `deploy/set-secret.sh` (putting keys on the server).

## What the client needs to do (once)

1. Create a Stripe account and complete the business verification (needed for live mode, not for test mode).
2. In the dashboard, **Developers → API keys** (test mode first): note the **publishable key** (`pk_test_…`).
3. Create a **restricted key** (below) and send us its value in a safe way (see *Sending the keys to us*).
4. Create a **webhook endpoint** (below) and send us its **signing secret** (`whsec_…`) the same safe way.
5. Do steps 2 to 4 again in **live mode** when we are ready to go live. Test and live keys are different sets; never mix them.

## The three values the API needs

| Variable | Format | What it is |
|---|---|---|
| `STRIPE_SECRET_KEY` | `rk_test_…` / `rk_live_…` (restricted, recommended) or `sk_test_…` / `sk_live_…` | The server's key. **Server only**, never in an app, in git, or in a log. |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_…` / `pk_live_…` | Public by design. It is not compiled into the app: the server hands it out with each payment, so it can be rotated without an app release. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | Signing secret of the webhook endpoint. |
| `STRIPE_PENDING_TTL_MIN` | number, default `30` | Minutes before an unpaid card payment is cancelled. |

**Card payments are on only when all three keys are present, well formed and in the same mode** (all test or all live). Otherwise the card option is off: the apps do not offer it (`settings:get` says `cardPayments: "off"`), and production refuses a card order. The boot log says which: `Card payments are ON (Stripe test mode, secret key …abcd)` shows only the mode and the last 4 characters; `Card payments are OFF: …` lists what is missing or wrong (variable names, never values). Test keys on a production server work but print a loud warning, because no real money moves.

### Recommended: a restricted key

A restricted key can only do what we give it, so a leak is far less harmful than with a full `sk_` key. In the dashboard: **Developers → API keys → Create restricted key**. Name it `Somba API`. Give it exactly:

| Resource | Permission | Why |
|---|---|---|
| PaymentIntents | **Write** | create, read and cancel the payment of an order |
| Charges and Refunds | **Write** | refund to the card, and read the refund's status |
| everything else | **None** | |

If a call fails with a permission error, the API log says which one; add only that permission. (Stripe's dashboard may name the groups slightly differently; the two resources above are what the code calls: `paymentIntents.create / retrieve / cancel` and `refunds.create / retrieve`.)

### The webhook endpoint

**Developers → Webhooks → Add endpoint**:

* URL: `https://<api-host>/api/v1/payments/webhook/stripe`
* Events (exactly these six):
  1. `payment_intent.succeeded`
  2. `payment_intent.payment_failed`
  3. `payment_intent.canceled`
  4. `charge.refunded`
  5. `refund.updated`
  6. `refund.failed`

Reveal the **signing secret** (`whsec_…`) of that endpoint: that is `STRIPE_WEBHOOK_SECRET`. Test mode and live mode each have their own endpoint and secret.

The API verifies the signature over the raw body with a 5-minute tolerance (a bad or missing signature gets `401`), then **reads the PaymentIntent or Refund from Stripe again** before anything changes, so a forged or replayed event can do nothing. An event for something that is not ours is acknowledged and ignored.

## How a card payment works

1. `orders:create` with `paymentMethod: "stripe_card"` creates the order `pending` and a payment `pending`. The API creates a PaymentIntent: **amount = the order total in cents (USD), computed by the server**, `card` only, metadata `{ reference, orderReference, purpose, userId }`, idempotency key `pi-<payment reference>`. The PaymentIntent id is stored as the payment's `providerRef`. The client secret is **never stored** and never logged. The customer is told "Complete the card payment to confirm <ref>."
2. The app asks `payments:card-sheet` with `{ orderId }` or `{ reference }` and gets `{ reference, clientSecret, publishableKey, amountUsd, currency: "usd", merchantName: "Somba & Teka" }` for its **own** pending card payment only. Errors: `Payment not found.` (unknown or not yours), `This payment is not waiting for a card.`, `Card payments are not available.`
3. The customer pays in the sheet. Stripe calls the webhook:
   * `payment_intent.succeeded` → the payment is `succeeded` and the order is confirmed and goes to fulfilment. The amount Stripe **received** must equal what we asked for, in USD; otherwise the payment is never marked paid and finance gets a "Payment amount mismatch" alert.
   * `payment_intent.payment_failed` → **not final**: the customer can try another card in the same sheet. Only the reason is recorded (`failureReason` on the pending payment).
   * `payment_intent.canceled` → the payment fails, the order is cancelled and the stock goes back.
4. Missed webhooks are caught up: every minute the API checks pending card payments older than two minutes, and `payments:status` checks on the spot.
5. A card nobody completes within `STRIPE_PENDING_TTL_MIN` (default 30) is **cancelled at Stripe** and the order is cancelled. If Stripe says it was paid after all, it is settled as paid instead. A success that arrives after we gave up goes to the customer's wallet, like a late mobile-money approval. Cancelling an unpaid order cancels its PaymentIntent too.

Finance cannot confirm a card payment by hand (`payments:confirm` is refused): only Stripe can.

## Refunds to the card

In the admin refund dialog, "back to the original method" (`toWallet: false`) means the phone for pawaPay mobile money and **the card** for a Stripe payment. The payment view carries `refundToOriginal: "phone" | "card" | null` so the admin can label it.

* The refund is recorded at once (`refundTo: "card"`, `refundStatus: "sending"`) and a Stripe refund is created for the amount still refundable (idempotent). Stripe's webhook or the minute sweep confirms it: `succeeded` → completed and the customer is told "sent back to your card".
* If Stripe **fails or cancels** the refund, the amount is credited to the customer's **wallet** (once), the ledger says wallet, the customer is told, and finance gets a "Card refund failed" alert.
* If Stripe **refuses** at once (for example the charge was already refunded), nothing is recorded and the admin sees why, so they can refund to the wallet.
* If Stripe **does not answer**, the refund stands as `sending` and the sweep asks again with the same idempotency key.
* Partial refunds (returns, disputes) follow the same rule. Cancellations and a seller cancelling lines refund the wallet, as for mobile money. Anything that cannot go back to the card falls back to the wallet, explicitly.

## Testing in test mode

1. Use test keys (`rk_test_`/`sk_test_`, `pk_test_`) and a test-mode webhook endpoint. For a laptop, use the Stripe CLI: `stripe listen --forward-to localhost:3001/api/v1/payments/webhook/stripe` prints a `whsec_…` for that session; use it as `STRIPE_WEBHOOK_SECRET` (the CLI signs with its own secret, not the dashboard's).
2. Place a card order in the customer app and pay in the sheet with a test card (any future expiry, any CVC, any postcode):

| Card number | Result |
|---|---|
| `4242 4242 4242 4242` | succeeds |
| `4000 0000 0000 0002` | declined (generic): the order stays pending, the customer can try another card |
| `4000 0000 0000 9995` | declined: insufficient funds |
| `4000 0000 0000 0069` | declined: expired card |
| `4000 0025 0000 3155` | needs 3-D Secure authentication |

3. Watch the payment go `pending` → `succeeded` and the order become confirmed.
4. Refund it from the admin portal to the card; it goes `sending` → `completed`.
5. Abandon a card order and wait `STRIPE_PENDING_TTL_MIN` minutes (set it to `2` for a quick check): the PaymentIntent is cancelled in the dashboard and the order is cancelled.

## Go-live checklist

- [ ] The client's Stripe account is verified and live payments are enabled.
- [ ] Live **restricted key** created with the two permissions above (not a full `sk_live_` key unless unavoidable).
- [ ] Live **webhook endpoint** created with the six events and the production URL; its signing secret noted.
- [ ] The three live values set with `deploy/set-secret.sh` (all `live`, no `test` left). The boot log reads `Card payments are ON (Stripe live mode …)` and **no** "TEST mode" warning.
- [ ] `settings:get` returns `cardPayments: "stripe"` and the customer app offers the card option.
- [ ] One real payment of a small amount, then refunded to the card from the admin portal; both show correctly in Stripe and in Finance.
- [ ] In Stripe: Radar/3-D Secure settings and the statement descriptor reviewed by the client; email receipts decided.
- [ ] Alerts: finance reads "Payment amount mismatch" and "Card refund failed" notices.
- [ ] The old test keys are deleted from the server (set-secret replaces them) and from anywhere they were shared.

## Rotating a key

* **Secret or restricted key** (suspected leak, staff change, or routine): in the dashboard create the **new** key first, set it with `deploy/set-secret.sh STRIPE_SECRET_KEY` (the API reloads), place a test order, then **delete the old key** in the dashboard. Use "Roll key" with an expiry if you want an overlap.
* **Webhook signing secret**: in the dashboard roll the endpoint's secret (Stripe can keep the old one valid for a while), set the new value with `deploy/set-secret.sh STRIPE_WEBHOOK_SECRET`.
* **Publishable key**: rolling it needs only the server value changed (`STRIPE_PUBLISHABLE_KEY`); no app release.
* If a key was ever pasted in a chat, ticket or email, treat it as leaked: rotate it.

## Sending the keys to us (encrypted end to end)

Never send a key as plain text in email, chat or a ticket. Best first, in order of preference:

1. **A password-manager share with an expiry** (Bitwarden Send, 1Password share link): set it to expire in a day and one view.
2. **An `age`-encrypted file** (works over any channel, including email):

   **On our side, once:**
   ```bash
   age-keygen -o somba-payments.key        # the private key stays on our machine, offline
   # it prints:  Public key: age1…         # send ONLY this line (the public key) to the client
   ```

   **On the client's side:** write the values into a text file, encrypt it for our public key, delete the plain file, and send `keys.age` by any channel:
   ```bash
   cat > keys.txt <<'EOF'
   STRIPE_SECRET_KEY=rk_live_…
   STRIPE_PUBLISHABLE_KEY=pk_live_…
   STRIPE_WEBHOOK_SECRET=whsec_…
   EOF
   age -r age1… -o keys.age keys.txt       # age1… is OUR public key
   shred -u keys.txt 2>/dev/null || rm -P keys.txt   # delete the plain file
   ```

   **On our side, to install** (the plain text only ever travels inside SSH and is never written to disk except the two 600 env files):
   ```bash
   age -d -i somba-payments.key keys.age | ssh root@<droplet> 'bash /opt/somba/deploy/set-secret.sh --stdin'
   ```
   The script prints one line per value, for example `STRIPE_SECRET_KEY set (…wxyz)`, and nothing else.

## `deploy/set-secret.sh`

Run on the droplet as root. It exists so a key never lands in shell history, in `ps`, in a log or on screen.

```bash
bash /opt/somba/deploy/set-secret.sh STRIPE_SECRET_KEY        # asks for the value, hidden
printf '%s\n' 'KEY=VALUE' | bash /opt/somba/deploy/set-secret.sh --stdin   # NAME=VALUE lines from stdin
```

* **Whitelist:** `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PENDING_TTL_MIN`, `MM_PROVIDER`, `PAWAPAY_API_TOKEN`, `PAWAPAY_BASE_URL`, `PAWAPAY_CURRENCY`, `PAWAPAY_FX_RATE`, `PAWAPAY_VERIFY_SIGNATURES`. Anything else is refused.
* **Validation** before anything is written: Stripe prefixes and modes (`sk_`/`rk_`, `pk_`, `whsec_`), the pawaPay token shape, `https://` for the base URL, `USD`/`CDF`, numbers, `true`/`false`. One bad line writes nothing.
* **Writes** both `/etc/somba/api.extra.env` (root, 600: survives deploys) and `/opt/somba/api/.env` (user `somba`, 600: what the API reads), each atomically (temp file in the same directory, same mode and owner, `mv`), replacing an existing line for the same name.
* **Reloads** the API as user `somba` (`pm2 reload somba-api --update-env`).
* **Warns** (without printing anything) if the Stripe secret and publishable keys are in different modes.
* The value is never in argv, never echoed, and the only output is `NAME set (…last4)`.

## Tests

* `api/src/payments/stripe.provider.spec.ts`: configuration (missing, malformed, mixed-mode keys → off), boot log without any key, error scrubbing, request mapping (cents, USD, card, metadata, idempotency key), and real webhook signature checks made with the stripe package (`generateTestHeaderString`).
* `api/src/payments/payments-stripe.spec.ts`: the whole flow against an in-memory Stripe: intent creation, card-sheet owner and state checks, webhook valid and invalid signature, order confirmed, amount and currency mismatch, declined card not final, canceled, expiry and catch-up, refunds to the card (success, failure → wallet once, refusal, no answer), every other refund path with a card, production refusing a card without Stripe, and the public `cardPayments` setting.

## Not in this release

Web shop card checkout (Stripe Elements), the admin refund dialog label ("The card that paid"), card wallet top-ups and seller-plan payments by card.
