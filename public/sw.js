// Rivo service worker — handles Web Push delivery while the app/tab is closed,
// and registers a fetch listener so the app qualifies as an installable PWA.
/* eslint-disable no-undef */

// The SW is served from the app base (e.g. https://host/rivo/sw.js), so "./"
// resolves to the app root regardless of subpath — use it for all asset URLs.
const APP_BASE = new URL("./", self.location.href);
const iconUrl = new URL("brand/app-icon-1024.png", APP_BASE).href;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Network passthrough. Having a fetch handler is part of PWA installability;
// we intentionally don't cache (the app needs live data from Supabase).
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "Rivo", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Rivo";
  const options = {
    body: data.body || "",
    icon: iconUrl,
    badge: iconUrl,
    tag: data.tag || undefined,
    data: { url: data.url || APP_BASE.href },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || APP_BASE.href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab if one is open, otherwise open a new one.
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
