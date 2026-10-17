/*
 * BoilerManuals.com online manual viewer.
 * Streams large PDFs from cdn.boilermanuals.com with HTTP range requests
 * (64 KB chunks, no background pre-fetch) and renders pages lazily as they
 * scroll into view, so big manuals open quickly in car and phone browsers.
 * Uses the self-hosted PDF.js legacy build in /pdfjs/.
 */
import * as pdfjsLib from "/pdfjs/build/pdf.min.mjs";

var state = window.BMViewer || {};
var statusEl = document.getElementById("pvStatus");
var pagesEl = document.getElementById("pvPages");
var toolbar = document.getElementById("pvToolbar");
var pageInput = document.getElementById("pvPageInput");
var pageCountEl = document.getElementById("pvPageCount");
var prevBtn = document.getElementById("pvPrev");
var nextBtn = document.getElementById("pvNext");
var zoomInBtn = document.getElementById("pvZoomIn");
var zoomOutBtn = document.getElementById("pvZoomOut");

// Memory limits for low-end browsers.
var MAX_RENDERED_PAGES = 6;          // canvases kept alive at once
var MAX_CANVAS_PIXELS = 4000000;     // ~16 MB of RGBA per canvas
var MAX_OUTPUT_SCALE = 1.5;          // cap devicePixelRatio
var RENDER_DELAY_MS = 150;         // settle time before a page is fetched
var ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

var pdfDoc = null;
var pages = [];          // { num, box, canvas, width, height, rendered, task, renderedZoom }
var zoomIndex = ZOOM_STEPS.indexOf(1);
var baseWidth = 0;       // fit-width in CSS px, for zoom 1
var currentPage = 1;
var observer = null;

function setStatus(html, isError) {
    statusEl.className = "pv-status" + (isError ? " pv-status--error" : "");
    statusEl.innerHTML = html;
    statusEl.hidden = !html;
}

function downloadHtml() {
    return ' <a href="' + state.file.replace(/&/g, "&amp;").replace(/"/g, "&quot;") +
        '" rel="nofollow">Download the PDF</a> instead.';
}

function fitWidth() {
    var w = pagesEl.clientWidth - 16;
    return Math.max(240, Math.min(w, 1100));
}

function zoom() {
    return ZOOM_STEPS[zoomIndex];
}

function placeToolbar() {
    // Sit just under the sticky site header.
    var header = document.querySelector(".site-header");
    toolbar.style.top = header ? header.offsetHeight + "px" : "0px";
}

function sizeBox(p) {
    var cssWidth = Math.round(baseWidth * zoom());
    var cssHeight = Math.round(cssWidth * p.height / p.width);
    p.box.style.width = cssWidth + "px";
    p.box.style.height = cssHeight + "px";
}

function releasePage(p) {
    if (p.task) {
        p.task.cancel();
        p.task = null;
    }
    if (p.canvas) {
        p.canvas.width = 0;
        p.canvas.height = 0;
        p.canvas.remove();
        p.canvas = null;
    }
    p.rendered = false;
    p.box.classList.remove("is-rendered");
    if (p.pdfPage) {
        p.pdfPage.cleanup();
    }
}

function evictFarPages() {
    var live = pages.filter(function (p) { return p.canvas; });
    if (live.length <= MAX_RENDERED_PAGES) {
        return;
    }
    live.sort(function (a, b) {
        return Math.abs(b.num - currentPage) - Math.abs(a.num - currentPage);
    });
    for (var i = 0; i < live.length - MAX_RENDERED_PAGES; i++) {
        releasePage(live[i]);
    }
}

async function renderPage(p) {
    if (p.task || (p.rendered && p.renderedZoom === zoom())) {
        return;
    }
    var zoomAtStart = zoom();
    try {
        var page = p.pdfPage || (p.pdfPage = await pdfDoc.getPage(p.num));
        var unscaled = page.getViewport({ scale: 1 });
        if (unscaled.width !== p.width || unscaled.height !== p.height) {
            p.width = unscaled.width;
            p.height = unscaled.height;
            sizeBox(p);
        }
        var cssScale = (baseWidth * zoomAtStart) / unscaled.width;
        var outputScale = Math.min(window.devicePixelRatio || 1, MAX_OUTPUT_SCALE);
        var pixels = unscaled.width * unscaled.height * Math.pow(cssScale * outputScale, 2);
        if (pixels > MAX_CANVAS_PIXELS) {
            outputScale *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);
        }
        var viewport = page.getViewport({ scale: cssScale * outputScale });
        var canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.setAttribute("aria-label", "Page " + p.num);
        var task = page.render({
            canvas: canvas,
            canvasContext: canvas.getContext("2d", { alpha: false }),
            viewport: viewport
        });
        p.task = task;
        await task.promise;
        p.task = null;
        if (p.canvas) {
            p.canvas.width = 0;
            p.canvas.remove();
        }
        p.canvas = canvas;
        p.box.appendChild(canvas);
        p.rendered = true;
        p.renderedZoom = zoomAtStart;
        p.box.classList.add("is-rendered");
        if (zoomAtStart !== zoom()) {
            renderPage(p);
        }
        evictFarPages();
    } catch (err) {
        p.task = null;
        if (err && err.name === "RenderingCancelledException") {
            return;
        }
        console.error("Page " + p.num + " failed", err);
        var label = p.box.querySelector(".pv-pagenum");
        if (label) {
            label.textContent = "Page " + p.num + " could not be shown";
        }
    }
}

function updatePageUi() {
    pageInput.value = String(currentPage);
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= pages.length;
    zoomOutBtn.disabled = zoomIndex <= 0;
    zoomInBtn.disabled = zoomIndex >= ZOOM_STEPS.length - 1;
}

