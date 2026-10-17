// Push handling for the Sodalis service worker. Loaded by sw.js with importScripts, and by
// the unit tests with require, so it is plain ES5-style JavaScript with no imports.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SodalisPush = api;
})(typeof self !== "undefined" ? self : this, function () {
  var DEFAULT_TITLE = "CareChain";
  var ICON = "/icons/icon-192.png";

  function text(value) {
    return typeof value === "string" ? value : "";
  }

  // Where a tap should go. Built only from the opportunity id: a URL sent in the push is
  // never followed, so a push cannot send someone to another site.
  function resolveNotificationTarget(data) {
    var id = data && typeof data === "object" ? text(data.opportunity_id) : "";
    return id ? "/opportunities/" + encodeURIComponent(id) : "/";
  }

  function buildNotification(payload) {
    var p = payload && typeof payload === "object" ? payload : {};
    var n = p.notification && typeof p.notification === "object" ? p.notification : {};
    var d = p.data && typeof p.data === "object" ? p.data : {};
    var options = {
      body: text(n.body) || text(d.body),
      icon: ICON,
      data: { url: resolveNotificationTarget(d) },
      // The same opportunity replaces its earlier notification instead of stacking.
      requireInteraction: d.urgency === "high",
    };
    if (text(d.opportunity_id)) options.tag = "opportunity-" + d.opportunity_id;
    return { title: text(n.title) || text(d.title) || DEFAULT_TITLE, options: options };
  }

  function handlePush(event, registration) {
    var payload = null;
    try {
      payload = event.data ? event.data.json() : null;
    } catch {
      // Browsers require every push to show a notification, so fall through to the default one.
    }
    var n = buildNotification(payload);
    var shown = registration.showNotification(n.title, n.options);
    event.waitUntil(shown);
    return shown;
  }

  function handleNotificationClick(event, clients) {
    event.notification.close();
    var data = event.notification.data;
    var url = data && typeof data.url === "string" && /^\/(?!\/)/.test(data.url) ? data.url : "/";
    var done = clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (open) {
      var existing = open[0];
      if (!existing) return clients.openWindow(url);
      return Promise.resolve(existing.focus()).then(function () {
        return existing.navigate ? existing.navigate(url) : undefined;
      });
    });
    event.waitUntil(done);
    return done;
  }

  return {
    resolveNotificationTarget: resolveNotificationTarget,
    buildNotification: buildNotification,
    handlePush: handlePush,
    handleNotificationClick: handleNotificationClick,
  };
});
