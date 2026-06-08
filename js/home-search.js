(function () {
    var index = [];
    var indexLoadState = "pending";
    var maxResults = 40;
    var searchInput = null;
    var searchSection = null;
    var resultsVisible = false;
    var searchHistoryPushed = false;
    var autoDismissTimer = null;
    var autoDismissMs = 10000;

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

    function entryMatches(entry, query, gcDigits, rawQuery) {
        if (!query && !gcDigits) {
            return false;
        }

        var gcStyleInput = isGcStyleInput(rawQuery);

        if (gcStyleInput && gcDigits.length >= 4 && gcDigitsMatch(entry, gcDigits)) {
            return true;
        }

        var brand = entry.brand.toLowerCase();
        var model = entry.model.toLowerCase();
        var gc = entry.gc.toLowerCase();

        if (query) {
            if (!gcStyleInput && (brand.indexOf(query) !== -1 || model.indexOf(query) !== -1)) {
                return true;
            }
            if (gc && gc.indexOf(query) !== -1) {
                return true;
            }
        }

        if (gcDigits.length >= 4 && gcDigitsMatch(entry, gcDigits)) {
            return true;
        }

        return false;
    }

    function clearAutoDismissTimer() {
        if (autoDismissTimer) {
            clearTimeout(autoDismissTimer);
            autoDismissTimer = null;
        }
    }

    function scheduleAutoDismiss() {
        clearAutoDismissTimer();
        autoDismissTimer = setTimeout(function () {
            dismissResults({ clearInput: true, skipHistory: true });
        }, autoDismissMs);
    }

    function markResultsHidden() {
        resultsVisible = false;
        clearAutoDismissTimer();
        if (searchHistoryPushed) {
            searchHistoryPushed = false;
            history.replaceState(null, "");
        }
    }

    function markResultsVisible() {
        resultsVisible = true;
        if (!searchHistoryPushed) {
            history.pushState({ homeSearchResults: true }, "");
            searchHistoryPushed = true;
        }
        scheduleAutoDismiss();
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
            clearAutoDismissTimer();
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
            html += "</div><div class=\"home-search-item__actions\">";
            if (entry.downloadUrl) {
                html += "<a href=\"" + escapeAttr(entry.downloadUrl) + "\">Download</a>";
            }
            html += "<a href=\"" + escapeAttr(entry.brandUrl) + "\">" + escapeHtml(entry.brand) + " page</a>";
            html += "</div></li>";
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

    function runSearch(rawQuery) {
        var query = normalizeQuery(rawQuery);
        var gcDigits = gcQueryDigits(rawQuery);
        var matches = [];
        var totalMatches = 0;

        if (!query && gcDigits.length < 4) {
            renderResults([], 0, rawQuery.trim());
            return;
        }

        for (var i = 0; i < index.length; i++) {
            if (entryMatches(index[i], query, gcDigits, rawQuery)) {
                totalMatches += 1;
                if (matches.length < maxResults) {
                    matches.push(index[i]);
                }
            }
        }

        renderResults(matches, totalMatches, rawQuery.trim());
    }

    function loadIndex() {
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

        loadIndex();

        var timer;
        searchInput.addEventListener("input", function () {
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

        searchInput.addEventListener("focus", function () {
            if (resultsVisible) {
                scheduleAutoDismiss();
            }
        });

        var resultsContainer = document.getElementById("homeSearchResults");
        if (resultsContainer) {
            resultsContainer.addEventListener("mousedown", function () {
                if (resultsVisible) {
                    scheduleAutoDismiss();
                }
            });
        }

        document.addEventListener("mousedown", function (event) {
            if (!resultsVisible || !searchSection) {
                return;
            }
            if (!searchSection.contains(event.target)) {
                dismissResults({ clearInput: true });
            }
        });

        window.addEventListener("popstate", function () {
            if (!resultsVisible) {
                return;
            }
            searchHistoryPushed = false;
            resultsVisible = false;
            clearAutoDismissTimer();
            if (searchInput) {
                searchInput.value = "";
            }
            var container = document.getElementById("homeSearchResults");
            if (container) {
                container.hidden = true;
                container.innerHTML = "";
            }
        });
    });
})();
