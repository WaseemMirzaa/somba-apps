/**
 * The wallet switch (`settings.walletEnabled`, default on): what the server says when it is off. French:
 * `common/error-fr-exact.ts` (and the web / app error maps).
 */
export const WALLET_OFF = 'The wallet is not available right now.';
export const WALLET_OFF_REFUND_NO_ROUTE =
  'The wallet is switched off and this payment cannot be refunded to its original method from here. Switch the wallet back on to refund it.';

/** A stored `walletEnabled` value: anything but 'false' is on (a server that never stored it keeps the wallet working). */
export const walletOn = (raw: string | null | undefined): boolean => raw !== 'false';
