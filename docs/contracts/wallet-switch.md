# Wallet switch (`walletEnabled`)

Public setting, default `true` (a server that never stored it behaves as on). Admin: Settings > Wallet. Sent to every client in
`settings:get` and live in `settings:updated`; the customer app (`RealtimeStore.walletEnabled`, mirrored in `Strings.walletOff`) and the
shop (`usePublicSettings().walletEnabled`) follow it without a reload.

## While OFF

Hidden (app and web shop): the wallet menu entry and profile stat, the wallet screen (route guard: a notice, the account-deletion
button or any link that reaches it shows one sentence), the checkout "KOMORIKO wallet" tile (a wallet choice made earlier falls back to
mobile money), top-up, the "refund to my wallet" choice of a return, and every text that names the wallet (`kWalletOffKeys` in the app,
`walletOn` branches on the web). The seller plan checkout drops its wallet option.

Refused by the server, with an EN + FR sentence (`WALLET_OFF`, `common/error-fr-exact.ts`, web `api-errors.ts`, app `server_errors.dart`):
pay-with-wallet (`orders:create`, via `assertMethodAllowed`), `wallet:topup`, a seller plan paid with the wallet, and an exchange that
costs more than the original (its difference is paid from the wallet: `EXCHANGE_NEEDS_WALLET`).

Balances are never touched by the switch.

## Refunds while OFF

| Payment | Where the money goes |
|---|---|
| Made with the wallet | The wallet, as always. |
| Mobile money (pawaPay connected) | Back to the paying phone (`refundTo: phone`, `sending` until pawaPay confirms). |
| Card (Stripe connected, real PaymentIntent) | Back to the card (`refundTo: card`). |
| Cannot go back automatically (provider not connected, no provider reference, or another phone/card refund of the same payment is still in flight) | Admin refund (`orders:refund`, a dispute decision): refused with `WALLET_OFF_REFUND_NO_ROUTE`, nothing moves (the code's existing "cannot refund to the original method" answer). Automatic paths (a cancellation, a seller cancelling lines, a return or dispute part refund, an exchange difference): the wallet is credited, so the money is never lost; it shows when the wallet is switched on again. |
| The processor refuses or fails a phone/card refund | The wallet, as before (finance is told). |

Paths covered: `PaymentsService.refund`, `refundCancelledOrder`, a late approval after the order closed (`settle`),
`OrdersService.cancelLines` (seller cancel, undeliverable leg), `PartialRefundService.refund` (returns, dispute decisions), and the cheaper
exchange's price difference (`kind: exchange` in the refund ledger). Notices say "refunded to your original payment method"
(French in `notifications/localize.ts` and the app's notice rules); a dispute's stock resolution is "Refunded to original payment method".

Deletion of an account that still holds a balance stays blocked (the money is the customer's); the app drops the "Open my wallet" button
and keeps "Contact support".
