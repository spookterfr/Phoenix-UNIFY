/* Phoenix UNIFY service worker.
   Receives Web Push messages from push-server.js and shows them as system
   notifications, even when the app/tab is closed. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Phoenix UNIFY";
  const options = {
    body: data.body || "",
    icon: "PHXunify2.png",
    badge: "PHXunify2.png",
    data: { url: data.url || "./" }
  };
  // Same tag as the in-app notification, so it replaces instead of duplicating
  if (data.tag) options.tag = data.tag;
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "./", self.location.href).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
