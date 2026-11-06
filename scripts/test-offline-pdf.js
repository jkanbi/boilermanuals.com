#!/usr/bin/env node
"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var assert = require("assert");

var src = fs.readFileSync(path.join(__dirname, "..", "js", "offline-pdf.js"), "utf8");
var ctx = {
    self: {},
    console: console,
    URL: URL,
    URLSearchParams: URLSearchParams,
    Blob: Blob,
    Response: Response,
    Request: Request,
    fetch: function () { return Promise.reject(new Error("no-fetch")); }
};
vm.createContext(ctx);
vm.runInContext(src, ctx);
var off = ctx.self.BMOfflinePdf;
assert.ok(off, "BMOfflinePdf should load");
assert.strictEqual(off.UNUSED_MS, 30 * 24 * 60 * 60 * 1000);
assert.strictEqual(off.MAX_PDF_BYTES, 80 * 1024 * 1024);
assert.strictEqual(off.CACHE_SHELL, "bm-viewer-shell-v3");

var ok = "https://cdn.boilermanuals.com/zanussi/zanussi-system.compressed.pdf";
assert.strictEqual(off.canonicalPdfUrl(ok), ok);
assert.strictEqual(off.isAllowedCdnPdf(ok), true);
assert.strictEqual(off.canonicalPdfUrl(ok + "#page=2"), ok);
assert.strictEqual(off.canonicalPdfUrl(ok + "?cache=1"), ok);
assert.strictEqual(off.displayName(ok), "zanussi system.compressed");

var rejects = [
    null,
    "",
    "not a url",
    "http://cdn.boilermanuals.com/a.pdf",
    "https://evil.com/a.pdf",
    "https://cdn.boilermanuals.com.evil.com/a.pdf",
    "https://evil.com/?file=https://cdn.boilermanuals.com/a.pdf",
    "https://cdn.boilermanuals.com/a.pdf.html",
    "https://cdn.boilermanuals.com/a.png",
    "https://user:pass@cdn.boilermanuals.com/a.pdf",
    "https://cdn.boilermanuals.com:8443/a.pdf",
    "/viewer.html?file=" + ok
];
rejects.forEach(function (value) {
    assert.strictEqual(off.isAllowedCdnPdf(value), false, "should reject " + value);
});

function sameRange(actual, expected) {
    assert.ok(actual, "expected a range object");
    Object.keys(expected).forEach(function (key) {
        assert.strictEqual(actual[key], expected[key], "range." + key);
    });
    Object.keys(actual).forEach(function (key) {
        assert.strictEqual(actual[key], expected[key], "range extra " + key);
    });
}
sameRange(off.parseByteRange("bytes=0-65535", 100000), { start: 0, end: 65535 });
sameRange(off.parseByteRange("bytes=10-", 50), { start: 10, end: 49 });
sameRange(off.parseByteRange("bytes=0-0", 10), { start: 0, end: 0 });
sameRange(off.parseByteRange("bytes=80-90", 50), { unsatisfiable: true });
assert.strictEqual(off.parseByteRange(null, 50), null);
assert.strictEqual(off.parseByteRange("bytes=abc", 50), null);

assert.strictEqual(off.isShellPath("/viewer.html"), true);
assert.strictEqual(off.isShellPath("/offline.html"), true);
assert.strictEqual(off.isShellPath("/js/offline-files.js"), true);
assert.strictEqual(off.isShellPath("/js/viewer.js"), true);
assert.strictEqual(off.isShellPath("/pdfjs/build/pdf.min.mjs"), true);
assert.strictEqual(off.isShellPath("/fault-codes.html"), false);
assert.strictEqual(off.isShellPath("/js/fault-codes.js"), false);
assert.strictEqual(off.isShellPath("/brands/worcester-bosch.html"), false);

assert.strictEqual(
    off.canonicalPdfUrl("https://cdn.boilermanuals.com:443/zanussi/zanussi-system.compressed.pdf"),
    ok
);

assert.strictEqual(off.lastUsedAt({ openedAt: 50, savedAt: 10 }), 50);
assert.strictEqual(off.lastUsedAt({ savedAt: 10 }), 10);
assert.strictEqual(off.lastUsedAt({}), 0);
assert.strictEqual(off.lastUsedAt(null), 0);

assert.strictEqual(off.isQuotaError({ name: "QuotaExceededError" }), true);
assert.strictEqual(off.isQuotaError({ name: "NS_ERROR_DOM_QUOTA_REACHED" }), true);
assert.strictEqual(off.isQuotaError({ code: 22, message: "ok" }), true);
assert.strictEqual(off.isQuotaError({ message: "The quota has been exceeded." }), true);
assert.strictEqual(off.isQuotaError({ name: "TypeError", message: "fail" }), false);
assert.strictEqual(off.isQuotaError(null), false);

