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
    // Sit just under the sticky site header; the search bar sits under the toolbar.
    var header = document.querySelector(".site-header");
    var top = header ? header.offsetHeight : 0;
    toolbar.style.top = top + "px";
    var bar = document.getElementById("pvSearchBar");
    if (bar) {
        bar.style.top = (top + toolbar.offsetHeight) + "px";
    }
}

function stickyBottom() {
    // Bottom edge of the toolbar, or of the search bar when it is open.
    var bar = document.getElementById("pvSearchBar");
    var el = bar && !bar.hidden ? bar : toolbar;
    return el.getBoundingClientRect().bottom;
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
            var top = stickyBottom();
            var mid = top + (window.innerHeight - top) / 3;
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
    var offset = stickyBottom() + 8;
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


/* ------------------------------------------------------------------ */
/* Text search                                                         */
/* Text is pulled page by page only when the user searches (the file   */
/* is never pre-loaded), with progress, a Stop button and a check for  */
/* scanned manuals that have no text layer.                            */
/* ------------------------------------------------------------------ */
var search = {
    bar: null, input: null, count: null, msg: null,
    prevBtn: null, nextBtn: null, stopBtn: null, closeBtn: null, toggle: null,
    texts: [],          // per page: { str, map: [[itemIndex, offsetInItem] | null], items, vw, vh }
    matches: [],        // { page, rects: [{x, y, w, h}] in % of the page }
    current: -1,
    runId: 0,
    running: false,
    query: "",
    hasText: null       // null = not checked yet
};

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildMatcher(query) {
    var q = query.trim().replace(/\s+/g, " ");
    if (!q) {
        return null;
    }
    // Fault codes are printed as F28, F.28, F 28 or F-28: allow a separator
    // where letters meet digits. Spaces match any run of whitespace.
    // (No look-behind: older phone and car browsers can't parse it.)
    var parts = q.split(" ").map(function (word) {
        var out = "";
        for (var i = 0; i < word.length; i++) {
            var c = word.charAt(i);
            var prev = i ? word.charAt(i - 1) : "";
            if (prev && ((/[A-Za-z]/.test(prev) && /\d/.test(c)) || (/\d/.test(prev) && /[A-Za-z]/.test(c)))) {
                out += "[.\\s\\-]?";
            }
            out += escapeRegExp(c);
        }
        return out;
    });
    var body = parts.join("\\s*");
    // Very short queries (e.g. "EA") match whole words only, so "EA" doesn't hit "heat".
    var whole = q.replace(/[^A-Za-z0-9]/g, "").length <= 3;
    var re = whole ? new RegExp("(^|[^A-Za-z0-9])(" + body + ")(?![A-Za-z0-9])", "gi") : new RegExp(body, "gi");
    re.wholeWord = whole;
    return re;
}

function setSearchMsg(text) {
    search.msg.textContent = text || "";
    search.msg.hidden = !text;
    placeToolbar();
}

function setCount(text) {
    search.count.textContent = text;
}

function updateSearchButtons() {
    var n = search.matches.length;
    search.prevBtn.disabled = n === 0;
    search.nextBtn.disabled = n === 0;
    search.stopBtn.hidden = !search.running;
}

async function pageText(num) {
    if (search.texts[num]) {
        return search.texts[num];
    }
    var page = pages[num - 1].pdfPage || (pages[num - 1].pdfPage = await pdfDoc.getPage(num));
    var vp = page.getViewport({ scale: 1 });
    var content = await page.getTextContent();
    var str = "";
    var map = [];
    var items = [];
    content.items.forEach(function (item) {
        if (typeof item.str !== "string") {
            return;
        }
        var idx = items.length;
        items.push(item);
        for (var i = 0; i < item.str.length; i++) {
            str += item.str[i];
            map.push([idx, i]);
        }
        if (item.hasEOL) {
            str += " ";
            map.push(null);
        }
    });
    var t = { str: str, map: map, items: items, vp: vp };
    search.texts[num] = t;
    return t;
}

function itemRect(t, item, from, to) {
    // Rectangle of characters [from, to) of a text item, in % of the page.
    var len = Math.max(item.str.length, 1);
    var tr = item.transform;
    var fontH = Math.sqrt(tr[2] * tr[2] + tr[3] * tr[3]) || item.height || 10;
    var x0 = tr[4] + item.width * (from / len);
    var x1 = tr[4] + item.width * (to / len);
    var y0 = tr[5] - fontH * 0.22;
    var y1 = tr[5] + fontH * 0.92;
    var a = t.vp.convertToViewportPoint(x0, y0);
    var b = t.vp.convertToViewportPoint(x1, y1);
    var left = Math.min(a[0], b[0]), top = Math.min(a[1], b[1]);
    var w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
    return {
        x: 100 * left / t.vp.width,
        y: 100 * top / t.vp.height,
        w: Math.max(100 * w / t.vp.width, 0.4),
        h: Math.max(100 * h / t.vp.height, 0.6)
    };
}

function findInPage(num, t, re) {
    var found = [];
    re.lastIndex = 0;
    var m;
    while ((m = re.exec(t.str)) !== null) {
        var start = m.index, text = m[0];
        if (re.wholeWord) {
            start += m[1].length;
            text = m[2];
        }
        if (!text.length) {
            re.lastIndex++;
            continue;
        }
        // Split the match into one rectangle per text item it covers.
        var rects = [];
        var run = null;
        for (var i = start; i < start + text.length; i++) {
            var e = t.map[i];
            if (!e) {
                continue;
            }
            if (run && run.item === e[0] && e[1] === run.to) {
                run.to++;
            } else {
                if (run) {
                    rects.push(itemRect(t, t.items[run.item], run.from, run.to));
                }
                run = { item: e[0], from: e[1], to: e[1] + 1 };
            }
        }
        if (run) {
            rects.push(itemRect(t, t.items[run.item], run.from, run.to));
        }
        if (rects.length) {
            found.push({ page: num, rects: rects });
        }
    }
    return found;
}

function drawPageHighlights(num) {
    var p = pages[num - 1];
    var layer = p.box.querySelector(".pv-hl-layer");
    if (layer) {
        layer.remove();
    }
    var frag = null;
    search.matches.forEach(function (match, mi) {
        if (match.page !== num) {
            return;
        }
        if (!frag) {
            frag = document.createElement("div");
            frag.className = "pv-hl-layer";
        }
        match.rects.forEach(function (r) {
            var el = document.createElement("span");
            el.className = "pv-hl" + (mi === search.current ? " is-current" : "");
            el.dataset.match = String(mi);
            el.style.left = r.x + "%";
            el.style.top = r.y + "%";
            el.style.width = r.w + "%";
            el.style.height = r.h + "%";
            frag.appendChild(el);
        });
    });
    if (frag) {
        p.box.appendChild(frag);
    }
}

function redrawAllHighlights() {
    // Match indexes shift as results from other pages arrive, so redraw every page with matches.
    clearHighlights();
    var done = {};
    search.matches.forEach(function (m) {
        if (!done[m.page]) {
            done[m.page] = true;
            drawPageHighlights(m.page);
        }
    });
}

function clearHighlights() {
    Array.prototype.forEach.call(pagesEl.querySelectorAll(".pv-hl-layer"), function (el) { el.remove(); });
}

function showCurrentCount() {
    var n = search.matches.length;
    if (!n) {
        return;
    }
    var shown = search.current >= 0 ? search.current + 1 : 0;
    setCount(shown + " of " + n + (search.running ? "+" : ""));
}

function goToMatch(i) {
    var n = search.matches.length;
    if (!n) {
        return;
    }
    var old = search.current;
    search.current = ((i % n) + n) % n;
    var m = search.matches[search.current];
    if (old >= 0 && search.matches[old] && search.matches[old].page !== m.page) {
        drawPageHighlights(search.matches[old].page);
    }
    drawPageHighlights(m.page);
    var box = pages[m.page - 1].box;
    var r = m.rects[0];
    var y = window.pageYOffset + box.getBoundingClientRect().top + box.offsetHeight * r.y / 100;
    var visibleTop = stickyBottom();
    window.scrollTo(0, Math.max(0, y - visibleTop - (window.innerHeight - visibleTop) / 3));
    // Bring the match into view horizontally when zoomed in.
    var x = box.offsetLeft + box.offsetWidth * r.x / 100;
    if (pagesEl.scrollWidth > pagesEl.clientWidth) {
        pagesEl.scrollLeft = Math.max(0, x - pagesEl.clientWidth / 3);
    }
    currentPage = m.page;
    updatePageUi();
    showCurrentCount();
}

async function checkHasText(runId) {
    // Sample a few pages: scanned manuals return no text at all.
    if (search.hasText !== null) {
        return search.hasText;
    }
    var n = pdfDoc.numPages;
    var sample = [1, 2, 3, Math.ceil(n / 2), n].filter(function (v, i, a) {
        return v >= 1 && v <= n && a.indexOf(v) === i;
    });
    var chars = 0;
    for (var i = 0; i < sample.length; i++) {
        if (runId !== search.runId) {
            return null;
        }
        setCount("Checking\u2026");
        var t = await pageText(sample[i]);
        chars += t.str.replace(/\s+/g, "").length;
        if (chars >= 20) {
            break;
        }
    }
    search.hasText = chars >= 20;
    return search.hasText;
}

function stopSearch(reason) {
    search.runId++;
    if (search.running) {
        search.running = false;
        if (reason === "user") {
            var last = search.lastPage || 0;
            setSearchMsg("Search stopped at page " + last + " of " + pdfDoc.numPages + ".");
            if (!search.matches.length) {
                setCount("0");
            }
        }
    }
    updateSearchButtons();
    showCurrentCount();
}

async function runSearch(query) {
    stopSearch();
    var runId = search.runId;
    search.query = query;
    search.matches = [];
    search.current = -1;
    clearHighlights();
    setSearchMsg("");
    setCount("");
    var re = buildMatcher(query);
    if (!re) {
        updateSearchButtons();
        return;
    }
    search.running = true;
    updateSearchButtons();
    var hasText;
    try {
        hasText = await checkHasText(runId);
    } catch (err) {
        console.error(err);
        hasText = true;
    }
    if (runId !== search.runId) {
        return;
    }
    if (!hasText) {
        search.running = false;
        setCount("");
        setSearchMsg("This manual is a scanned image, so search isn\u2019t available. Use the page numbers or zoom instead.");
        updateSearchButtons();
        return;
    }
    var n = pdfDoc.numPages;
    // Start at the page being read, then wrap round, so nearby results show first.
    var order = [];
    for (var k = 0; k < n; k++) {
        order.push(((currentPage - 1 + k) % n) + 1);
    }
    var textChars = 0;
    for (var j = 0; j < order.length; j++) {
        var num = order[j];
        if (runId !== search.runId) {
            return;
        }
        search.lastPage = j + 1;
        if (!search.matches.length) {
            setCount("Page " + (j + 1) + "/" + n);
        }
        setSearchMsg("Searching page " + (j + 1) + " of " + n + "\u2026");
        var t;
        try {
            t = await pageText(num);
        } catch (err) {
            console.error("Search: page " + num + " failed", err);
            continue;
        }
        if (runId !== search.runId) {
            return;
        }
        textChars += t.str.length;
        var found = findInPage(num, t, re);
        if (found.length) {
            search.matches = search.matches.concat(found);
            search.matches.sort(function (a, b) { return a.page - b.page; });
            if (search.current < 0) {
                // Jump to the first result as soon as it is found.
                goToMatch(search.matches.indexOf(found[0]));
            } else {
                var cur = search.matches.indexOf(search.lastShown);
                if (cur >= 0) {
                    search.current = cur;
                }
            }
            redrawAllHighlights();
            search.lastShown = search.matches[search.current];
            updateSearchButtons();
            showCurrentCount();
        }
        // Let the page breathe between pages (scrolling, typing, Stop).
        await new Promise(function (r) { setTimeout(r, 0); });
    }
    if (runId !== search.runId) {
        return;
    }
    search.running = false;
    updateSearchButtons();
    if (!search.matches.length) {
        setCount("0");
        setSearchMsg(textChars < 20 ?
            "This manual is a scanned image, so search isn\u2019t available." :
            "No matches for \u201c" + query.trim() + "\u201d.");
    } else {
        setSearchMsg("");
        showCurrentCount();
    }
}

function openSearch() {
    search.bar.hidden = false;
    search.toggle.setAttribute("aria-expanded", "true");
    placeToolbar();
    search.input.focus();
    search.input.select();
}

function closeSearch() {
    stopSearch();
    search.bar.hidden = true;
    search.toggle.setAttribute("aria-expanded", "false");
    search.matches = [];
    search.current = -1;
    search.query = "";
    clearHighlights();
    setSearchMsg("");
    setCount("");
    updateSearchButtons();
    search.toggle.focus();
}

function setupSearch() {
    search.bar = document.getElementById("pvSearchBar");
    search.toggle = document.getElementById("pvSearchToggle");
    if (!search.bar || !search.toggle) {
        return;
    }
    search.input = document.getElementById("pvSearchInput");
    search.count = document.getElementById("pvSearchCount");
    search.msg = document.getElementById("pvSearchMsg");
    search.prevBtn = document.getElementById("pvSearchPrev");
    search.nextBtn = document.getElementById("pvSearchNext");
    search.stopBtn = document.getElementById("pvSearchStop");
    search.closeBtn = document.getElementById("pvSearchClose");
    search.toggle.disabled = false;

    search.toggle.addEventListener("click", function () {
        if (search.bar.hidden) {
            openSearch();
        } else {
            closeSearch();
        }
    });
    search.closeBtn.addEventListener("click", closeSearch);
    search.stopBtn.addEventListener("click", function () { stopSearch("user"); });
    search.nextBtn.addEventListener("click", function () {
        goToMatch(search.current + 1);
        search.lastShown = search.matches[search.current];
    });
    search.prevBtn.addEventListener("click", function () {
        goToMatch(search.current - 1);
        search.lastShown = search.matches[search.current];
    });
    var typingTimer = null;
    search.input.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
            ev.preventDefault();
            clearTimeout(typingTimer);
            var q = search.input.value;
            if (q.trim() && q === search.query && search.matches.length) {
                goToMatch(search.current + (ev.shiftKey ? -1 : 1));
                search.lastShown = search.matches[search.current];
            } else {
                runSearch(q);
            }
        } else if (ev.key === "Escape") {
            ev.preventDefault();
            closeSearch();
        }
    });
    // Search after a pause in typing, but only for 2+ characters.
    search.input.addEventListener("input", function () {
        clearTimeout(typingTimer);
        var q = search.input.value;
        if (!q.trim()) {
            stopSearch();
            search.matches = [];
            search.current = -1;
            search.query = "";
            clearHighlights();
            setSearchMsg("");
            setCount("");
            updateSearchButtons();
            return;
        }
        if (q.trim().length < 2) {
            return;
        }
        typingTimer = setTimeout(function () { runSearch(q); }, 600);
    });
    document.addEventListener("keydown", function (ev) {
        // Ctrl/Cmd+F opens our search instead of the browser's (which can't see canvas text).
        if ((ev.ctrlKey || ev.metaKey) && (ev.key === "f" || ev.key === "F")) {
            ev.preventDefault();
            openSearch();
        }
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
    setupSearch();
    trackCurrentPage();
    updatePageUi();
    window.BMViewerReady = { pages: pdfDoc.numPages };
}

start();
