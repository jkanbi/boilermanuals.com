/*
 * In-browser storage for manuals opened in the on-site viewer.
 * Uses the Cache API (site storage), not a file in the device Downloads folder.
 * Loaded on the viewer page and via importScripts() in /sw-viewer.js.
 * Bump sw-viewer.js when this file changes so the worker picks up the new script.
 */
(function (global) {
    var ALLOWED_HOST = "cdn.boilermanuals.com";
    var CACHE_PDFS = "bm-offline-pdfs";
    var CACHE_SHELL = "bm-viewer-shell-v1";
    var SHELL_PREFIX = "bm-viewer-shell-";
    var MAX_PDF_BYTES = 80 * 1024 * 1024;

    var SHELL_URLS = [
        "/viewer.html",
        "/js/offline-pdf.js?v=1",
        "/js/viewer.js?v=4",
        "/js/navbar.js?v=14",
        "/js/optimiser-url.js?v=1",
        "/js/winter-banner.js?v=3",
        "/css/navbar.css?v=6",
        "/css/styles.css?v=14",
        "/css/winter-banner.css?v=4",
        "/pdfjs/build/pdf.min.mjs",
        "/pdfjs/build/pdf.worker.min.mjs",
        "/pdfjs/wasm/jbig2.wasm",
        "/pdfjs/wasm/openjpeg.wasm",
        "/pdfjs/wasm/qcms_bg.wasm",
        "/pdfjs/wasm/jbig2_nowasm_fallback.js",
        "/pdfjs/wasm/openjpeg_nowasm_fallback.js",
        "/pdfjs/standard_fonts/LiberationSans-Regular.ttf",
        "/pdfjs/standard_fonts/LiberationSans-Bold.ttf",
        "/pdfjs/standard_fonts/LiberationSans-BoldItalic.ttf",
        "/pdfjs/standard_fonts/LiberationSans-Italic.ttf",
        "/pdfjs/standard_fonts/FoxitDingbats.pfb",
        "/pdfjs/standard_fonts/FoxitFixed.pfb",
        "/pdfjs/standard_fonts/FoxitFixedBold.pfb",
        "/pdfjs/standard_fonts/FoxitFixedBoldItalic.pfb",
        "/pdfjs/standard_fonts/FoxitFixedItalic.pfb",
        "/pdfjs/standard_fonts/FoxitSerif.pfb",
        "/pdfjs/standard_fonts/FoxitSerifBold.pfb",
        "/pdfjs/standard_fonts/FoxitSerifBoldItalic.pfb",
        "/pdfjs/standard_fonts/FoxitSerifItalic.pfb",
        "/pdfjs/standard_fonts/FoxitSymbol.pfb",
        "/favicon.ico",
        "/images/logo.png",
        "/images/favicon-32x32.png",
        "/images/favicon-16x16.png",
        "/images/apple-touch-icon.png"
    ];

    function isAllowedCdnPdf(raw) {
        return !!canonicalPdfUrl(raw);
    }

    function canonicalPdfUrl(raw) {
        if (!raw || typeof raw !== "string") {
            return null;
        }
        var u;
        try {
            u = new URL(raw);
        } catch (e) {
            return null;
        }
        if (u.protocol !== "https:" || u.hostname !== ALLOWED_HOST || u.port ||
            u.username || u.password || !/\.pdf$/i.test(u.pathname)) {
            return null;
        }
        u.hash = "";
        u.search = "";
        return u.href;
    }

    function displayName(url) {
        var canon = canonicalPdfUrl(url);
        if (!canon) {
            return "";
        }
        var seg = "";
        try {
            seg = decodeURIComponent(new URL(canon).pathname.split("/").pop() || "");
        } catch (e) {
            try {
                seg = new URL(canon).pathname.split("/").pop() || "";
            } catch (e2) {
                return "";
            }
        }
        return seg.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    }

    function isSupported() {
        return typeof caches !== "undefined" && typeof fetch === "function";
    }

    function isShellPath(pathname) {
        if (pathname === "/viewer.html" || pathname === "/favicon.ico") {
            return true;
        }
        if (pathname.indexOf("/pdfjs/") === 0) {
            return true;
        }
        if (pathname === "/js/offline-pdf.js" || pathname === "/js/viewer.js" ||
            pathname === "/js/navbar.js" || pathname === "/js/optimiser-url.js" ||
            pathname === "/js/winter-banner.js") {
            return true;
        }
        if (pathname === "/css/navbar.css" || pathname === "/css/styles.css" ||
            pathname === "/css/winter-banner.css") {
            return true;
        }
        if (pathname === "/images/logo.png" || pathname === "/images/favicon-32x32.png" ||
            pathname === "/images/favicon-16x16.png" || pathname === "/images/apple-touch-icon.png") {
            return true;
        }
        return false;
    }

    function parseByteRange(header, size) {
        if (!header || !size) {
            return null;
        }
        var m = /^bytes=(\d+)-(\d+)?$/.exec(String(header).trim());
        if (!m) {
            return null;
        }
        var start = Number(m[1]);
        var end = m[2] != null && m[2] !== "" ? Number(m[2]) : size - 1;
        if (!isFinite(start) || !isFinite(end) || start < 0 || start >= size) {
            return { unsatisfiable: true };
        }
        if (start > end) {
            return { unsatisfiable: true };
        }
        return { start: start, end: Math.min(end, size - 1) };
    }

    function pdfHeaders(cached, extra) {
        var headers = {
            "Content-Type": (cached && cached.headers.get("Content-Type")) || "application/pdf",
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*"
        };
        if (extra) {
            Object.keys(extra).forEach(function (k) {
                headers[k] = extra[k];
            });
        }
        return headers;
    }

    function rangeResponse(cached, request) {
        var rangeHeader = request && request.headers ? request.headers.get("Range") : null;
        if (!rangeHeader) {
            return Promise.resolve(cached);
        }
        return cached.blob().then(function (blob) {
            var spec = parseByteRange(rangeHeader, blob.size);
            if (!spec) {
                return cached;
            }
            if (spec.unsatisfiable) {
                return new Response(null, {
                    status: 416,
                    headers: pdfHeaders(cached, { "Content-Range": "bytes */" + blob.size })
                });
            }
            var slice = blob.slice(spec.start, spec.end + 1);
            return new Response(slice, {
                status: 206,
                headers: pdfHeaders(cached, {
                    "Content-Length": String(slice.size),
                    "Content-Range": "bytes " + spec.start + "-" + spec.end + "/" + blob.size
                })
            });
        });
    }

    function looksLikePdf(blob) {
        return blob.slice(0, 5).arrayBuffer().then(function (buf) {
            var bytes = new Uint8Array(buf);
            return bytes.length >= 4 &&
                bytes[0] === 0x25 && bytes[1] === 0x50 &&
                bytes[2] === 0x44 && bytes[3] === 0x46;
        });
    }

    function pdfCache() {
        return caches.open(CACHE_PDFS);
    }

    function shellCache() {
        return caches.open(CACHE_SHELL);
    }

    function hasPdf(url) {
        var canon = canonicalPdfUrl(url);
        if (!canon || !isSupported()) {
            return Promise.resolve(false);
        }
        return pdfCache().then(function (cache) {
            return cache.match(canon);
        }).then(function (hit) {
            return !!hit;
        }).catch(function () {
            return false;
        });
    }

    function readBodyWithProgress(response, onProgress) {
        var total = Number(response.headers.get("Content-Length")) || 0;
        if (total > MAX_PDF_BYTES) {
            return Promise.reject(new Error("too-large"));
        }
        if (!response.body || !response.body.getReader) {
            return response.blob().then(function (blob) {
                if (blob.size > MAX_PDF_BYTES) {
                    throw new Error("too-large");
                }
                if (onProgress) {
                    onProgress({ received: blob.size, total: blob.size, percent: 100 });
                }
                return blob;
            });
        }
        var reader = response.body.getReader();
        var chunks = [];
        var received = 0;
        function pump() {
            return reader.read().then(function (part) {
                if (part.done) {
                    if (onProgress) {
                        onProgress({
                            received: received,
                            total: total || received,
                            percent: 100
                        });
                    }
                    return new Blob(chunks, { type: "application/pdf" });
                }
                received += part.value.length;
                if (received > MAX_PDF_BYTES) {
                    try {
                        reader.cancel();
                    } catch (e) {}
                    throw new Error("too-large");
                }
                chunks.push(part.value);
                if (onProgress) {
                    var percent = total ? Math.min(99, Math.round(100 * received / total)) : 0;
                    onProgress({ received: received, total: total, percent: percent });
                }
                return pump();
            });
        }
        return pump();
    }

    function keepPdf(url, onProgress) {
        var canon = canonicalPdfUrl(url);
        if (!canon) {
            return Promise.reject(new Error("not-allowed"));
        }
        if (!isSupported()) {
            return Promise.reject(new Error("unsupported"));
        }
        return pdfCache().then(function (cache) {
            return cache.match(canon).then(function (hit) {
                if (hit) {
                    return precacheShell();
                }
                return fetch(canon, { mode: "cors", credentials: "omit" }).then(function (res) {
                    if (!res || !res.ok) {
                        throw new Error("fetch-failed");
                    }
                    var type = (res.headers.get("Content-Type") || "").toLowerCase();
                    if (type && type.indexOf("pdf") === -1 &&
                        type.indexOf("octet-stream") === -1 &&
                        type.indexOf("application/octet-stream") === -1) {
                        // Empty or generic types still go through the %PDF check.
                        if (type.indexOf("text/") === 0 || type.indexOf("html") !== -1) {
                            throw new Error("not-pdf");
                        }
                    }
                    return readBodyWithProgress(res, onProgress);
                }).then(function (blob) {
                    return looksLikePdf(blob).then(function (ok) {
                        if (!ok) {
                            throw new Error("not-pdf");
                        }
                        var stored = new Response(blob, {
                            headers: {
                                "Content-Type": "application/pdf",
                                "Content-Length": String(blob.size),
                                "Accept-Ranges": "bytes",
                                "Access-Control-Allow-Origin": "*"
                            }
                        });
                        return cache.put(canon, stored);
                    });
                }).then(function () {
                    return precacheShell();
                });
            });
        });
    }

    function removePdf(url) {
        var canon = canonicalPdfUrl(url);
        if (!canon || !isSupported()) {
            return Promise.resolve(false);
        }
        return pdfCache().then(function (cache) {
            return cache.delete(canon);
        });
    }

    function blobUrlFor(url) {
        var canon = canonicalPdfUrl(url);
        if (!canon || !isSupported()) {
            return Promise.resolve(null);
        }
        return pdfCache().then(function (cache) {
            return cache.match(canon);
        }).then(function (hit) {
            if (!hit) {
                return null;
            }
            return hit.blob().then(function (blob) {
                if (typeof URL === "undefined" || !URL.createObjectURL) {
                    return null;
                }
                return URL.createObjectURL(blob);
            });
        }).catch(function () {
            return null;
        });
    }

    function pdfUrlForViewer(url) {
        return hasPdf(url).then(function (saved) {
            if (!saved) {
                return null;
            }
            var canon = canonicalPdfUrl(url);
            return blobUrlFor(url).then(function (blobUrl) {
                if (blobUrl) {
                    return { url: blobUrl, via: "blob" };
                }
                if (canon) {
                    return { url: canon, via: "sw" };
                }
                return null;
            });
        });
    }

    function precacheShell() {
        if (!isSupported()) {
            return Promise.resolve();
        }
        return shellCache().then(function (cache) {
            return Promise.all(SHELL_URLS.map(function (u) {
                return fetch(u, { credentials: "same-origin" }).then(function (res) {
                    if (res && res.ok) {
                        return cache.put(u, res);
                    }
                }).catch(function () {});
            }));
        });
    }

    function pruneShellCaches() {
        if (!isSupported() || typeof caches.keys !== "function") {
            return Promise.resolve();
        }
        return caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (name) {
                if (name.indexOf(SHELL_PREFIX) === 0 && name !== CACHE_SHELL) {
                    return caches.delete(name);
                }
            }));
        });
    }

    function respondPdf(request) {
        var canon = canonicalPdfUrl(request.url);
        if (!canon) {
            return fetch(request);
        }
        return pdfCache().then(function (cache) {
            return cache.match(canon).then(function (cached) {
                if (cached) {
                    return rangeResponse(cached, request);
                }
                return fetch(request);
            });
        }).catch(function () {
            return fetch(request);
        });
    }

    function respondShell(request) {
        return shellCache().then(function (cache) {
            var url;
            try {
                url = new URL(request.url);
            } catch (e) {
                url = null;
            }
            var pageMatch = Promise.resolve(null);
            if (request.mode === "navigate" || (url && url.pathname === "/viewer.html")) {
                pageMatch = cache.match("/viewer.html");
            }
            return pageMatch.then(function (page) {
                if (page) {
                    return page;
                }
                return cache.match(request);
            }).then(function (hit) {
                if (hit) {
                    return hit;
                }
                return fetch(request).then(function (res) {
                    if (res && res.ok && request.method === "GET") {
                        cache.put(request, res.clone());
                    }
                    return res;
                }, function (err) {
                    return cache.match(request, { ignoreSearch: true }).then(function (fallback) {
                        if (fallback) {
                            return fallback;
                        }
                        throw err;
                    });
                });
            });
        });
    }

    function registerWorker() {
        if (typeof navigator === "undefined" || !navigator.serviceWorker) {
            return Promise.resolve(null);
        }
        return navigator.serviceWorker.register("/sw-viewer.js").catch(function () {
            return null;
        });
    }

    global.BMOfflinePdf = {
        ALLOWED_HOST: ALLOWED_HOST,
        CACHE_PDFS: CACHE_PDFS,
        CACHE_SHELL: CACHE_SHELL,
        SHELL_URLS: SHELL_URLS,
        MAX_PDF_BYTES: MAX_PDF_BYTES,
        isAllowedCdnPdf: isAllowedCdnPdf,
        canonicalPdfUrl: canonicalPdfUrl,
        displayName: displayName,
        isSupported: isSupported,
        isShellPath: isShellPath,
        parseByteRange: parseByteRange,
        hasPdf: hasPdf,
        keepPdf: keepPdf,
        removePdf: removePdf,
        blobUrlFor: blobUrlFor,
        pdfUrlForViewer: pdfUrlForViewer,
        precacheShell: precacheShell,
        pruneShellCaches: pruneShellCaches,
        respondPdf: respondPdf,
        respondShell: respondShell,
        rangeResponse: rangeResponse,
        registerWorker: registerWorker
    };
})(typeof self !== "undefined" ? self : this);