function loadOffline(extras) {
    var mem = extras.mem || {};
    var store = extras.store || {};
    var persistCalls = { count: 0, granted: extras.persistGranted };
    var putFailsLeft = extras.putFailsLeft || 0;
    var cache = {
        keys: function () {
            return Promise.resolve(Object.keys(store).map(function (u) { return new Request(u); }));
        },
        match: function (url) {
            var key = typeof url === "string" ? url : url.url;
            return Promise.resolve(store[key] || null);
        },
        put: function (url, res) {
            if (putFailsLeft > 0) {
                putFailsLeft -= 1;
                var err = new Error("The quota has been exceeded.");
                err.name = "QuotaExceededError";
                return Promise.reject(err);
            }
            var key = typeof url === "string" ? url : url.url;
            store[key] = res;
            return Promise.resolve();
        },
        delete: function (url) {
            var key = typeof url === "string" ? url : url.url;
            var had = Object.prototype.hasOwnProperty.call(store, key);
            delete store[key];
            return Promise.resolve(had);
        }
    };
    var sandbox = {
        self: {},
        console: console,
        URL: URL,
        URLSearchParams: URLSearchParams,
        Blob: Blob,
        Response: Response,
        Request: Request,
        localStorage: {
            getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
            setItem: function (k, v) { mem[k] = String(v); }
        },
        caches: {
            open: function () { return Promise.resolve(cache); }
        },
        navigator: {
            storage: {
                persist: function () {
                    persistCalls.count += 1;
                    if (extras.persistReject) {
                        return Promise.reject(new Error("denied"));
                    }
                    return Promise.resolve(!!persistCalls.granted);
                },
                persisted: function () {
                    return Promise.resolve(!!persistCalls.granted);
                }
            }
        },
        fetch: extras.fetch || function () { return Promise.reject(new Error("no-fetch")); }
    };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    return {
        off: sandbox.self.BMOfflinePdf,
        mem: mem,
        store: store,
        persistCalls: persistCalls
    };
}

function pdfResponse() {
    return new Response("%PDF-1.4 test", {
        status: 200,
        headers: { "Content-Type": "application/pdf" }
    });
}

function readIndex(mem) {
    return JSON.parse(mem["bm-offline-index"] || "{}");
}

