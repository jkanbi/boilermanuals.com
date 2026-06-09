(function () {
    var faultIndex = [];
    var faultLoadState = "pending";
    var knownBrands = [];

    var faultInput = document.getElementById("faultCodeSearch");
    var faultResults = document.getElementById("faultCodeResults");
    var detailPanel = document.getElementById("faultDetailPanel");

    function scriptBaseUrl(filename) {
        var scripts = document.getElementsByTagName("script");
        for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].src;
            if (src && src.indexOf(filename) !== -1) {
                return src.replace(new RegExp(filename + "(?:\\?.*)?$"), "");
            }
        }
        return "js/";
    }

    function normalizeCode(value) {
        return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    function normalizeQuery(value) {
        return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
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

    function buildKnownBrands() {
        var map = {};
        for (var i = 0; i < faultIndex.length; i++) {
            map[faultIndex[i].brand.toLowerCase()] = faultIndex[i].brand;
        }
        knownBrands = Object.keys(map)
            .map(function (key) {
                return map[key];
            })
            .sort(function (a, b) {
                return b.length - a.length;
            });
    }

    function parseFaultQuery(raw) {
        var query = normalizeQuery(raw);
        if (!query) {
            return { brand: "", codeQuery: "", codeNormalized: "" };
        }

        for (var i = 0; i < knownBrands.length; i++) {
            var brand = knownBrands[i];
            var brandLower = brand.toLowerCase();
            if (query === brandLower) {
                return { brand: brand, codeQuery: "", codeNormalized: "" };
            }
            if (query.indexOf(brandLower + " ") === 0) {
                var codePart = query.slice(brandLower.length + 1).trim();
                return {
                    brand: brand,
                    codeQuery: codePart,
                    codeNormalized: normalizeCode(codePart),
                };
            }
        }

        return {
            brand: "",
            codeQuery: query,
            codeNormalized: normalizeCode(query),
        };
    }

    function codeParts(entry) {
        return String(entry.code || "")
            .split(/[,\/\s]+/)
            .map(normalizeCode)
            .filter(Boolean);
    }

    function codeMatches(entry, parsed) {
        if (!parsed.codeNormalized) {
            return false;
        }

        if (entry.codeNormalized === parsed.codeNormalized) {
            return true;
        }

        var parts = codeParts(entry);
        for (var i = 0; i < parts.length; i++) {
            if (parts[i] === parsed.codeNormalized) {
                return true;
            }
        }

        return false;
    }

    function isJunkEntry(entry) {
        var code = entry.code.toLowerCase();
        return code.indexOf("display") !== -1 || code === "main display code";
    }

    function searchFaults(raw) {
        var parsed = parseFaultQuery(raw);
        var matches = [];

        if (!parsed.codeNormalized && !parsed.brand) {
            return matches;
        }

        for (var i = 0; i < faultIndex.length; i++) {
            var entry = faultIndex[i];
            if (isJunkEntry(entry)) {
                continue;
            }
            if (parsed.brand && entry.brand !== parsed.brand) {
                continue;
            }
            if (!parsed.codeNormalized) {
                continue;
            }
            if (codeMatches(entry, parsed)) {
                matches.push(entry);
            }
        }

        return matches;
    }

    function renderFaultResults(matches, raw) {
        if (!faultResults) {
            return;
        }

        if (!raw.trim()) {
            faultResults.hidden = true;
            faultResults.innerHTML = "";
            return;
        }

        if (faultLoadState === "pending") {
            faultResults.hidden = false;
            faultResults.innerHTML = '<p class="home-search-status">Loading fault codes…</p>';
            return;
        }

        if (faultLoadState === "failed") {
            faultResults.hidden = false;
            faultResults.innerHTML =
                '<p class="home-search-status">Fault codes are temporarily unavailable. Please refresh.</p>';
            return;
        }

        if (!matches.length) {
            faultResults.hidden = false;
            faultResults.innerHTML =
                '<p class="home-search-status">No fault codes found for <strong>' +
                escapeHtml(raw.trim()) +
                "</strong>. Try a code like F.28, EA, or E133, optionally with a brand name.</p>";
            return;
        }

        var html = '<ul class="home-search-list">';
        for (var i = 0; i < matches.length; i++) {
            var entry = matches[i];
            html += '<li class="home-search-item fault-code-item">';
            html += '<button type="button" class="fault-code-item__button" data-index="' + i + '">';
            html += '<span class="home-search-item__brand">' + escapeHtml(entry.brand) + "</span>";
            html += '<span class="fault-code-item__code">' + escapeHtml(entry.code) + "</span>";
            if (entry.meaning) {
                html += '<span class="fault-code-item__meaning">' + escapeHtml(entry.meaning) + "</span>";
            }
            html += "</button></li>";
        }
        html += "</ul>";

        faultResults.hidden = false;
        faultResults.innerHTML = html;

        var buttons = faultResults.querySelectorAll(".fault-code-item__button");
        for (var j = 0; j < buttons.length; j++) {
            buttons[j].addEventListener("click", function () {
                var idx = Number(this.getAttribute("data-index"));
                selectFault(matches[idx]);
            });
        }

        if (matches.length === 1) {
            selectFault(matches[0]);
        }
    }

    function selectFault(entry) {
        if (!detailPanel) {
            return;
        }

        var html = '<div class="fault-detail__card">';
        html += '<h2 class="fault-detail__heading">';
        html += escapeHtml(entry.brand) + " — " + escapeHtml(entry.code);
        html += "</h2>";
        if (entry.meaning) {
            html += '<p class="fault-detail__meaning"><strong>Meaning:</strong> ' + escapeHtml(entry.meaning) + "</p>";
        }
        if (entry.cause) {
            html += '<p class="fault-detail__cause"><strong>Possible cause:</strong> ' + escapeHtml(entry.cause) + "</p>";
        }
        html += '<p class="fault-detail__links">';
        if (entry.brandUrl) {
            html += '<a href="' + escapeAttr(entry.brandUrl) + '">Browse ' + escapeHtml(entry.brand) + " manuals</a>";
        }
        if (entry.hubUrl) {
            html += ' · <a href="' + escapeAttr(entry.hubUrl) + '" rel="noopener noreferrer">Full code list on hub.myboiler.com</a>';
        }
        html += "</p></div>";

        detailPanel.innerHTML = html;
        detailPanel.hidden = false;
        detailPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function loadJson(url) {
        return fetch(url).then(function (response) {
            if (!response.ok) {
                throw new Error("Failed to load " + url);
            }
            return response.json();
        });
    }

    function init() {
        var base = scriptBaseUrl("fault-codes.js");

        loadJson(base + "fault-code-index.json")
            .then(function (data) {
                faultIndex = data;
                buildKnownBrands();
                faultLoadState = "loaded";
                if (faultInput && faultInput.value.trim()) {
                    renderFaultResults(searchFaults(faultInput.value), faultInput.value);
                }
            })
            .catch(function () {
                faultLoadState = "failed";
            });

        if (faultInput) {
            faultInput.addEventListener("input", function () {
                if (detailPanel) {
                    detailPanel.hidden = true;
                    detailPanel.innerHTML = "";
                }
                renderFaultResults(searchFaults(faultInput.value), faultInput.value);
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