function trackCurrentPage() {
    var ticking = false;
    window.addEventListener("scroll", function () {
        if (ticking) {
            return;
        }
        ticking = true;
        window.requestAnimationFrame(function () {
            ticking = false;
            var mid = toolbar.getBoundingClientRect().bottom +
                (window.innerHeight - toolbar.getBoundingClientRect().bottom) / 3;
            for (var i = 0; i < pages.length; i++) {
                var r = pages[i].box.getBoundingClientRect();
                if (r.bottom >= mid) {
                    if (currentPage !== i + 1) {
                        currentPage = i + 1;
                        if (document.activeElement !== pageInput) {
                            updatePageUi();
                        }
                    }
                    break;
                }
            }
        });
    }, { passive: true });
}

function goToPage(n) {
    n = Math.max(1, Math.min(pages.length, n | 0));
    if (!n) {
        return;
    }
    currentPage = n;
    var box = pages[n - 1].box;
    var offset = toolbar.getBoundingClientRect().bottom + 8;
    window.scrollTo(0, Math.max(0, window.pageYOffset + box.getBoundingClientRect().top - offset));
    updatePageUi();
}

function refreshVisible() {
    // Re-observing fires the callback again for pages already on screen.
    if (!observer) {
        return;
    }
    pages.forEach(function (p) {
        observer.unobserve(p.box);
        observer.observe(p.box);
    });
}

function setZoom(index) {
    if (index < 0 || index >= ZOOM_STEPS.length || index === zoomIndex) {
        return;
    }
    var keep = currentPage;
    zoomIndex = index;
    pages.forEach(function (p) {
        sizeBox(p);
        if (p.canvas && Math.abs(p.num - keep) > 1) {
            releasePage(p);
        }
    });
    goToPage(keep);
    refreshVisible();
}

function buildPages(first) {
    var frag = document.createDocumentFragment();
    for (var i = 1; i <= pdfDoc.numPages; i++) {
        var box = document.createElement("div");
        box.className = "pv-pagebox";
        box.dataset.page = String(i);
        var label = document.createElement("span");
        label.className = "pv-pagenum";
        label.textContent = "Page " + i;
        box.appendChild(label);
        var p = { num: i, box: box, canvas: null, width: first.width, height: first.height, rendered: false, task: null };
        pages.push(p);
        sizeBox(p);
        frag.appendChild(box);
    }
    pagesEl.appendChild(frag);

    // Render a page only once it has stayed near the screen briefly, so fast
    // scrolling or flicking past pages doesn't download them all.
    observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            var p = pages[Number(entry.target.dataset.page) - 1];
            clearTimeout(p.timer);
            if (entry.isIntersecting) {
                p.timer = setTimeout(function () { renderPage(p); }, RENDER_DELAY_MS);
            }
        });
    }, { rootMargin: "300px 0px" });
    pages.forEach(function (p) { observer.observe(p.box); });
}

function wireControls() {
    prevBtn.addEventListener("click", function () { goToPage(currentPage - 1); });
    nextBtn.addEventListener("click", function () { goToPage(currentPage + 1); });
    zoomInBtn.addEventListener("click", function () { setZoom(zoomIndex + 1); });
    zoomOutBtn.addEventListener("click", function () { setZoom(zoomIndex - 1); });
    pageInput.addEventListener("change", function () { goToPage(parseInt(pageInput.value, 10)); });
    pageInput.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
            goToPage(parseInt(pageInput.value, 10));
            pageInput.blur();
        }
    });
    var resizeTimer = null;
    window.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            placeToolbar();
            var w = fitWidth();
            if (Math.abs(w - baseWidth) < 24) {
                return;
            }
            baseWidth = w;
            var keep = currentPage;
            pages.forEach(function (p) {
                sizeBox(p);
                if (p.canvas) {
                    releasePage(p);
                }
            });
            goToPage(keep);
            refreshVisible();
        }, 250);
    });
}

async function start() {
    placeToolbar();
    setTimeout(placeToolbar, 300);
    if (!state.file) {
        return;
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/build/pdf.worker.min.mjs";
    var loadingTask = pdfjsLib.getDocument({
        url: state.file,
        withCredentials: false,
        // Range requests in 64 KB chunks; only fetch what the visible pages need.
        // disableStream must be true as well, otherwise PDF.js keeps streaming
        // the whole file in the background (see PDF.js docs for disableAutoFetch).
        disableRange: false,
        disableAutoFetch: true,
        disableStream: true,
        rangeChunkSize: 65536,
        standardFontDataUrl: "/pdfjs/standard_fonts/",
        wasmUrl: "/pdfjs/wasm/",
        isEvalSupported: false,
        enableXfa: false
    });
    try {
        pdfDoc = await loadingTask.promise;
    } catch (err) {
        console.error(err);
        var msg = "Sorry, this manual couldn't be opened in the viewer.";
        if (err && err.name === "PasswordException") {
            msg = "This manual is password protected.";
        }
        setStatus(msg + downloadHtml(), true);
        return;
    }
    var first = (await pdfDoc.getPage(1)).getViewport({ scale: 1 });
    baseWidth = fitWidth();
    setStatus("");
    pageCountEl.textContent = String(pdfDoc.numPages);
    pageInput.max = String(pdfDoc.numPages);
    pageInput.disabled = false;
    buildPages(first);
    wireControls();
    trackCurrentPage();
    updatePageUi();
    window.BMViewerReady = { pages: pdfDoc.numPages };
}

start();
