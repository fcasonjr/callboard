/* Registers the service worker and saves this call sheet for offline use. */
(function () {
  if (!("serviceWorker" in navigator) || !("caches" in window)) return;
  navigator.serviceWorker
    .register("/sw.js")
    .then(function () {
      return navigator.serviceWorker.ready;
    })
    .then(async function () {
      if (!navigator.onLine) return;
      var pages = await caches.open("callboard-pages-v1");
      var assets = await caches.open("callboard-assets-v1");
      var res = await fetch(location.href, { credentials: "same-origin" });
      if (res.ok && !res.redirected) await pages.put(location.href, res);
      var urls = performance
        .getEntriesByType("resource")
        .map(function (e) { return e.name; })
        .filter(function (u) { return u.indexOf("/_next/static/") !== -1; });
      await Promise.all(
        urls.map(async function (u) {
          if (await assets.match(u, { ignoreVary: true })) return;
          try {
            var r = await fetch(u);
            if (r.ok) await assets.put(u, r);
          } catch (e) {}
        }),
      );
      document.documentElement.setAttribute("data-offline-ready", "1");
    })
    .catch(function () {});
})();
