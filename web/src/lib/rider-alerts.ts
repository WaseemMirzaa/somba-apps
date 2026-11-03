/**
 * What the rider portal's "Turn on alerts" card shows. Web push needs the browser's permission and, to reach a closed tab,
 * the Firebase web config with the VAPID key (`NEXT_PUBLIC_FIREBASE_VAPID_KEY`). Without that config the card still works:
 * alerts then show while a portal tab is open. Pure function; the card is `components/rider/rider-alerts-card.tsx`.
 *
 * No imports: `npm test` loads this file on its own.
 */

export type AlertsCardState =
  | "hidden" // this browser cannot show notifications at all
  | "ask" // permission not asked yet: show the button
  | "blocked" // the rider refused: say where to allow it
  | "on-push" // allowed and registered for push: alerts arrive with the tab closed
  | "on-tab"; // allowed, push not set up: alerts arrive while a portal tab is open

export function alertsCardState(input: {
  permission: "granted" | "denied" | "default" | "unsupported";
  /** Firebase web config and VAPID key are all set. */
  configured: boolean;
  /** This browser has a push token registered. */
  registered: boolean;
}): AlertsCardState {
  if (input.permission === "unsupported") return "hidden";
  if (input.permission === "denied") return "blocked";
  if (input.permission === "default") return "ask";
  return input.configured && input.registered ? "on-push" : "on-tab";
}
