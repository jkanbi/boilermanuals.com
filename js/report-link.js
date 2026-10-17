/*
 * "Report" links for wrong or broken manual downloads.
 * Adds a small "Report" link to every #myTable row that has a PDF download,
 * pointing at contact.html?report=1 with the brand, model, GC, page URL and
 * PDF URL prefilled. contact.html turns these into an email to the same
 * address that manual requests already go to.
 * Also exposes window.BMReport.url(details) for the homepage search.
 */
(function () {
    function getBasePath() {
        var scripts = document.getElementsByTagName("script");
        for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].getAttribute("src") || "";
            if (src.indexOf("report-link.js") !== -1) {
                return src.replace(/js\/report-link\.js(?:\?.*)?$/, "");
            }
        }
        return "";
    }

    var basePath = getBasePath();

    function clean(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function buildReportUrl(details) {
        details = details || {};
        var params = ["report=1"];
        var keys = ["brand", "model", "gc", "page", "pdf"];
        for (var i = 0; i < keys.length; i++) {
            var value = clean(details[keys[i]]);
            if (value) {
                params.push(keys[i] + "=" + encodeURIComponent(value));
            }
        }
        return basePath + "contact.html?" + params.join("&");
    }

    function isPdfHref(href) {
        return /\.pdf(?:[?#]|$)/i.test(href || "");
    }

    function headerLabels(table) {
        var cells = table.querySelectorAll("thead th");
        if (!cells.length) {
            cells = table.querySelectorAll("thead td");
        }
        return Array.prototype.map.call(cells, function (cell) {
            return clean(cell.textContent).toLowerCase();
        });
    }

    function findColumn(labels, test) {
        for (var i = 0; i < labels.length; i++) {
            if (labels[i] && test(labels[i])) {
                return i;
            }
        }
        return -1;
    }

    function pageBrand() {
        var heading = document.getElementById("brandPageTitle");
        if (heading && heading.getAttribute("data-brand")) {
            return clean(heading.getAttribute("data-brand"));
        }
        var match = document.title.match(/Boiler Manuals\s*-\s*(.+)$/i);
        return match ? clean(match[1]) : "";
    }

    function injectStyle() {
        if (document.getElementById("report-link-style")) {
            return;
        }
        var style = document.createElement("style");
        style.id = "report-link-style";
        style.textContent =
            ".report-link{margin-left:.6em;font-size:.8em;color:#80868b;font-weight:400;white-space:nowrap}" +
            ".report-link:hover{color:#c5221f}" +
            "#myTable td a.report-link{min-height:0;font-weight:400}";
        document.head.appendChild(style);
    }

    function addRowReportLinks() {
        var table = document.getElementById("myTable");
        if (!table || table.dataset.reportReady === "true") {
            return;
        }

        var labels = headerLabels(table);
        var gcIndex = findColumn(labels, function (l) {
            return /^(g\.?\s*c\.?)(\b|[\s.-])/.test(l) || l === "gc" || l === "id";
        });
        var modelIndex = findColumn(labels, function (l) {
            return l.indexOf("model") !== -1 || l === "description";
        });
        var brand = pageBrand();
        var pageUrl = window.location.href.split("#")[0];
        var added = false;

        Array.prototype.forEach.call(table.querySelectorAll("tbody tr"), function (tr) {
            if (tr.querySelector(".report-link")) {
                return;
            }
            var cells = tr.querySelectorAll("td");
            var pdfLinks = Array.prototype.filter.call(tr.querySelectorAll("a[href]"), function (a) {
                return isPdfHref(a.getAttribute("href"));
            });
            if (!pdfLinks.length) {
                return;
            }

            var model = modelIndex >= 0 && cells[modelIndex] ? clean(cells[modelIndex].textContent) : "";
            var gc = gcIndex >= 0 && cells[gcIndex] ? clean(cells[gcIndex].textContent) : "";
            if (!model) {
                model = clean(tr.textContent.replace(/Download/g, " "));
            }
            var pdfs = pdfLinks.map(function (a) { return a.href; });
            var unique = pdfs.filter(function (u, i) { return pdfs.indexOf(u) === i; });

            var link = document.createElement("a");
            link.className = "report-link";
            link.href = buildReportUrl({
                brand: brand,
                model: model,
                gc: gc,
                page: pageUrl,
                pdf: unique.join(" | ")
            });
            link.textContent = "Report";
            link.title = "Report a wrong or broken link";
            link.setAttribute("rel", "nofollow");

            var last = pdfLinks[pdfLinks.length - 1];
            last.parentNode.insertBefore(link, last.nextSibling);
            last.parentNode.insertBefore(document.createTextNode(" "), link);
            added = true;
        });

        if (added) {
            injectStyle();
        }
        table.dataset.reportReady = "true";
    }

    window.BMReport = {
        url: buildReportUrl,
        injectStyle: injectStyle
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", addRowReportLinks);
    } else {
        addRowReportLinks();
    }
})();
