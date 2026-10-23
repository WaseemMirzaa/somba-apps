/* Firebase web push for the Somba&Teka portals (registered by src/lib/web-push.ts).
 *
 * Shows a notification when a push arrives and no portal tab is in front, and opens the page it is about when
 * clicked. The public Firebase config comes from this file's URL (?apiKey=…&projectId=…), so nothing is
 * hard-coded here. The Firebase version matches the `firebase` package in package.json.
 */
const FIREBASE_VERSION = "12.19.0";

// Clicks first: open (or focus) the page the notification is about. Firebase stores the server's data under
// FCM_MSG; `link` is the portal path the API sends with every push.
self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  const link = (data.FCM_MSG && data.FCM_MSG.data && data.FCM_MSG.data.link) || data.link;
  if (!link) return;
  event.notification.close();
  event.stopImmediatePropagation();
  const url = new URL(link, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tabs) => {
      for (const tab of tabs) {
        if (new URL(tab.url).origin === self.location.origin && "navigate" in tab) {
          return tab.focus().then(() => tab.navigate(url));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

const params = new URL(self.location.href).searchParams;
const config = {
  apiKey: params.get("apiKey") || "",
  authDomain: params.get("authDomain") || undefined,
  projectId: params.get("projectId") || "",
  messagingSenderId: params.get("messagingSenderId") || "",
  appId: params.get("appId") || "",
};

if (config.apiKey && config.projectId && config.messagingSenderId && config.appId) {
  importScripts(
    `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app-compat.js`,
    `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-messaging-compat.js`,
  );
  self.firebase.initializeApp(config);
  // Notification messages (title + body) are shown by Firebase itself; this only handles data-only ones.
  self.firebase.messaging().onBackgroundMessage((payload) => {
    if (payload.notification) return;
    const d = payload.data || {};
    if (!d.title) return;
    self.registration.showNotification(d.title, { body: d.body || "", tag: d.notificationId, data: { link: d.link } });
  });
}
