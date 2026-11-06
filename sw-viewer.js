/* Viewer offline helper v3 (offline-pdf v2).
 * Serves the on-site viewer shell and kept CDN PDFs from site storage.
 * Does not intercept brand pages, fault-code pages, or other site URLs. */
importScripts("/js/offline-pdf.js");

var off = self.BMOfflinePdf;

self.addEventListener("install", function (event) {
    event.waitUntil(
        off.precacheShell().then(function () {
            return self.skipWaiting();
        })
    );
});

self.addEventListener("activate", function (event) {
    event.waitUntil(
        off.pruneShellCaches().then(function () {
            return self.clients.claim();
        })
    );
});

self.addEventListener("fetch", function (event) {
    var req = event.request;
    if (req.method !== "GET") {
        return;
    }
    var url;
    try {
        url = new URL(req.url);
    } catch (e) {
        return;
    }
    if (off.isAllowedCdnPdf(url.href)) {
        event.respondWith(off.respondPdf(req));
        return;
    }
    if (url.origin === self.location.origin && off.isShellPath(url.pathname)) {
        event.respondWith(off.respondShell(req));
    }
});
