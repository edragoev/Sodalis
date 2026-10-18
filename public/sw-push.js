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

  // A phone number in E.164 form (+14155550142): the only thing an alert push may dial.
  var E164 = /^\+[1-9]\d{6,14}$/;
  var TEL = /^tel:\+[1-9]\d{6,14}$/;

  // Where a tap should go. Built only from the opportunity id, or for an alert from the elder's
  // phone number: a URL sent in the push is never followed, so a push cannot send someone to
  // another site.
  function resolveNotificationTarget(data) {
    var d = data && typeof data === "object" ? data : {};
    if (d.type === "alert" && E164.test(text(d.elder_phone))) return "tel:" + d.elder_phone;
    var id = text(d.opportunity_id);
    if (id) return "/opportunities/" + encodeURIComponent(id);
    // A wellbeing note opens the call it came from.
    var checkInId = text(d.check_in_id);
    return checkInId ? "/calls/" + encodeURIComponent(checkInId) : "/";
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
    else if (d.type === "alert") options.tag = "alert";
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
    // An alert opens the phone app to call the elder. If the browser cannot dial, open the dashboard.
    if (data && typeof data.url === "string" && TEL.test(data.url)) {
      var dialed = Promise.resolve()
        .then(function () {
          return clients.openWindow(data.url);
        })
        .catch(function () {
          return clients.openWindow("/");
        });
      event.waitUntil(dialed);
      return dialed;
    }
    var done = clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (open) {
      var existing = open[0];
      if (!existing) return clients.openWindow(url);
      // navigate() rejects for a window this worker doesn't control, so open a new one instead.
      return Promise.resolve(existing.focus())
        .then(function () {
          return existing.navigate ? existing.navigate(url) : clients.openWindow(url);
        })
        .catch(function () {
          return clients.openWindow(url);
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