(async function () {
    var mem = {};
    var store = {};
    var env = loadOffline({ mem: mem, store: store });
    var off2 = env.off;
    var older = "https://cdn.boilermanuals.com/gah/old.pdf";
    var newer = "https://cdn.boilermanuals.com/fischer/new.pdf";
    off2.rememberPdf(older);
    off2.rememberPdf(newer);
    var idx = readIndex(mem);
    idx[older].savedAt = 1000;
    idx[newer].savedAt = 2000;
    mem["bm-offline-index"] = JSON.stringify(idx);
    store[older] = pdfResponse();
    store[newer] = pdfResponse();
    store["https://evil.com/nope.pdf"] = pdfResponse();

    var items = await off2.listKeptPdfs();
    assert.strictEqual(items.length, 2);
    assert.strictEqual(items[0].url, newer);
    assert.strictEqual(items[1].url, older);

    var envKeep = loadOffline({ mem: {}, store: {}, persistGranted: true });
    envKeep.off.rememberPdf(ok);
    var firstSaved = readIndex(envKeep.mem)[ok].savedAt;
    envKeep.off.rememberPdf(ok);
    var again = readIndex(envKeep.mem)[ok];
    assert.strictEqual(again.savedAt, firstSaved, "re-keep should keep the original saved date");
    assert.ok(again.openedAt >= firstSaved);

    envKeep.off.touchOpened(ok);
    var touched = readIndex(envKeep.mem)[ok];
    assert.strictEqual(touched.savedAt, firstSaved);
    assert.ok(touched.openedAt >= again.openedAt);

    var beforeUnknown = JSON.stringify(envKeep.mem);
    envKeep.off.touchOpened("https://cdn.boilermanuals.com/missing/nope.pdf");
    assert.strictEqual(JSON.stringify(envKeep.mem), beforeUnknown, "touchOpened should ignore unknown urls");

    var envDeny = loadOffline({ mem: {}, store: {}, persistReject: true });
    assert.strictEqual(await envDeny.off.requestPersist(), false);
    assert.strictEqual(envDeny.persistCalls.count, 1);

    var envGrant = loadOffline({ mem: {}, store: {}, persistGranted: true });
    assert.strictEqual(await envGrant.off.requestPersist(), true);
    assert.strictEqual(await envGrant.off.isPersisted(), true);

    var envHit = loadOffline({
        mem: {},
        store: (function () { var s = {}; s[ok] = pdfResponse(); return s; }()),
        persistGranted: true
    });
    envHit.off.rememberPdf(ok);
    var hitResult = await envHit.off.keepPdf(ok);
    assert.strictEqual(hitResult.persisted, true);
    assert.ok(envHit.persistCalls.count >= 1, "successful keep should request persistent storage");

    var stale = "https://cdn.boilermanuals.com/gah/stale.pdf";
    var fresh = "https://cdn.boilermanuals.com/gah/fresh.pdf";
    var excepted = "https://cdn.boilermanuals.com/gah/excepted.pdf";
    var envExp = loadOffline({ mem: {}, store: {} });
    envExp.off.rememberPdf(stale);
    envExp.off.rememberPdf(fresh);
    envExp.off.rememberPdf(excepted);
    var now = Date.now();
    var expIdx = readIndex(envExp.mem);
    expIdx[stale].savedAt = now - envExp.off.UNUSED_MS - 86400000;
    expIdx[stale].openedAt = now - envExp.off.UNUSED_MS - 86400000;
    expIdx[fresh].savedAt = now - 2 * 86400000;
    expIdx[fresh].openedAt = now - 2 * 86400000;
    expIdx[excepted].savedAt = now - envExp.off.UNUSED_MS - 86400000;
    expIdx[excepted].openedAt = now - envExp.off.UNUSED_MS - 86400000;
    envExp.mem["bm-offline-index"] = JSON.stringify(expIdx);
    envExp.store[stale] = pdfResponse();
    envExp.store[fresh] = pdfResponse();
    envExp.store[excepted] = pdfResponse();

    var expired = await envExp.off.expireUnusedPdfs(excepted);
    assert.strictEqual(expired.length, 1);
    assert.strictEqual(expired[0], stale);
    assert.ok(!envExp.store[stale], "stale unused pdf should be removed from the cache");
    assert.ok(envExp.store[fresh], "recently opened pdf should be kept");
    assert.ok(envExp.store[excepted], "the pdf currently being opened should not expire");
    var afterExp = readIndex(envExp.mem);
    assert.ok(!afterExp[stale]);
    assert.ok(afterExp[fresh]);
    assert.ok(afterExp[excepted]);

    var a = "https://cdn.boilermanuals.com/a/a.pdf";
    var b = "https://cdn.boilermanuals.com/b/b.pdf";
    var c = "https://cdn.boilermanuals.com/c/c.pdf";
    var envEvict = loadOffline({ mem: {}, store: {} });
    envEvict.off.rememberPdf(a);
    envEvict.off.rememberPdf(b);
    envEvict.off.rememberPdf(c);
    var evIdx = readIndex(envEvict.mem);
    evIdx[a].openedAt = 50;
    evIdx[a].savedAt = 200;
    evIdx[b].openedAt = 100;
    evIdx[b].savedAt = 10;
    evIdx[c].openedAt = 100;
    evIdx[c].savedAt = 20;
    envEvict.mem["bm-offline-index"] = JSON.stringify(evIdx);
    envEvict.store[a] = pdfResponse();
    envEvict.store[b] = pdfResponse();
    envEvict.store[c] = pdfResponse();
    assert.strictEqual(await envEvict.off.evictOldestKept(a), true);
    assert.ok(!envEvict.store[b], "least recently opened, then oldest saved, should go first among remaining");
    assert.ok(envEvict.store[a], "excepted pdf must not be evicted");
    assert.ok(envEvict.store[c]);

    var envOnly = loadOffline({ mem: {}, store: {} });
    envOnly.off.rememberPdf(ok);
    envOnly.store[ok] = pdfResponse();
    assert.strictEqual(await envOnly.off.evictOldestKept(ok), false, "must not delete the pdf being kept");
    assert.ok(envOnly.store[ok]);

    var keepNew = "https://cdn.boilermanuals.com/new/keep.pdf";
    var victim = "https://cdn.boilermanuals.com/old/victim.pdf";
    var envQuota = loadOffline({
        mem: {},
        store: {},
        putFailsLeft: 1,
        persistGranted: false,
        fetch: function (url) {
            var href = typeof url === "string" ? url : url.url;
            if (href === keepNew) {
                return Promise.resolve(pdfResponse());
            }
            return Promise.reject(new Error("no-fetch"));
        }
    });
    envQuota.off.rememberPdf(victim);
    var qIdx = readIndex(envQuota.mem);
    qIdx[victim].savedAt = 1;
    qIdx[victim].openedAt = 1;
    envQuota.mem["bm-offline-index"] = JSON.stringify(qIdx);
    envQuota.store[victim] = pdfResponse();

    var kept = await envQuota.off.keepPdf(keepNew);
    assert.strictEqual(kept.persisted, false);
    assert.ok(!envQuota.store[victim], "quota full should drop the oldest unused kept pdf");
    assert.ok(envQuota.store[keepNew], "the pdf being kept must remain");
    assert.ok(envQuota.persistCalls.count >= 1, "persist is requested even when the browser refuses");

    var envNoRoom = loadOffline({
        mem: {},
        store: {},
        putFailsLeft: 5,
        fetch: function (url) {
            var href = typeof url === "string" ? url : url.url;
            if (href === keepNew) {
                return Promise.resolve(pdfResponse());
            }
            return Promise.reject(new Error("no-fetch"));
        }
    });
    var noRoomErr = null;
    try {
        await envNoRoom.off.keepPdf(keepNew);
    } catch (err) {
        noRoomErr = err;
    }
    assert.ok(noRoomErr, "keep should fail when nothing can be freed");
    assert.strictEqual(envNoRoom.off.isQuotaError(noRoomErr), true);
    assert.ok(!envNoRoom.store[keepNew]);

    console.log("offline-pdf tests passed");
})().catch(function (err) {
    console.error(err);
    process.exit(1);
});
