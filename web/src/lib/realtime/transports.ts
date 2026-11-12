/**
 * How the browser reaches the Socket.IO server.
 *
 * The client used to be websocket-only. A network that refuses the websocket upgrade (a mobile-data proxy or a firewall
 * on plain http, a reverse proxy without the Upgrade headers) then left the shop with no connection at all: the product
 * page stayed on "Loading…" (no Add to cart), no delivery fee could be asked, nothing could be ordered.
 *
 * Now the connection opens over plain HTTP long-polling, which every network lets through, and upgrades to a websocket
 * in the background when the network allows it. If the upgrade is refused the shop simply keeps working on polling.
 * `rememberUpgrade` makes every later connection of the same page (sign-in, token refresh) go straight to the websocket
 * once one worked. The auth token travels in the Socket.IO connect packet, not in the URL, on either transport.
 *
 * Polling needs the requests of one session to reach the same server process: one API process, or sticky sessions in
 * front of several (see deploy/nginx/somba.conf).
 */
export const SOCKET_TRANSPORT_OPTIONS: { transports: string[]; upgrade: boolean; rememberUpgrade: boolean } = {
  transports: ["polling", "websocket"],
  upgrade: true,
  rememberUpgrade: true,
};
