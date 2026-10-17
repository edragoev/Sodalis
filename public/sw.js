// Sodalis service worker: installable PWA, offline fallback, and push notifications.
// One worker owns the "/" scope, so push lives here rather than in a second Firebase worker.
// Keep this file free of data caching so dashboard data is always live.
self.importScripts("/sw-push.js");
const CACHE = "sodalis-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Only navigations fall back to the offline page. API calls and assets go straight to the network.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

// Push (FCM): show the notification, and open the right page when it is tapped.
self.addEventListener("push", (event) => self.SodalisPush.handlePush(event, self.registration));
self.addEventListener("notificationclick", (event) =>
  self.SodalisPush.handleNotificationClick(event, self.clients),
);
