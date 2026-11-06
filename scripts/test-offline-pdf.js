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
assert.strictEqual(off.isShellPath("/js/viewer.js"), true);
assert.strictEqual(off.isShellPath("/pdfjs/build/pdf.min.mjs"), true);
assert.strictEqual(off.isShellPath("/fault-codes.html"), false);
assert.strictEqual(off.isShellPath("/js/fault-codes.js"), false);
assert.strictEqual(off.isShellPath("/brands/worcester-bosch.html"), false);

// Default HTTPS port is equivalent to no port (same as the viewer).
assert.strictEqual(
    off.canonicalPdfUrl("https://cdn.boilermanuals.com:443/zanussi/zanussi-system.compressed.pdf"),
    ok
);

console.log("offline-pdf tests passed");
