(function () {
    var index = [];
    var indexLoadState = "pending";
    var maxResults = 40;
    var searchInput = null;
    var searchSection = null;
    var resultsVisible = false;
    var searchHistoryPushed = false;

    function currentUrl() {
        return window.location.pathname + window.location.search + window.location.hash;
    }

    function getIndexUrl() {
        var scripts = document.getElementsByTagName("script");
        for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].src;
            if (src && src.indexOf("home-search.js") !== -1) {
                return src.replace(/home-search\.js(?:\?.*)?$/, "boiler-search-index.json");
            }
        }
        return "js/boiler-search-index.json";
    }

    function normalizeQuery(value) {
        return value.trim().toLowerCase();
    }

    function gcQueryDigits(value) {
        return value.replace(/\D/g, "");
    }

    function isGcStyleInput(value) {
        return /^[\d\s-]+$/.test(value.trim());
    }

    function getEntryGcDigits(entry) {
        if (entry.gcDigits) {
            return entry.gcDigits;
        }
        if (!entry.gc) {
            return "";
        }
        return entry.gc.replace(/\D/g, "");
    }

    function gcDigitsMatch(entry, queryGcDigits) {
        if (!queryGcDigits || queryGcDigits.length < 3) {
            return false;
        }

        var entryGcDigits = getEntryGcDigits(entry);
        if (!entryGcDigits) {
            return false;
        }

        if (entryGcDigits === queryGcDigits) {
            return true;
        }

        if (entryGcDigits.indexOf(queryGcDigits) !== -1) {
            return true;
        }

        if (queryGcDigits.indexOf(entryGcDigits) !== -1) {
            return true;
        }

        return false;
    }

    function prepareText(value) {
        var s = String(value || "");
        s = s.replace(/²/g, "2");
        s = s.replace(/[–—−]/g, "-");
        s = s.replace(/(\S)\s*\+/g, "$1+");
        s = s.replace(/([a-z])([A-Z])/g, "$1 $2");
        return s.toLowerCase();
    }

    function spacedText(value) {
        return prepareText(value)
            .replace(/[^a-z0-9+]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function tokenize(value) {
        var parts = spacedText(value).split(" ");
        var tokens = [];
        var i;
        for (i = 0; i < parts.length; i++) {
            var raw = parts[i];
            if (!raw) {
                continue;
            }
            var plus = raw.indexOf("+") !== -1;
            var text = raw.replace(/\+/g, "");
            if (!text) {
                continue;
            }
            var pieces = text.split(/([0-9]+)/);
            var alnumParts = [];
            var j;
            for (j = 0; j < pieces.length; j++) {
                if (pieces[j]) {
                    alnumParts.push(pieces[j]);
                }
            }
            tokens.push({
                text: text,
                plus: plus,
                pos: tokens.length,
                parts: alnumParts
            });
        }
        return tokens;
    }

    function hasDigit(s) {
        return /[0-9]/.test(s);
    }

    function tokenMatchRank(queryText, hayToken) {
        if (queryText === hayToken.text) {
            return 3;
        }

        var i;
        for (i = 0; i < hayToken.parts.length; i++) {
            if (queryText === hayToken.parts[i]) {
                return 2;
            }
        }

        if (hasDigit(queryText) && hayToken.text.indexOf(queryText) === 0) {
            var rest = hayToken.text.slice(queryText.length);
            if (rest && /^[a-z]+$/.test(rest)) {
                return 1;
            }
        }

        return 0;
    }

    function compactRange(tokens, start, count) {
        var s = "";
        var i;
        for (i = 0; i < count; i++) {
            if (!tokens[start + i]) {
                return "";
            }
            s += tokens[start + i].text;
        }
        return s;
    }

    function isBetterHayMatch(candidate, best, minPos) {
        if (!best) {
            return true;
        }
        var candOrdered = candidate.pos >= minPos;
        var bestOrdered = best.pos >= minPos;
        if (candOrdered !== bestOrdered) {
            return candOrdered;
        }
        if (candidate.rank !== best.rank) {
            return candidate.rank > best.rank;
        }
        if (candidate.plusMismatch !== best.plusMismatch) {
            return candidate.plusMismatch < best.plusMismatch;
        }
        return candidate.pos < best.pos;
    }

    function bestHayMatch(queryToken, hayTokens, minPos) {
        var best = null;
        var i;
        for (i = 0; i < hayTokens.length; i++) {
            var rank = tokenMatchRank(queryToken.text, hayTokens[i]);
            if (!rank && /[a-z]/.test(queryToken.text)) {
                var compactTwo = compactRange(hayTokens, i, 2);
                var compactThree = compactRange(hayTokens, i, 3);
                if (compactTwo && queryToken.text === compactTwo && queryToken.text.length >= 3) {
                    rank = 2;
                } else if (compactThree && queryToken.text === compactThree && queryToken.text.length >= 4) {
                    rank = 2;
                }
            }
            if (!rank) {
                continue;
            }
            var candidate = {
                pos: hayTokens[i].pos,
                rank: rank,
                plusMismatch: queryToken.plus && !hayTokens[i].plus ? 1 : 0
            };
            if (isBetterHayMatch(candidate, best, minPos)) {
                best = candidate;
            }
        }
        return best;
    }

    function matchTokens(queryTokens, hayTokens) {
        var i;
        var ordered = true;
        var gap = 0;
        var rankPenalty = 0;
        var plusPenalty = 0;
        var minPos = 0;
        var lastPos = -1;

        for (i = 0; i < queryTokens.length; i++) {
            var found = bestHayMatch(queryTokens[i], hayTokens, minPos);
            if (!found) {
                return null;
            }
            if (found.pos < minPos) {
                ordered = false;
            } else {
                if (lastPos >= 0) {
                    gap += found.pos - lastPos - 1;
                }
                minPos = found.pos + 1;
                lastPos = found.pos;
            }
            rankPenalty += 3 - found.rank;
            plusPenalty += found.plusMismatch;
        }

        return {
            ordered: ordered,
            gap: gap,
            rankPenalty: rankPenalty,
            plusPenalty: plusPenalty
        };
    }

    function phraseBonus(haySpaced, querySpaced) {
        if (!querySpaced || !haySpaced) {
            return 0;
        }
        var idx = haySpaced.indexOf(querySpaced);
        var best = 0;
        while (idx !== -1) {
            var before = idx === 0 ? " " : haySpaced.charAt(idx - 1);
            var afterIdx = idx + querySpaced.length;
            var after = afterIdx >= haySpaced.length ? " " : haySpaced.charAt(afterIdx);
            var boundaryBefore = /[^a-z0-9]/.test(before);
            var boundaryAfter = /[^a-z0-9]/.test(after);
            var score = 800;
            if (boundaryBefore && boundaryAfter) {
                score = 6000;
            } else if (boundaryBefore) {
                score = 2500;
            }
            if (score > best) {
                best = score;
            }
            if (best === 6000) {
                return best;
            }
            idx = haySpaced.indexOf(querySpaced, idx + 1);
        }
        return best;
    }

    function scoreTextMatch(entry, query, queryTokens) {
        if (!query || !queryTokens.length) {
            return null;
        }

        var brand = String(entry.brand || "");
        var model = String(entry.model || "");
        var combined = brand + " " + model;
        var tokenHit = matchTokens(queryTokens, tokenize(combined));
        var modelSpaced = spacedText(model);
        var combinedSpaced = spacedText(combined);
        var querySpaced = spacedText(query);
        var phrase = phraseBonus(modelSpaced, querySpaced);
        var combinedPhrase = phraseBonus(combinedSpaced, querySpaced);
        if (combinedPhrase > phrase) {
            phrase = Math.max(phrase, combinedPhrase - 400);
        }

        if (!tokenHit) {
            return null;
        }

        var score = 10000 + phrase;
        if (tokenHit.ordered) {
            score += 2500;
            score -= Math.min(tokenHit.gap, 24) * 80;
        } else {
            score += 400;
        }
        score -= tokenHit.rankPenalty * 350;
        score -= tokenHit.plusPenalty * 500;
        score -= Math.min(modelSpaced.length, 120);
        return score;
    }

    function scoreEntry(entry, query, gcDigits, rawQuery) {
        if (!query && !gcDigits) {
            return null;
        }

        var gcStyleInput = isGcStyleInput(rawQuery);
        var gcExact = false;
        var gcPartial = false;

        if (gcDigits.length >= 4) {
            var entryGc = getEntryGcDigits(entry);
            if (entryGc) {
                if (entryGc === gcDigits) {
                    gcExact = true;
                } else if (gcDigitsMatch(entry, gcDigits)) {
                    gcPartial = true;
                }
            }
        }

        if (gcStyleInput) {
            if (gcDigits.length >= 4 && (gcExact || gcPartial)) {
                return gcExact ? 200000 : 150000;
            }
            return null;
        }

        var score = 0;
        var matched = false;
        var textScore = scoreTextMatch(entry, query, tokenize(query));
        if (textScore !== null) {
            matched = true;
            score += textScore;
        }

        if (query && entry.gc && String(entry.gc).toLowerCase().indexOf(query) !== -1) {
            matched = true;
            score += 80000;
        }

        if (gcExact) {
            matched = true;
            score += 100000;
        } else if (gcPartial) {
            matched = true;
            score += 50000;
        }

        return matched ? score : null;
    }

    function searchEntries(entries, rawQuery, options) {
        options = options || {};
        var max = options.maxResults;
        if (max == null) {
            max = maxResults;
        }
        var brandFilter = options.brandFilter || null;
        var query = normalizeQuery(rawQuery || "");
        var gcDigits = gcQueryDigits(rawQuery || "");
        var scored = [];
        var i;

        if (!query && gcDigits.length < 4) {
            return { results: [], totalMatches: 0 };
        }

        for (i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (brandFilter && brandFilter.length) {
                if (brandFilter.indexOf(String(entry.brand || "").toLowerCase()) === -1) {
                    continue;
                }
            }
            var score = scoreEntry(entry, query, gcDigits, rawQuery || "");
            if (score !== null) {
                scored.push({ entry: entry, score: score, index: i });
            }
        }

        scored.sort(function (a, b) {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            return a.index - b.index;
        });

        var results = [];
        var limit = Math.min(max, scored.length);
        for (i = 0; i < limit; i++) {
            results.push(scored[i].entry);
        }
        return { results: results, totalMatches: scored.length };
    }

    function markResultsHidden() {
        resultsVisible = false;
        if (searchHistoryPushed) {
            searchHistoryPushed = false;
            history.replaceState(null, "", currentUrl());
        }
    }

    function markResultsVisible() {
        resultsVisible = true;
        if (!searchHistoryPushed) {
            history.pushState({ homeSearchResults: true }, "", currentUrl());
            searchHistoryPushed = true;
        }
    }

    function dismissResults(options) {
        options = options || {};
        var container = document.getElementById("homeSearchResults");

        if (options.clearInput !== false && searchInput) {
            searchInput.value = "";
        }

        if (container) {
            container.hidden = true;
            container.innerHTML = "";
        }

        if (searchHistoryPushed && !options.skipHistory) {
            searchHistoryPushed = false;
            resultsVisible = false;
            history.back();
            return;
        }

        markResultsHidden();
    }

    function renderResults(results, totalMatches, query) {
        var container = document.getElementById("homeSearchResults");
        if (!container) {
            return;
        }

        if (!query) {
            container.hidden = true;
            container.innerHTML = "";
            markResultsHidden();
            return;
        }

        if (indexLoadState === "pending") {
            container.hidden = false;
            container.innerHTML = "<p class=\"home-search-status\">Loading search index…</p>";
            markResultsVisible();
            return;
        }

        if (indexLoadState === "failed") {
            container.hidden = false;
            container.innerHTML =
                "<p class=\"home-search-status\">Search is temporarily unavailable. Please refresh the page.</p>";
            markResultsVisible();
            return;
        }

        if (!results.length) {
            container.hidden = false;
            container.innerHTML =
                "<p class=\"home-search-status\">No manuals found for <strong>" +
                escapeHtml(query) +
                "</strong>. Try a brand name, model, or GC number (e.g. 47-044-87).</p>";
            markResultsVisible();
            return;
        }

        injectResultStyle();
        var html = "<ul class=\"home-search-list\">";
        for (var i = 0; i < results.length; i++) {
            var entry = results[i];
            html += "<li class=\"home-search-item\">";
            html += "<div class=\"home-search-item__main\">";
            html += "<span class=\"home-search-item__brand\">" + escapeHtml(entry.brand) + "</span>";
            if (entry.gc) {
                html += "<span class=\"home-search-item__gc\">" + escapeHtml(entry.gc) + "</span>";
            }
            html += "<span class=\"home-search-item__model\">" + escapeHtml(entry.model) + "</span>";
            html += "</div>";
            if (entry.downloadUrl) {
                html += "<div class=\"home-search-item__actions\">";
                // Show only "View" when the online viewer is available; otherwise
                // fall back to the direct Download link.
                // Visible text stays "View"/"Download"; the model name is added as
                // visually hidden text so the link is descriptive for crawlers and screen readers.
                var docName = fullModelName(entry);
                if (entry.viewUrl) {
                    html += "<a href=\"" + escapeAttr(entry.viewUrl) + "\" title=\"" + escapeAttr("View " + docName + " manual online") +
                        "\">View<span class=\"bm-vh\"> " + escapeHtml(docName) + " manual</span></a>";
                } else {
                    html += "<a href=\"" + escapeAttr(entry.downloadUrl) + "\" title=\"" + escapeAttr(docName + " manual (PDF)") +
                        "\">Download<span class=\"bm-vh\"> " + escapeHtml(docName) + " manual PDF</span></a>";
                }
                html += "</div>";
                // Report goes at the end of the result row, away from View.
                var reportUrl = buildReportUrl(entry);
                if (reportUrl) {
                    html += "<a class=\"report-link home-search-item__report\" rel=\"nofollow\" title=\"Report a wrong or broken link\" href=\"" +
                        escapeAttr(reportUrl) + "\">Report</a>";
                }
            } else {
                html += "<div class=\"home-search-item__actions\">";
                html += "<a href=\"" + escapeAttr(buildRequestUrl(entry)) + "\" rel=\"nofollow\">Request manual</a>";
                html += "</div>";
            }
            html += "</li>";
        }
        html += "</ul>";

        if (totalMatches > results.length) {
            html +=
                "<p class=\"home-search-status\">Showing " +
                results.length +
                " of " +
                totalMatches +
                " matches. Refine your search for more specific results.</p>";
        }

        container.hidden = false;
        container.innerHTML = html;
        markResultsVisible();
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function escapeAttr(value) {
        return escapeHtml(value);
    }

    function injectResultStyle() {
        if (document.getElementById("home-search-report-style")) {
            return;
        }
        var style = document.createElement("style");
        style.id = "home-search-report-style";
        // Model + View on the left, Report pushed to the far end of the row.
        style.textContent =
            ".home-search-item{justify-content:flex-start;align-items:center}" +
            ".home-search-item__main{flex:0 1 auto}" +
            ".home-search-item a.home-search-item__report{margin-left:auto;white-space:nowrap}" +
            ".bm-vh{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important}" +
            "@media screen and (max-width:640px){" +
            ".home-search-item{align-items:stretch;gap:8px}" +
            ".home-search-item a.home-search-item__report{margin-left:0;align-self:flex-end}" +
            "}";
        document.head.appendChild(style);
    }

    function buildReportUrl(entry) {
        injectResultStyle();
        if (!window.BMReport || !window.BMReport.url) {
            return "";
        }
        if (window.BMReport.injectStyle) {
            window.BMReport.injectStyle();
        }
        var page = entry.brandUrl
            ? new URL(entry.brandUrl, window.location.href).href
            : window.location.href.split("#")[0];
        return window.BMReport.url({
            brand: entry.brand,
            model: entry.model,
            gc: entry.gc,
            page: page,
            pdf: entry.downloadUrl
        });
    }

    function fullModelName(entry) {
        // "<Brand> <Model>", without repeating the brand when the model already starts with it.
        var model = String(entry.model || "").replace(/,\s*GC\s.*$/, "").trim();
        var brand = String(entry.brand || "").trim();
        var norm = function (v) { return String(v).toLowerCase().replace(/[^a-z0-9]/g, ""); };
        var first = norm(brand.split(/\s+/)[0] || "");
        if (!model) {
            return brand + (entry.gc ? " GC " + entry.gc : "");
        }
        if (!brand || norm(model).indexOf(norm(brand)) === 0 || (first && norm(model).indexOf(first) === 0)) {
            return model;
        }
        return brand + " " + model;
    }

    function buildRequestUrl(entry) {
        // Same pattern as the brand-page request links: contact.html?request=<GC>-<Brand>-<Model>
        var parts = [];
        if (entry.gc) {
            parts.push(entry.gc);
        }
        var model = String(entry.model || "").replace(/,\s*GC\s.*$/, "");
        var brand = String(entry.brand || "");
        var brandFirstWord = brand.split(/[\s-]+/)[0].toLowerCase();
        if (brand && (!brandFirstWord || model.toLowerCase().indexOf(brandFirstWord) !== 0)) {
            parts.push(brand);
        }
        parts.push(model);
        var request = parts.join("-").replace(/\s+/g, "-");
        return "contact.html?request=" + encodeURIComponent(request);
    }

    function getBrandFilter() {
        if (!searchInput) {
            return null;
        }
        var filter = searchInput.getAttribute("data-brand-filter");
        if (!filter) {
            return null;
        }
        return filter.split(",").map(function (part) {
            return part.trim().toLowerCase();
        }).filter(Boolean);
    }

    function runSearch(rawQuery) {
        var filtered = searchEntries(index, rawQuery, {
            maxResults: maxResults,
            brandFilter: getBrandFilter()
        });
        renderResults(filtered.results, filtered.totalMatches, String(rawQuery || "").trim());
    }

    window.BMHomeSearch = {
        searchEntries: searchEntries,
        maxResults: maxResults
    };

    var indexRequested = false;

    function loadIndex() {
        if (indexRequested) {
            return;
        }
        indexRequested = true;
        return fetch(getIndexUrl())
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("Failed to load search index");
                }
                return response.json();
            })
            .then(function (data) {
                index = data;
                indexLoadState = "loaded";
                if (searchInput && searchInput.value.trim()) {
                    runSearch(searchInput.value);
                }
            })
            .catch(function () {
                indexLoadState = "failed";
                if (searchInput && searchInput.value.trim()) {
                    runSearch(searchInput.value);
                }
            });
    }

    document.addEventListener("DOMContentLoaded", function () {
        searchInput = document.getElementById("homeSearchInput");
        searchSection = document.querySelector(".home-search");
        if (!searchInput) {
            return;
        }

        // Lazy-load the 1 MB search index: only fetch it when the visitor first
        // focuses or types in the search box. If the box already has a value on
        // load (e.g. restored by the browser), fetch it straight away.
        searchInput.addEventListener("focus", loadIndex);
        searchInput.addEventListener("pointerdown", loadIndex);

        // ?q=<term> (used by the WebSite SearchAction): fill the box, load the
        // index immediately and run the search.
        var initialQuery = "";
        try {
            initialQuery = (new URLSearchParams(window.location.search).get("q") || "").trim();
        } catch (e) {
            initialQuery = "";
        }
        if (initialQuery) {
            searchInput.value = initialQuery;
        }
        if (searchInput.value.trim() || document.activeElement === searchInput) {
            loadIndex();
            if (searchInput.value.trim()) {
                runSearch(searchInput.value);
            }
        }

        var timer;
        searchInput.addEventListener("input", function () {
            loadIndex();
            clearTimeout(timer);
            timer = setTimeout(function () {
                runSearch(searchInput.value);
            }, 200);
        });

        searchInput.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                dismissResults({ clearInput: true });
            }
        });

        document.addEventListener("mousedown", function (event) {
            if (!resultsVisible || !searchSection) {
                return;
            }
            if (!searchSection.contains(event.target)) {
                dismissResults({ clearInput: true });
            }
        });

        window.addEventListener("popstate", function () {
            var container = document.getElementById("homeSearchResults");
            var isOpen = resultsVisible || (container && !container.hidden);
            if (!isOpen) {
                return;
            }
            searchHistoryPushed = false;
            resultsVisible = false;
            if (searchInput) {
                searchInput.value = "";
            }
            if (container) {
                container.hidden = true;
                container.innerHTML = "";
            }
        });
    });
})();
